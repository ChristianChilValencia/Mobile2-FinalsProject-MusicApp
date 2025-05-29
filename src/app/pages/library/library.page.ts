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
  recentTracks: Track[] = [];
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
    // Initialize with data from local storage
    this.loadData();
    
    // Subscribe to updates
    this.dataService.tracks$.subscribe(tracks => {
      this.tracks = tracks;
      this.applyFilter();
    });
    
    this.dataService.playlists$.subscribe(playlists => {
      this.playlists = playlists;
    });

    // Subscribe to recently played updates
    this.dataService.recentlyPlayed$.subscribe(recentTracks => {
      this.recentTracks = recentTracks;
      if (this.sourceFilter !== 'all') {
        this.recentTracks = recentTracks.filter(track => 
          track.source === this.sourceFilter
        );
      }
    });
    
    // Subscribe to playback state
    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.currentPlaybackState = state;
    });
  }

  ngOnDestroy() {
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
      this.playbackSubscription = null;
    }
  }  ionViewWillEnter() {
    console.log('Library page - entering view');
    // Refresh data each time the page is shown
    this.loadData();
    
    // Force refresh the recently played tracks when entering the page
    this.dataService.refreshRecentlyPlayed().then(() => {
      console.log('Recently played tracks refreshed on page enter');
      // Refresh the current tab
      if (this.selectedSegment === 'songs') {
        this.refreshHistory();
      } else if (this.selectedSegment === 'recents') {
        this.refreshRecents();
      }
    });
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
      
      // Load artwork for all playlists
      await Promise.all(playlists.map(playlist => this.loadPlaylistArtwork(playlist)));
      
      this.applyFilter();
    } catch (error) {
      console.error('Error loading library data:', error);
      this.showToast('Failed to load library', 'danger');
    } finally {
      this.isLoading = false;
    }
  }  segmentChanged(event: any = null) {
    if (event) {
      this.selectedSegment = event.detail.value;
    }
    
    // Handle tab changes
    if (this.selectedSegment === 'songs') {
      this.refreshHistory();
    } else if (this.selectedSegment === 'recents') {
      this.refreshRecents();
    } else {
      this.applyFilter();
    }
  }applyFilter() {
    // For the "History" view, we want to show only tracks that have been played
    if (this.selectedSegment === 'songs') {
      // Start with all tracks that have been played (have a lastPlayed timestamp)
      this.filteredTracks = this.tracks.filter(track => track.lastPlayed);
      
      // Apply source filter if not 'all'
      if (this.sourceFilter === 'local') {
        this.filteredTracks = this.filteredTracks.filter(track => track.source === 'local');
      } else if (this.sourceFilter === 'stream') {
        this.filteredTracks = this.filteredTracks.filter(track => track.source === 'stream');
      }
        // Sort by last played date, most recent first
      this.filteredTracks.sort((a, b) => {
        if (a.lastPlayed && b.lastPlayed) {
          return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
        }
        return 0; // Should never happen since we filtered for lastPlayed above
      });
    } else {
      // For other views, show all tracks
      this.filteredTracks = [...this.tracks];
      
      // Apply source filter if not 'all'
      if (this.sourceFilter === 'local') {
        this.filteredTracks = this.filteredTracks.filter(track => track.source === 'local');
      } else if (this.sourceFilter === 'stream') {
        this.filteredTracks = this.filteredTracks.filter(track => track.source === 'stream');
      }
      
      // Sort by title
      this.filteredTracks.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
    }
  }    filterBySource(source: string) {
    this.sourceFilter = source;
    
    // Handle recents tab separately
    if (this.selectedSegment === 'recents') {
      // Refresh recents with new filter
      this.refreshRecents();
    } else {
      // For other tabs, use the normal filter
      this.applyFilter();
    }
  }  async playTrack(track: Track) {
    try {
      // Prepare track for saving with all required fields
      const trackToSave = {
        ...track,
        addedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(), // Set initial lastPlayed
        source: track.source || (track.id.startsWith('deezer-') ? 'stream' : 'local') // Ensure source is set
      };

      // Get latest tracks and check if exists
      const allTracks = await this.dataService.getAllTracks();
      let existingTrack = allTracks.find(t => t.id === track.id);
      
      if (!existingTrack) {
        console.log(`Saving new track ${track.id} to collection before playing`);
        await this.dataService.saveTracks([...allTracks, trackToSave]);
        
        // Wait a moment for any async operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify the track was saved by getting fresh data
        const verifyTracks = await this.dataService.getAllTracks();
        existingTrack = verifyTracks.find(t => t.id === track.id);
        
        if (!existingTrack) {
          console.error('Track failed to save to collection');
          throw new Error('Failed to save track to collection');
        }
        
        console.log('Successfully saved track to collection');
      }
      
      // Play the verified track
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
  }  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });
    
    await toast.present();
  }
  
  formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
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
    if (this.currentPlaybackState?.currentTrack?.id === track.id) {
      // The track is already the current track, toggle play/pause
      this.mediaPlayerService.togglePlay();
    } else {
      // It's a different track, start playing it
      this.playTrack(track);
    }
  }
  async createArtistMixWithTrack(track: Track) {
    // Create a mix based on the artist
    const artistName = track.artist || 'My';
    const playlistName = `${artistName}'s Mix`;
    
    try {
      // Create the playlist
      const playlist = await this.dataService.createPlaylist(playlistName);
      
      // Add the track to the playlist
      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
      
      this.showToast(`Created artist mix: ${playlistName}`);
      
      // Refresh playlists after creating a new one
      this.loadData();
      
      return true;
    } catch (error) {
      console.error('Error creating artist mix:', error);
      this.showToast('Failed to create artist mix', 'danger');
      return false;
    }
  }
  // Method to refresh history when needed
  async refreshHistory() {
    try {
      console.log('Library page - Refreshing history');
      
      // Force refresh the recently played tracks
      await this.dataService.refreshRecentlyPlayed();
      
      // Reload all tracks to ensure we have the latest data
      const tracks = await this.dataService.getAllTracks();
      this.tracks = tracks;
      
      console.log('Library page - Got', tracks.length, 'total tracks');
      console.log('Library page - Tracks with lastPlayed:', tracks.filter(t => t.lastPlayed).length);
      
      // Apply filter to update the filteredTracks array with history
      this.applyFilter();
      
      console.log('History refreshed with', 
        this.filteredTracks.filter(track => track.lastPlayed).length, 
        'recently played tracks');
    } catch (error) {
      console.error('Error refreshing history:', error);
    }
  }

  // Method to refresh recently played tracks
  async refreshRecents() {
    try {
      console.log('Library page - Refreshing recent tracks');
      
      // Force refresh the recently played tracks
      await this.dataService.refreshRecentlyPlayed();
      
      // Get the recent tracks directly from the data service
      const recentTracks = await this.dataService.getRecentlyPlayedTracks();
      
      // Apply source filter
      if (this.sourceFilter === 'local') {
        this.recentTracks = recentTracks.filter(track => track.source === 'local');
      } else if (this.sourceFilter === 'stream') {
        this.recentTracks = recentTracks.filter(track => track.source === 'stream');
      } else {
        this.recentTracks = recentTracks;
      }
      
      console.log('Recent tracks refreshed with', this.recentTracks.length, 'tracks');
    } catch (error) {
      console.error('Error refreshing recent tracks:', error);
      this.showToast('Failed to refresh recent tracks', 'danger');
    }
  }

  // Method to remove a track from the recently played list
  async removeFromRecents(track: Track) {
    try {
      // Get the current recently played IDs
      const recentIds = await this.dataService.get('recently_played') || [];
      
      // Remove the track ID from the list
      const updatedIds = recentIds.filter((id: string) => id !== track.id);
      
      // Save the updated list
      await this.dataService.set('recently_played', updatedIds);
      
      // Refresh the recents view
      await this.refreshRecents();
      
      this.showToast(`Removed "${track.title}" from recent tracks`);
    } catch (error) {
      console.error('Error removing track from recents:', error);
      this.showToast('Failed to remove track from recents', 'danger');
    }
  }

  // Helper method to display relative time
  getTimeAgo(timestamp?: string): string {
    if (!timestamp) return 'Unknown time';
    
    const now = new Date();
    const playedDate = new Date(timestamp);
    const diffMs = now.getTime() - playedDate.getTime();
    
    // Convert to appropriate time unit
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 30) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      // Format date for older items
      return playedDate.toLocaleDateString();
    }
  }

  // Handle pull-to-refresh
  async refreshLibrary(event?: any) {
    try {
      await this.loadData();
      
      if (this.selectedSegment === 'songs') {
        await this.refreshHistory();
      } else if (this.selectedSegment === 'recents') {
        await this.refreshRecents();
      }
      
      if (event) {
        event.target.complete();
      }
    } catch (error) {
      console.error('Error refreshing library:', error);
      if (event) {
        event.target.complete();
      }
    }
  }

  // Debug function to check stored history
  async debugHistory() {
    try {
      // Get the raw recently played IDs from storage
      const recentlyPlayedIds = await this.dataService.get('recently_played') || [];
      
      // Get all tracks
      const allTracks = await this.dataService.getAllTracks();
      
      let message = `Recently played IDs: ${recentlyPlayedIds.length}\n`;
      message += `Total tracks: ${allTracks.length}\n`;
      message += `Tracks with lastPlayed: ${allTracks.filter(t => t.lastPlayed).length}\n`;
      
      // Show debug info in alert
      const alert = await this.alertController.create({
        header: 'History Debug Info',
        message,
        buttons: ['OK']
      });
      
      await alert.present();
      
      console.log('Debug info:', message);
    } catch (error) {
      console.error('Error in debugHistory:', error);
    }
  }
}
