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
  sourceFilter: string = 'all';
  currentPlaybackState: PlaybackState | null = null;
  private playbackSubscription: Subscription | null = null;
  
  private async loadPlaylistArtwork(playlist: Playlist) {
    if (playlist.trackIds.length > 0) {
      const firstTrack = await this.dataService.getTrack(playlist.trackIds[0]);
      if (firstTrack) {
        this.playlistArtwork[playlist.id] = firstTrack.artwork || firstTrack.imageUrl || 'assets/placeholder-playlist.png';
      }
    }
  }

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
      const [tracks, playlists] = await Promise.all([
        this.dataService.getAllTracks(),
        this.dataService.getAllPlaylists()
      ]);
      
      this.tracks = tracks;
      this.playlists = playlists;
      
      await Promise.all(playlists.map(playlist => this.loadPlaylistArtwork(playlist)));
    } catch (error) {
      console.error('Error loading library data:', error);
      this.showToast('Failed to load library', 'danger');
    } finally {
      this.isLoading = false;
    }
  }  
  
  async playTrack(track: Track) {
    try {
      const trackToSave = {
        ...track,
        addedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(),
        source: track.source || (track.id.startsWith('deezer-') ? 'stream' : 'local') // Ensure source is set
      };

      const allTracks = await this.dataService.getAllTracks();
      let existingTrack = allTracks.find(t => t.id === track.id);
      
      if (!existingTrack) {
        console.log(`Saving new track ${track.id} to collection before playing`);
        await this.dataService.saveTracks([...allTracks, trackToSave]);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const verifyTracks = await this.dataService.getAllTracks();
        existingTrack = verifyTracks.find(t => t.id === track.id);
        
        if (!existingTrack) {
          console.error('Track failed to save to collection');
          throw new Error('Failed to save track to collection');
        }
        
        console.log('Successfully saved track to collection');
      }
      
      await this.mediaPlayerService.play(existingTrack || trackToSave);
    } catch (error) {
      console.error('Error playing track:', error);
      this.showToast('Failed to play track', 'danger');
    }
  }

  playAllTracks() {
    if (this.filteredTracks.length > 0) {
      this.mediaPlayerService.setQueue(this.filteredTracks, 0);
    }
  }

  async addToPlaylist(track: Track) {
    // Check if there are any playlists
    if (this.playlists.length === 0) {
      const alert = await this.alertController.create({
        header: 'No Playlists',
        message: 'You haven\'t created any playlists yet. Would you like to create one?',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: 'Create Playlist',
            handler: () => {
              this.createPlaylistWithTrack(track);
              return true;
            }
          }
        ]
      });
      
      await alert.present();
      return;
    }
    
    // Show action sheet with playlist options
    const buttons = this.playlists.map(playlist => {
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
      // Add create options
    buttons.unshift({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        this.createArtistMixWithTrack(track);
        return true;
      }
    });
    
    buttons.unshift({
      text: 'Create Playlist',
      handler: () => {
        this.createPlaylistWithTrack(track);
        return true;
      }
    });
    
    // Add cancel button
    buttons.push({
      text: 'Cancel',
      // role: 'cancel',
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

  async createPlaylistWithTrack(track: Track) {
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
          handler: async (data) => {
            if (!data.name || data.name.trim() === '') {
              this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            try {
              const playlist = await this.dataService.createPlaylist(data.name, data.description);
              await this.dataService.addTrackToPlaylist(playlist.id, track.id);
              this.showToast(`Added to ${playlist.name}`);
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
  }

  async deleteTrack(track: Track) {
    const alert = await this.alertController.create({
      header: 'Confirm Delete',
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
    
    if (this.selectedSegment === 'songs' && this.filteredTracks.length > 0) {
      buttons.push({
        text: 'Play All',
        handler: () => {
          this.playAllTracks();
          return true;
        }
      });
    }
    
    buttons.push({
      text: 'Cancel',
      // role: 'cancel',
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

  isCurrentlyPlaying(track: Track): boolean {
    if (!this.currentPlaybackState) return false;
    
    return (
      this.currentPlaybackState.isPlaying && 
      this.currentPlaybackState.currentTrack?.id === track.id
    );
  }
  
  togglePlayTrack(track: Track): void {
    if (this.currentPlaybackState?.currentTrack?.id === track.id) {
      this.mediaPlayerService.togglePlay();
    } else {
      this.playTrack(track);
    }
  }

  async createArtistMixWithTrack(track: Track) {
    const artistName = track.artist || 'My';
    const playlistName = `${artistName}'s Mix`;
    
    try {
      const playlist = await this.dataService.createPlaylist(playlistName);

      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
      
      this.showToast(`Created artist mix: ${playlistName}`);
      this.loadData();
      
      return true;
    } catch (error) {
      console.error('Error creating artist mix:', error);
      this.showToast('Failed to create artist mix', 'danger');
      return false;
    }
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
