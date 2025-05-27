import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, LoadingController, Platform } from '@ionic/angular';
import { MediaPlayerService } from '../../services/media-player.service';
import { Track } from '../../models/track.model';
import { DataService as LocalDataService } from '../../local-services/data.service';
import { ConfigService } from '../../local-services/config.service';
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
  // Local music state
  localMusic: Track[] = [];  isDarkMode = false;
  private settingsSub?: Subscription;

  // Slider configuration
  slideOpts = {
    slidesPerView: 'auto',
    spaceBetween: 20,
    freeMode: true,
    pagination: false
  };

  constructor(
    public audioService: MediaPlayerService,
    private dataService: LocalDataService,
    private configService: ConfigService,
    public router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    // Settings subscription
    this.settingsSub = this.configService.settings$.subscribe(s => {
      this.isDarkMode = s.darkMode;
      document.body.setAttribute('color-theme', s.darkMode ? 'dark' : 'light');
    });
    await this.dataService.ensureInit();
    await this.refreshLocalMusic();
  }

  ngOnDestroy() {
    this.settingsSub?.unsubscribe();
  }

  // Format time for display
  formatTime(time: number | null): string {
    if (time === null) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  private async refreshLocalMusic() {
    try {      // Get local tracks
      const localTracks = await this.dataService.getLocalTracks();
      this.localMusic = localTracks;
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
    return true; // In web, permissions work differently
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
          
          // Only show success toast for single file uploads
          if (files.length === 1) {
            const okToast = await this.toastCtrl.create({
              message: `"${track.title}" uploaded successfully!`,
              duration: 1500,
              position: 'bottom',
              color: 'success'
            });
            await okToast.present();
          }
        } catch (error) {
          results.failed++;
          console.error('Error processing file:', error);
          
          // Show detailed error for single file uploads
          if (files.length === 1) {
            const errMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const errToast = await this.toastCtrl.create({
              message: `Error uploading ${file.name}: ${errMessage}`,
              duration: 3000,
              position: 'bottom',
              color: 'danger'
            });
            await errToast.present();
          }
        }
      }

      // Show summary toast for multiple files
      if (files.length > 1) {
        const summaryToast = await this.toastCtrl.create({
          message: `Upload complete: ${results.success} succeeded, ${results.failed} failed`,
          duration: 3000,
          position: 'bottom',
          color: results.failed ? 'warning' : 'success'
        });
        await summaryToast.present();
      }

      // Refresh the local music list to show the new tracks
      await this.refreshLocalMusic();

      // If we have successful uploads and it was a single file, start playing it
      if (successfulTracks.length === 1 && files.length === 1) {
        this.playTrack(successfulTracks[0]);
      }

    } catch (error) {
      console.error('Error in upload process:', error);
      const errToast = await this.toastCtrl.create({
        message: 'Error uploading files',
        duration: 3000,
        position: 'bottom',
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
      await this.router.navigate(['/player']);
    } catch (error) {
      console.error('Error playing track:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to play track',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    }
  }
}