import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, ToastController, NavController, AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { MediaPlayerService } from '../../services/media-player.service';
import { DataService, PlaybackState, Track } from '../../services/data.service';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  standalone: false
})
export class PlayerPage implements OnInit, OnDestroy {
  playbackState: PlaybackState | null = null;
  playbackSubscription: Subscription | null = null;
  isShuffleOn = false;
  seekValue: number = 0;
  isShuffleActive: boolean = false;  
  
  constructor(
    private mediaPlayerService: MediaPlayerService,
    private dataService: DataService,
    private navCtrl: NavController,
  ) {}

  ngOnInit() {    
    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnDestroy() {
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
      this.playbackSubscription = null;
    }
  }

  togglePlay() {
    this.mediaPlayerService.togglePlay();
  }
  
  onSeekChange(event: any) {
    if (!this.playbackState?.currentTrack) return;
    
    const newPosition = event.detail.value;
    const duration = this.playbackState.duration || 0;
    
    const limitedPosition = Math.min(newPosition, duration);
    this.mediaPlayerService.seek(limitedPosition);
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }

  async addToPlaylist(track: Track) {
    await this.dataService.showAddToPlaylistOptions(track);
  }
  
  skipForward() {
    if (this.playbackState && this.playbackState.currentTrack) {
      const newPosition = Math.min(
        this.playbackState.currentTime + 5,
        this.playbackState.duration || 0
      );
      this.mediaPlayerService.seek(newPosition);
    }
  }

  skipBackward() {
    if (this.playbackState && this.playbackState.currentTrack) {
      const newPosition = Math.max(this.playbackState.currentTime - 5, 0);
      this.mediaPlayerService.seek(newPosition);
    }
  }

  next() {
    this.mediaPlayerService.next();
  }
  
  previous() {
    this.mediaPlayerService.previous();
  }

  closePlayer() {
    this.navCtrl.back();
  }

  addCurrentTrackToPlaylist() {
    if (this.playbackState && this.playbackState.currentTrack) {
      this.dataService.showAddToPlaylistOptions(this.playbackState.currentTrack);
    } else {
      this.dataService.showToast('No track is currently playing', 'warning');
    }
  }
  
  async createNewPlaylistWithTrack(track: Track) {
    await this.dataService.createCustomPlaylistWithTrack(track);
  }
}