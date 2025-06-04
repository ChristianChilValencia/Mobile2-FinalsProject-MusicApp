import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, AlertController, NavController, ToastController } from '@ionic/angular';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService, PlaybackState } from '../../services/media-player.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-library',
  templateUrl: './library.page.html',
  styleUrls: ['./library.page.scss'],
  standalone: false
})
export class LibraryPage implements OnInit, OnDestroy {  playlistArtwork: { [key: string]: string } = {};
  tracks: Track[] = [];
  playlists: Playlist[] = [];
  filteredTracks: Track[] = [];
  selectedSegment: string = 'playlists';
  isLoading: boolean = true;
  currentPlaybackState: PlaybackState | null = null;
  private playbackSubscription: Subscription | null = null;

  constructor(
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private navController: NavController,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private toastController: ToastController
  ) {}
  ngOnInit() {
    this.loadData();
    
    this.dataService.tracks$.subscribe(tracks => {
      this.tracks = tracks;
    });
    
    this.dataService.playlists$.subscribe(playlists => {
      this.playlists = playlists;
    });

    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.currentPlaybackState = state;
    });
  }

  ngOnDestroy() {
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
      this.playbackSubscription = null;
    }
  }  
  
  ionViewWillEnter() {
    console.log('Library page - entering view');
    this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    try {
      const [playlists] = await Promise.all([
        this.dataService.getAllPlaylists()
      ]);
      
      this.playlists = playlists;
      
      await Promise.all(playlists.map(playlist => this.loadPlaylistArtwork(playlist)));
    } catch (error) {
      console.error('Error loading library data:', error);
      this.showToast('Failed to load library', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPlaylistArtwork(playlist: Playlist) {
    if (playlist.trackIds.length > 0) {
      const firstTrack = await this.dataService.getTrack(playlist.trackIds[0]);
      if (firstTrack) {
        this.playlistArtwork[playlist.id] = firstTrack.artwork || firstTrack.imageUrl || 'assets/placeholder-playlist.png';
      }
    }
  }

  async createPlaylist() {
    const alert = await this.alertController.create({
      header: 'New Playlist',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Playlist Name'
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
          handler: (data) => {
            if (!data.name || data.name.trim() === '') {
              this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            this.dataService.createPlaylist(data.name, data.description)
              .then(() => this.showToast(`Playlist "${data.name}" created`))
              .catch(err => {
                console.error('Error creating playlist:', err);
                this.showToast('Failed to create playlist', 'danger');
              });
            return true;
          }
        }
      ]
    });
    
    await alert.present();
  }

  openPlaylist(playlist: Playlist) {
    this.navController.navigateForward(`/tabs/playlist/${playlist.id}`);
  }

  navigateToUploads() {
    this.navController.navigateForward('/tabs/uploads');
  }

  navigateToSearch() {
    this.navController.navigateForward('/tabs/search');
  }

  async presentActionSheet() {
    const buttons = [
      {
        text: 'Create Playlist',
        handler: () => {
          this.createPlaylist();
          return true;
        }
      },      {
        text: 'Upload Music',
        handler: () => {
          this.navigateToUploads();
          return true;
        }
      }
    ];
    
    buttons.push({
      text: 'Cancel',
      handler: () => {
        return true;
      }
    });
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Library Options',
      buttons
    });
    
    await actionSheet.present();
  }

  async deletePlaylist(playlist: Playlist, event: Event) {
    // Stop event propagation to prevent opening the playlist
    event.stopPropagation();
    
    const alert = await this.alertController.create({
      header: 'Confirm Delete',
      message: `Are you sure you want to delete the playlist "${playlist.name}"?`,
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
              await this.dataService.deletePlaylist(playlist.id);
              this.showToast('Playlist deleted');
              return true;
            } catch (error) {
              console.error('Error deleting playlist:', error);
              this.showToast('Failed to delete playlist', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }  
  
  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });
    
    await toast.present();
  }

  async refreshLibrary(event?: any) {
    try {
      await this.loadData();
      
      if (event) {
        event.target.complete();
      }
    } catch (error) {
      console.error('Error refreshing library:', error);
      if (event) {
        event.target.complete();
      }    }
  }
}
