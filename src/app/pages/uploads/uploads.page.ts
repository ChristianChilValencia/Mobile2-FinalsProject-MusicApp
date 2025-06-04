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
      const toast = await this.toastCtrl.create({
        message: 'Music library refreshed',
        duration: 2000,
        position: 'top',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error refreshing library:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to refresh music library',
        duration: 2000,
        position: 'top',
        color: 'danger'
      });
      await toast.present();
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
      const toast = await this.toastCtrl.create({
        message: 'Permission denied to access files',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
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
      const toast = await this.toastCtrl.create({
        message: 'Failed to play track',
        duration: 2000,
        position: 'top',
        color: 'danger'
      });
      await toast.present();
    }
  }

  isCurrentlyPlaying(track: Track): boolean {
    if (!this.currentPlaybackState) return false;
    
    return (
      this.currentPlaybackState.isPlaying && 
      this.currentPlaybackState.currentTrack?.id === track.id
    );
  } 
  
  async togglePlayTrack(track: Track): Promise<void> {
    try {
      if (this.currentPlaybackState && this.currentPlaybackState.currentTrack?.id === track.id) {
        await this.audioService.togglePlay();
      } else {
        await this.playTrack(track);
      }
    } catch (error) {
      console.error('Error toggling play state:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to play track',
        duration: 2000,
        position: 'top',
        color: 'danger'
      });
      await toast.present();
    }
  }

  async addToPlaylist(track: Track) {
    // Get all playlists
    const playlists = await this.dataService.getAllPlaylists();
    
    const buttons = [];
    
    // Add create playlist and artist mix options
    buttons.push({
      text: 'Create Playlist',
      handler: () => {
        this.createCustomPlaylist(track);
        return true;
      }
    });
    
    buttons.push({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        this.createArtistMix(track);
        return true;
      }
    });
    
    // Add existing playlists
    if (playlists.length > 0) {
      playlists.forEach(playlist => {
        buttons.push({
          text: playlist.name,
          handler: () => {
            this.dataService.addTrackToPlaylist(playlist.id, track.id)
              .then(() => this.showToast(`Added to ${playlist.name}`))
              .catch(err => this.showToast('Failed to add to playlist', 'danger'));
            return true;
          }
        });
      });
    }

    buttons.push({
      text: 'Cancel',
      role: 'cancel',
      handler: () => {
        return true;
      }
    });
    
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Add to Playlist',
      buttons
    });
    
    await actionSheet.present();
  }  
  
  async createCustomPlaylist(track: Track) {
    const alert = await this.alertCtrl.create({
      header: 'New Playlist',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Enter playlist name'
        },
        {
          name: 'description',
          type: 'text',
          placeholder: 'Description (optional)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Create',
          handler: async (data) => {
            if (!data.name || data.name.trim() === '') {
              this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            try {
              // Create the playlist with custom name
              const playlist = await this.dataService.createPlaylist(data.name, data.description);
              
              // Add the track to the playlist
              await this.dataService.addTrackToPlaylist(playlist.id, track.id);
              
              this.showToast(`Created playlist: ${data.name}`);
              return true;
            } catch (error) {
              console.error('Error creating playlist:', error);
              this.showToast('Failed to create playlist', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
    return false;
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
            try {
              await this.dataService.removeTrack(track.id);
              this.showToast('Track deleted');
              await this.refreshLocalMusic();
              return true;
            } catch (error) {
              console.error('Error deleting track:', error);
              this.showToast('Failed to delete track', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  async createArtistMix(track: Track) {
    try {
      const artistName = track.artist || 'My';
      const mixName = `${artistName}'s Mix`;
      
      const playlist = await this.dataService.createPlaylist(mixName);
      
      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
      
      this.showToast(`Created artist mix: ${mixName}`);
      
      return true;
    } catch (error) {
      console.error('Error creating artist mix:', error);
      this.showToast('Failed to create artist mix', 'danger');
      return false;
    }
  }

  async showToast(message: string, color: string = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });
    
    await toast.present();
  }
}