import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  Platform
} from '@ionic/angular';
import { MediaPlayerService } from '../../services/media-player.service';
import { Track } from '../../services/data.service';
import { DataService } from '../../local-services/data.service';
import { ConfigService } from '../../local-services/config.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { adaptLocalTrackToMainTrack } from '../../utils/track-adapter';

@Component({
  selector: 'app-home',
  templateUrl: './local-home.page.html',
  styleUrls: ['./local-home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  // Local music state
  localMusic: Track[] = [];
  isDarkMode = false;
  private settingsSub?: Subscription;

  constructor(
    public audioService: MediaPlayerService,
    private dataService: DataService,
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
    try {
      const localTracks = await this.dataService.getLocalTracks();
      // Convert local tracks to main app track format
      this.localMusic = localTracks.map(track => adaptLocalTrackToMainTrack(track));
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

  openFileSelector() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    const loading = await this.loadingCtrl.create({ message: 'Uploading music…' });
    await loading.present();

    try {
      for (const file of files) {
        // We need to adapt the local track to the main app format before adding it
        const localTrack = await this.audioService.addLocalTrack(file);
        const mainTrack = adaptLocalTrackToMainTrack(localTrack);
        
        const okToast = await this.toastCtrl.create({
          message: `"${mainTrack.title}" uploaded successfully!`,
          duration: 1500,
          position: 'bottom',
          color: 'success'
        });
        await okToast.present();
      }
      await this.refreshLocalMusic();
    } catch (error) {
      console.error('Error uploading file:', error);
      const errToast = await this.toastCtrl.create({
        message: 'Error uploading some files.',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await errToast.present();
    } finally {
      input.value = '';
      loading.dismiss();
    }
  }
  playTrack(track: Track) {
    // When a track is played, it's integrated with the main player service
    this.audioService.play(track);
  }
}