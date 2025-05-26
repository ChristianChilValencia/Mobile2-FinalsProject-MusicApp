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
import { MediaPlayerService, Track } from '../../local-services/media-player.service';
import { DataService } from '../../local-services/data.service';
import { ConfigService } from '../../local-services/config.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

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

  // Mini-player status and touch gesture variables
  hideMiniPlayer = false;
  isClosing = false;
  slideOffset = 0;
  touchStartY = 0;
  dismissThreshold = 80;

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
    this.hideMiniPlayer = false;
    this.slideOffset = 0;
  }

  ngOnDestroy() {
    this.settingsSub?.unsubscribe();
  }

  // Add methods for interacting with the player 
  togglePlay() {
    this.audioService.togglePlay();
  }

  seekTrack(position: number) {
    this.audioService.seek(position);
  }

  onRangeChange(event: any) {
    const value = event.detail.value;
    if (typeof value === 'number') {
      this.seekTrack(value);
    } else if (value && typeof value.lower === 'number') {
      this.seekTrack(value.lower);
    }
  }

  // Format time for mini-player
  formatTime(time: number | null): string {
    if (time === null) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  // Touch gesture methods for mini-player
  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    event.stopPropagation();
  }

  onTouchMove(event: TouchEvent) {
    const touchY = event.touches[0].clientY;
    const deltaY = touchY - this.touchStartY;
    if (deltaY >= 0) {
      this.slideOffset = deltaY;
    } else {
      this.slideOffset = 0;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  async onTouchEnd(event: TouchEvent) {
    if (this.slideOffset > this.dismissThreshold) {
      this.isClosing = true;
      try {
        await this.audioService.pause();
        const toast = await this.toastCtrl.create({
          message: 'Playback stopped',
          duration: 1500,
          position: 'bottom',
          color: 'medium'
        });
        await toast.present();
        setTimeout(() => {
          this.hideMiniPlayer = true;
          this.isClosing = false;
        }, 300);
      } catch (error) {
        console.error('Error stopping playback:', error);
      }
    } else {
      this.slideOffset = 0;
    }
    event.stopPropagation();
  }

  private async refreshLocalMusic() {
    try {
      this.localMusic = await this.dataService.getLocalTracks();
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
        const track = await this.audioService.addLocalTrack(file);
        const okToast = await this.toastCtrl.create({
          message: `"${track.title}" uploaded successfully!`,
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
    this.hideMiniPlayer = false;
    this.slideOffset = 0;
    this.audioService.play(track);
  }
}