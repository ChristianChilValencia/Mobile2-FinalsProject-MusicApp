import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, ToastController, NavController, AlertController } from '@ionic/angular';
import { DeezerService } from '../../services/deezer.service';
import { MediaPlayerService, PlaybackState } from '../../services/media-player.service';
import { DataService } from '../../services/data.service';
import { Track, Playlist } from '../../services/data.service';
import { finalize } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false
})
export class SearchPage implements OnInit, OnDestroy {
  searchQuery = '';
  searchResults: Track[] = [];
  isLoading = false;
  errorMessage = '';
  playlists: Playlist[] = [];
  currentPlaybackState: PlaybackState | null = null;
  private playbackSubscription: Subscription | null = null;
  constructor(
    private deezerService: DeezerService,
    private mediaPlayerService: MediaPlayerService,
    private dataService: DataService,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController,
    private alertController: AlertController,
    private navCtrl: NavController
  ) {}
  ngOnInit() {
    this.loadPlaylists();
    
    // Subscribe to playback state changes
    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.currentPlaybackState = state;
    });
  }

  ngOnDestroy() {
    // Clean up subscription when component is destroyed
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
      this.playbackSubscription = null;
    }
  }

  async loadPlaylists() {
    this.playlists = await this.dataService.getAllPlaylists();
  }

  searchChanged() {
    if (this.searchQuery.trim().length === 0) {
      this.searchResults = [];
      return;
    }

    if (this.searchQuery.trim().length < 3) {
      return; // Wait for at least 3 characters
    }

    this.performSearch();
  }

  performSearch() {
    this.isLoading = true;
    this.errorMessage = '';

    this.deezerService.search(this.searchQuery)
      .pipe(
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe(
        (results) => {
          this.searchResults = results;
        },
        (error) => {
          console.error('Search error:', error);
          this.errorMessage = 'An error occurred while searching. Please try again.';
          this.searchResults = [];
        }
      );
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.errorMessage = '';
  }

  playTrack(track: Track) {
    this.mediaPlayerService.setQueue([track], 0);
  }

  async showAddToPlaylistOptions(track: Track) {
    // Refresh playlists first
    await this.loadPlaylists();

    const buttons: any[] = this.playlists.map(playlist => {
      return {
        text: playlist.name,
        handler: () => {
          this.addTrackToPlaylist(track, playlist.id);
        }
      };
    });    // Add options to create new playlists
    buttons.unshift({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        this.createArtistMixWithTrack(track);
      }
    });
    
    buttons.unshift({
      text: 'Create Playlist',
      handler: () => {
        this.createCustomPlaylistWithTrack(track);
      }
    });

    // Add cancel button
    buttons.push({
      text: 'Cancel',
      // icon: 'close', // Remove or comment out the icon property
      role: 'cancel'
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Add to Playlist',
      buttons
    });

    await actionSheet.present();
  }

  async addTrackToPlaylist(track: Track, playlistId: string) {
    try {
      // First, make sure the track is saved in our data service
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.dataService.saveLocalMusic(track, filePath);
      
      // Then add it to the playlist
      await this.dataService.addTrackToPlaylist(playlistId, track.id);
        const toast = await this.toastController.create({
        message: `Added to playlist`,
        duration: 2000,
        position: 'top'
      });
      
      await toast.present();
    } catch (error) {
      console.error('Error adding to playlist:', error);
        const toast = await this.toastController.create({
        message: 'Failed to add to playlist',
        duration: 2000,
        position: 'top',
        color: 'danger'
      });
      
      await toast.present();
    }
  }
  async createArtistMixWithTrack(track: Track) {
    // Create a mix based on the artist
    const newPlaylistName = `${track.artist}'s Mix`;
    
    try {
      // Create the playlist
      const playlist = await this.dataService.createPlaylist(newPlaylistName);
      
      // Save the track and add it to the playlist
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.dataService.saveLocalMusic(track, filePath);
      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
        const toast = await this.toastController.create({
        message: `Created artist mix: ${newPlaylistName}`,
        duration: 2000,
        position: 'top'
      });
      
      await toast.present();
    } catch (error) {
      console.error('Error creating artist mix:', error);
        const toast = await this.toastController.create({
        message: 'Failed to create artist mix',
        duration: 2000,
        position: 'top',
        color: 'danger'
      });
      
      await toast.present();
    }
  }

  async createCustomPlaylistWithTrack(track: Track) {
    // Show an alert for custom playlist name
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
              const toast = await this.toastController.create({
                message: 'Please enter a playlist name',
                duration: 2000,
                position: 'top',
                color: 'warning'
              });
              await toast.present();
              return false;
            }
            
            try {
              // Create the playlist with custom name
              const playlist = await this.dataService.createPlaylist(data.name, data.description);
              
              // Save the track and add it to the playlist
              const filePath = track.pathOrUrl || track.previewUrl;
              await this.dataService.saveLocalMusic(track, filePath);
              await this.dataService.addTrackToPlaylist(playlist.id, track.id);
              
              const toast = await this.toastController.create({
                message: `Created playlist: ${data.name}`,
                duration: 2000,
                position: 'top'
              });
              await toast.present();
              return true;
            } catch (error) {
              console.error('Error creating playlist:', error);
              const toast = await this.toastController.create({
                message: 'Failed to create playlist',
                duration: 2000,
                position: 'top',
                color: 'danger'
              });
              await toast.present();
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  async presentActionSheet() {
    const buttons = [
      {
        text: 'Upload Music',
        icon: 'cloud-upload',
        handler: () => {
          this.navigateToPage('/tabs/uploads');
          return true;
        }
      },
      {
        text: 'Your Library',
        icon: 'library',
        handler: () => {
          this.navigateToPage('/tabs/library');
          return true;
        }
      },
      {
        text: 'Home',
        icon: 'home',
        handler: () => {
          this.navigateToPage('/tabs/home');
          return true;
        }
      },
      {
        text: 'Cancel',
        icon: 'close',
        role: 'cancel'
      }
    ];
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Options',
      buttons
    });
    
    await actionSheet.present();
  }
    navigateToPage(page: string) {
    this.navCtrl.navigateForward(page);
  }
  // Check if a track is currently playing
  isCurrentlyPlaying(track: Track): boolean {
    if (!this.currentPlaybackState) return false;
    
    return (
      this.currentPlaybackState.isPlaying && 
      this.currentPlaybackState.currentTrack?.id === track.id
    );
  }
  
  // Toggle play/pause for a track
  togglePlayTrack(track: Track): void {
    if (!this.currentPlaybackState) return;
    
    if (this.currentPlaybackState.currentTrack?.id === track.id) {
      // The track is already the current track, toggle play/pause
      this.mediaPlayerService.togglePlay();
    } else {
      // It's a different track, start playing it
      this.playTrack(track);
    }
  }
}
