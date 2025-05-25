import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, ToastController, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { MediaPlayerService } from '../../services/media-player.service';
import { DataService, PlaybackState, Track, RepeatMode } from '../../services/data.service';
import { trigger, state, style, animate, transition } from '@angular/animations';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  standalone: false,
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class PlayerPage implements OnInit, OnDestroy {
  playbackState: PlaybackState | null = null;
  playbackSubscription: Subscription | null = null;
  isShuffleOn = false;
  repeatMode: RepeatMode = RepeatMode.None;
  // Make RepeatMode accessible in the template
  RepeatMode = RepeatMode;
  
  // Add missing properties
  seekValue: number = 0;
  volumeValue: number = 1;
  isShuffleActive: boolean = false;
  constructor(
    private mediaPlayerService: MediaPlayerService,
    private dataService: DataService,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.playbackSubscription = this.mediaPlayerService.playbackState$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnDestroy() {
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
      this.playbackSubscription = null;
    }
  }

  play() {
    this.mediaPlayerService.play();
  }

  pause() {
    this.mediaPlayerService.pause();
  }

  togglePlay() {
    this.mediaPlayerService.togglePlay();
  }

  nextTrack() {
    this.mediaPlayerService.next();
  }
  previousTrack() {
    this.mediaPlayerService.previous();
  }

  onSeekChange(event: any) {
    const newPosition = event.detail.value;
    this.mediaPlayerService.seek(newPosition);
  }

  onVolumeChange(event: any) {
    const newVolume = event.detail.value;
    this.mediaPlayerService.setVolume(newVolume);
  }
  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }
  toggleShuffle() {
    this.isShuffleOn = !this.isShuffleOn;
    this.mediaPlayerService.setShuffle(this.isShuffleOn);
    
    if (this.isShuffleOn) {
      this.showToast('Shuffle on');
    } else {
      this.showToast('Shuffle off');
    }
  }
  
  toggleRepeat() {
    if (this.repeatMode === RepeatMode.None) {
      this.repeatMode = RepeatMode.All;
      this.showToast('Repeat all');
    } else if (this.repeatMode === RepeatMode.All) {
      this.repeatMode = RepeatMode.One;
      this.showToast('Repeat one');
    } else {
      this.repeatMode = RepeatMode.None;
      this.showToast('Repeat off');
    }
    
    // Update the media player service
    this.mediaPlayerService.setRepeatMode(this.repeatMode);
  }
  async presentOptions() {
    if (!this.playbackState || !this.playbackState.currentTrack) return;
    
    const track = this.playbackState.currentTrack;
    
    const buttons = [
      {
        text: 'Add to Playlist',
        handler: () => {
          this.addToPlaylist(track);
          return true;
        }
      },
      {
        text: 'View Artist',
        handler: () => {
          // TODO: Implement artist view
          this.showToast('Artist view not implemented yet');
          return true;
        }
      },      {
        text: 'View Album',
        handler: () => {
          // TODO: Implement album view
          this.showToast('Album view not implemented yet');
          return true;
        }
      },
      {
        text: 'Cancel',
        handler: () => {
          return true;
        }
      }
    ];
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Options',
      buttons
    });
    
    await actionSheet.present();
  }  /**
   * Add a specified track to playlist
   */
  async addToPlaylist(track: Track) {
    const playlists = await this.dataService.getAllPlaylists();
    
    if (playlists.length === 0) {
      this.showToast('You don\'t have any playlists yet. Create one in the Library tab.');
      return;
    }
    
    const buttons = playlists.map(playlist => {
      return {
        text: playlist.name,
        handler: () => {
          this.dataService.addTrackToPlaylist(playlist.id, track.id)
            .then(() => this.showToast(`Added to ${playlist.name}`))
            .catch(err => this.showToast('Failed to add to playlist', 'danger'));
          return true;
        }
      };
    });
    
    // Add create new playlist option
    buttons.unshift({
      text: 'Create New Playlist',
      handler: () => {
        // TODO: Implement create playlist with track
        this.showToast('Create playlist not implemented yet');
        return true;
      }
    });
    
    // Add cancel button
    buttons.push({
      text: 'Cancel',
      handler: () => {
        return true;
      }
    });
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Add to Playlist',
      buttons
    });
    
    await actionSheet.present();
  }
  /**
   * Skip forward 5 seconds
   */
  skipForward() {
    if (this.playbackState && this.playbackState.currentTime !== undefined) {
      const newPosition = Math.min(
        this.playbackState.currentTime + 5,
        this.playbackState.duration || 0
      );
      this.mediaPlayerService.seek(newPosition);
    }
  }

  /**
   * Skip backward 5 seconds
   */
  skipBackward() {
    if (this.playbackState && this.playbackState.currentTime !== undefined) {
      const newPosition = Math.max(this.playbackState.currentTime - 5, 0);
      this.mediaPlayerService.seek(newPosition);
    }
  }

  // Add missing methods
  next() {
    this.mediaPlayerService.next();
  }
  
  previous() {
    this.mediaPlayerService.previous();
  }
  closePlayer() {
    // Navigate back
    this.navCtrl.back();
  }
  
  showOptions() {
    this.presentOptions();
  }
  
  onSeekEnd() {
    // Handle seek end event
    console.log('Seek end not implemented');
  }
  
  playTrackAtIndex(index: number) {
    // Play track at specific index in the queue
    if (index >= 0 && this.playbackState && this.playbackState.queue.length > index) {
      this.mediaPlayerService.setQueue(this.playbackState.queue, index);
    }
  }  /**
   * Add current track to playlist - called from the UI
   */
  addCurrentTrackToPlaylist() {
    if (this.playbackState && this.playbackState.currentTrack) {
      this.addToPlaylist(this.playbackState.currentTrack);
    } else {
      this.showToast('No track is currently playing', 'warning');
    }
  }

  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color
    });
    
    await toast.present();
  }
}