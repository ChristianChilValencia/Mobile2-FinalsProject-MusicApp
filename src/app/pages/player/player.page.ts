import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, ToastController, NavController, AlertController } from '@ionic/angular';
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
  isShuffleActive: boolean = false;  constructor(
    private mediaPlayerService: MediaPlayerService,
    private dataService: DataService,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController,
    private navCtrl: NavController,
    private alertController: AlertController
  ) {}

  ngOnInit() {    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
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
  }  onSeekChange(event: any) {
    if (!this.playbackState?.currentTrack) return;
    
    const newPosition = event.detail.value;
    const duration = this.playbackState.duration || 0;
    
    // Ensure the position is within the track duration
    const limitedPosition = Math.min(newPosition, duration);
    this.mediaPlayerService.seek(limitedPosition);
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
   */  async addToPlaylist(track: Track) {
    const playlists = await this.dataService.getAllPlaylists();
    
    // Always show the action sheet, even if there are no playlists
    const buttons = [];
    
    // Add create playlist and artist mix options at the top
    buttons.push({
      text: 'Create Playlist',
      handler: () => {
        setTimeout(() => {
          this.createNewPlaylistWithTrack(track);
        }, 100);
        return true;
      }
    });
    
    buttons.push({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        const artistName = track.artist || 'My';
        const mixName = `${artistName}'s Mix`;
        
        this.dataService.createPlaylist(mixName)
          .then(playlist => {
            return this.dataService.addTrackToPlaylist(playlist.id, track.id)
              .then(() => {
                this.showToast(`Created "${mixName}" with this track`);
              });
          })
          .catch(err => {
            console.error('Error creating mix:', err);
            this.showToast('Failed to create mix', 'danger');
          });
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
  }  /**
   * Skip forward 5 seconds
   */
  skipForward() {
    if (this.playbackState && this.playbackState.currentTrack) {
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
    if (this.playbackState && this.playbackState.currentTrack) {
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
      position: 'top',
      color
    });
    
    await toast.present();
  }  /**
   * Create a new playlist with the current track
   */
  async createNewPlaylistWithTrack(track: Track) {
    const alert = await this.alertController.create({
      header: 'Create New Playlist',
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
          handler: (data: {name: string, description?: string}) => {
            if (!data.name || data.name.trim() === '') {
              this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            this.dataService.createPlaylist(data.name.trim(), data.description?.trim())
              .then(playlist => {
                return this.dataService.addTrackToPlaylist(playlist.id, track.id)
                  .then(() => {
                    this.showToast(`Added to ${playlist.name}`);
                  });
              })
              .catch(error => {
                console.error('Error creating playlist:', error);
                this.showToast('Failed to create playlist', 'danger');
              });
            return true;
          }
        }
      ]
    });
    
    await alert.present();
  }
}