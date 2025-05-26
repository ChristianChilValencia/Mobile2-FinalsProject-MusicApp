import { Component, OnInit, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, LoadingController, Platform} from '@ionic/angular';
import { MediaPlayerService } from '../../services/media-player.service';
import { Track } from '../../services/data.service';
import { DataService as LocalDataService } from '../../local-services/data.service';
import { ConfigService } from '../../local-services/config.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { adaptLocalTrackToMainTrack } from '../../utils/track-adapter';

interface UploadStatus {
  file: File;
  status: string;
  progress: number;
}

@Component({
  selector: 'app-uploads',
  templateUrl: './uploads.page.html',
  styleUrls: ['./uploads.page.scss'],
  standalone: false
})
export class UploadsPage implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  recentlyAddedTracks: Track[] = [];
  pendingUploads: UploadStatus[] = [];
  private settingsSub?: Subscription;

  constructor(
    private audioService: MediaPlayerService,
    private dataService: LocalDataService,
    private configService: ConfigService,
    private router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    await this.dataService.ensureInit();
    await this.loadRecentlyAddedTracks();
  }

  ngOnDestroy() {
    this.settingsSub?.unsubscribe();
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

  openFileSelector() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    const loading = await this.loadingCtrl.create({ 
      message: files.length > 1 ? `Uploading ${files.length} files...` : 'Uploading file...',
    });
    await loading.present();

    const results: { success: number; failed: number } = { success: 0, failed: 0 };

    try {
      for (const file of files) {
        const uploadStatus: UploadStatus = {
          file,
          status: 'Starting...',
          progress: 0
        };
        this.pendingUploads.push(uploadStatus);
        
        try {
          // Use the MediaPlayerService to upload the file and get a track
          const track = await this.audioService.addLocalTrack(file);
          results.success++;
          
          // Add to recently added tracks
          this.recentlyAddedTracks = [track, ...this.recentlyAddedTracks].slice(0, 10);
          
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
        } finally {
          // Remove from pending uploads
          this.pendingUploads = this.pendingUploads.filter(u => u.file !== file);
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

      await this.loadRecentlyAddedTracks();

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

  private async loadRecentlyAddedTracks() {
    try {
      const localTracks = await this.dataService.getLocalTracks();
      // Convert local tracks to main track format
      const tracks = localTracks.map(track => adaptLocalTrackToMainTrack(track));
      this.recentlyAddedTracks = tracks
        .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
        .slice(0, 10);
    } catch (error) {
      console.error('Error loading recently added tracks:', error);
    }
  }
}
