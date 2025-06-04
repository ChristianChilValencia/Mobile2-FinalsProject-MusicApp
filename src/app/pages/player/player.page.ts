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
    const playlists = await this.dataService.getAllPlaylists();
    const buttons = [];

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
        
        const filePath = track.pathOrUrl || track.previewUrl;
        this.dataService.saveLocalMusic(track, filePath)
          .then(() => {
            return this.dataService.createPlaylist(mixName);
          })
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
    
    if (playlists.length > 0) {
      playlists.forEach(playlist => {
        buttons.push({
          text: playlist.name,
          handler: () => {
            const filePath = track.pathOrUrl || track.previewUrl;
            this.dataService.saveLocalMusic(track, filePath)
              .then(() => this.dataService.addTrackToPlaylist(playlist.id, track.id))
              .then(() => this.showToast(`Added to ${playlist.name}`))
              .catch(err => this.showToast('Failed to add to playlist', 'danger'));
            return true;
          }
        });
      });
    }
    
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