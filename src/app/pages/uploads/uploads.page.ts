import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, LoadingController, Platform, ActionSheetController, AlertController } from '@ionic/angular';
import { MediaPlayerService } from '../../services/media-player.service';
import { DataService as LocalDataService, Track } from '../../services/data.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Component({
  selector: 'app-uploads',
  templateUrl: './uploads.page.html',
  styleUrls: ['./uploads.page.scss'],
  standalone: false
})
export class UploadsPage implements OnInit, OnDestroy {  
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  localMusic: Track[] = [];  
  private settingsSub?: Subscription;
  private playbackSubscription: Subscription | null = null;
  currentPlaybackState: any = null;

  constructor(
    public audioService: MediaPlayerService,
    private dataService: LocalDataService,
    public router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    this.playbackSubscription = this.audioService.getPlaybackState().subscribe(state => {
      this.currentPlaybackState = state;
    });

    await this.dataService.ensureInit();
    await this.refreshLocalMusic();
  }

  ngOnDestroy() {
    this.settingsSub?.unsubscribe();
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
      this.playbackSubscription = null;
    }
  }
  async doRefresh(event: any) {
    try {
      await this.refreshLocalMusic();
      await this.dataService.showToast('Music library refreshed');
    } catch (error) {
      console.error('Error refreshing library:', error);
      await this.dataService.showToast('Failed to refresh music library', 'danger');
    } finally {
      if (event) {
        event.target.complete();
      }
    }
  }
  
  private async refreshLocalMusic() {
    try {
      const allTracks = await this.dataService.getAllTracks();
      const localTracks = allTracks.filter(track => track.source === 'local' && track.isLocal === true);
      
      this.localMusic = localTracks.sort((a, b) => {
        const dateA = new Date(a.addedAt || 0).getTime();
        const dateB = new Date(b.addedAt || 0).getTime();
        return dateB - dateA; 
      });
      
      return this.localMusic;
    } catch (error) {
      console.error('Error refreshing local music:', error);
      throw error;
    }
  }

  async requestAudioPermissions() {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.requestPermissions();
        return true;
      } catch (e) {
        console.error('Error requesting permissions:', e);
        return false;
      }
    }
    return true; 
  }
  async openFileSelector() {
    const hasPermissions = await this.requestAudioPermissions();
    if (!hasPermissions) {
      await this.dataService.showToast('Permission denied to access files', 'danger');
      return;
    }
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    const loading = await this.loadingCtrl.create({ 
      message: files.length > 1 ? `Uploading ${files.length} files...` : 'Uploading file...',
    });
    await loading.present();    const results: { success: number; failed: number } = { success: 0, failed: 0 };
    const successfulTracks: Track[] = [];

    try {
      for (const file of files) {
        try {
          const track = await this.audioService.addLocalTrack(file);          
          results.success++;
          successfulTracks.push(track);
        } catch (error) {
          results.failed++;
          console.error('Error processing file:', error);
          if (files.length === 1) {
            const errMessage = error instanceof Error ? error.message : 'Unknown error occurred';            const errToast = await this.toastCtrl.create({
              message: `Error uploading ${file.name}: ${errMessage}`,
              duration: 3000,
              position: 'top',
              color: 'danger'
            });
            await errToast.present();
          }
        }
      }

      if (files.length > 1) {        
        const summaryToast = await this.toastCtrl.create({
          message: `Upload complete: ${results.success} succeeded, ${results.failed} failed`,
          duration: 3000,
          position: 'top',
          color: results.failed ? 'warning' : 'success'
        });
        await summaryToast.present();
      }
      await this.refreshLocalMusic();
    } catch (error) {
      console.error('Error in upload process:', error);
      const errToast = await this.toastCtrl.create({
        message: 'Error uploading files',
        duration: 3000,
        position: 'top',
        color: 'danger'
      });
      await errToast.present();
    } finally {
      await loading.dismiss();
      input.value = '';
    }
  }  
  async playTrack(track: Track) {
    try {
      await this.audioService.setQueue([track], 0);
      await this.router.navigate(['tabs/player']);
    } catch (error) {
      console.error('Error playing track:', error);
      await this.dataService.showToast('Failed to play track', 'danger');
    }
  }
  isCurrentlyPlaying(track: Track): boolean {
    return this.audioService.isCurrentlyPlaying(track);
  }
    async togglePlayTrack(track: Track): Promise<void> {
    try {
      await this.audioService.togglePlayTrack(track);
      if (!this.currentPlaybackState?.isPlaying) {
        await this.router.navigate(['tabs/player']);
      }
    } catch (error) {
      console.error('Error toggling play state:', error);
      await this.dataService.showToast('Failed to play track', 'danger');
    }
  }
  async addToPlaylist(track: Track) {
    await this.dataService.showAddToPlaylistOptions(track);
  }
    async createCustomPlaylist(track: Track) {
    await this.dataService.createCustomPlaylistWithTrack(track);
  }
  
  async deleteTrack(track: Track) {
    const alert = await this.alertCtrl.create({
      header: 'Delete Track',
      message: `Are you sure you want to delete "${track.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {              await this.dataService.removeTrack(track.id);
              await this.dataService.showToast('Track deleted');
              await this.refreshLocalMusic();
              return true;
            } catch (error) {
              console.error('Error deleting track:', error);
              await this.dataService.showToast('Failed to delete track', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }  async createArtistMix(track: Track) {
    await this.dataService.createArtistMixWithTrack(track);
  }
}