import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavController, ActionSheetController, AlertController, ToastController, ActionSheetButton } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService, PlaybackState } from '../../services/media-player.service';
import { DeezerService, DeezerTrack } from '../../services/deezer.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  currentMode = 'all';
  recentlyPlayed: Track[] = [];
  playlists: Playlist[] = [];
  trendingTracks: DeezerTrack[] = [];
  loadingTrending = false;
  trendingError = false;
  currentPlaybackState: PlaybackState | null = null;
  
  private tracksSubscription: Subscription | null = null;
  private playlistsSubscription: Subscription | null = null;
  private playbackSubscription: Subscription | null = null;
  constructor(
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private deezerService: DeezerService,
    private navCtrl: NavController,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private toastController: ToastController
  ) {} 
  ionViewWillEnter() {
    // Refresh recently played tracks when entering the home page
    this.dataService.refreshRecentlyPlayed();
    
    // Only load trending tracks if we don't have any yet
    if (this.trendingTracks.length === 0 && !this.loadingTrending) {
      this.loadTrendingTracks();
    }
  }
  
  ngOnInit() {
    // Subscribe to recently played tracks using the observable
    this.tracksSubscription = this.dataService.recentlyPlayed$.subscribe(recentTracks => {
      this.recentlyPlayed = recentTracks;
      this.modeChanged();
    });
    
    this.playlistsSubscription = this.dataService.playlists$.subscribe(playlists => {
      this.playlists = playlists;
    });
    
    // Subscribe to playback state
    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.currentPlaybackState = state;
    });
  }

  ngOnDestroy() {
    if (this.tracksSubscription) {
      this.tracksSubscription.unsubscribe();
    }
    
    if (this.playlistsSubscription) {
      this.playlistsSubscription.unsubscribe();
    }
    
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
    }
  }

  // Load trending tracks from Deezer
  loadTrendingTracks() {
    this.loadingTrending = true;
    this.trendingError = false;
    
    this.deezerService.getTrendingTracks().subscribe(
      tracks => {
        this.trendingTracks = tracks.slice(0, 10); // Limit to 10 tracks
        this.loadingTrending = false;
        console.log('Loaded trending tracks:', this.trendingTracks);
      },
      error => {
        console.error('Failed to load trending tracks:', error);
        this.trendingError = true;
        this.loadingTrending = false;
      }
    );
  }  // Play a trending track
  async playTrendingTrack(track: DeezerTrack) {
    try {
      const trackToPlay: Track = {
        id: `deezer-${track.id}`,
        title: track.title,
        artist: track.artist?.name || 'Unknown Artist',
        album: track.album?.title || 'Unknown Album',
        duration: track.duration,
        imageUrl: track.album?.cover_medium || 'assets/placeholder-album.png',
        previewUrl: track.preview,
        spotifyId: '',
        liked: false,
        isLocal: false,
        source: 'stream',
        addedAt: new Date().toISOString(),
        pathOrUrl: track.preview,
        artwork: track.album?.cover_medium || null,
        type: 'mp3'
      };

      // First ensure the track is saved to the database correctly
      await this.saveTrackIfNeeded(trackToPlay);
      
      // Use the play method to play the track directly
      await this.mediaPlayerService.play(trackToPlay);
      
      // Navigate to player after successfully starting playback
      this.navCtrl.navigateForward('/player');
      
      this.showToast(`Playing "${track.title}"`);
    } catch (error) {
      console.error('Error playing trending track:', error);
      this.showToast('Could not play track', 'danger');
    }
  }// Save a track if it doesn't exist in the database
  private async saveTrackIfNeeded(track: Track): Promise<void> {
    try {
      const allTracks = await this.dataService.getAllTracks();
      const existingTrack = allTracks.find(t => t.id === track.id);
      
      if (!existingTrack) {
        // Add new track
        const updatedTracks = [...allTracks, track];
        await this.dataService.saveTracks(updatedTracks);
        console.log('Saved new track to database:', track.title);
      } else if (existingTrack.source !== 'stream' || !existingTrack.artwork) {
        // Update existing track with more complete information if needed
        const updatedTrack: Track = {
          ...existingTrack,
          source: 'stream',
          artwork: track.artwork || existingTrack.artwork,
          imageUrl: track.imageUrl || existingTrack.imageUrl,
          previewUrl: track.previewUrl || existingTrack.previewUrl
        };
        
        const updatedTracks = allTracks.map(t => 
          t.id === track.id ? updatedTrack : t
        );
        
        await this.dataService.saveTracks(updatedTracks);
        console.log('Updated existing track in database:', track.title);
      } else {
        console.log('Track already exists in database:', track.title);
      }
    } catch (error) {
      console.error('Error saving track:', error);
      throw error; // Re-throw to handle in calling function
    }
  }
  refreshRecentlyPlayed(event: any) {
    this.dataService.refreshRecentlyPlayed().then(() => {
      // Only reload trending tracks if requested with the refresh control
      if (event) {
        this.loadTrendingTracks();
        event.target.complete();
      }
    });
  }

  modeChanged() {
    if (this.currentMode === 'all') {
      // No filtering needed
    } else if (this.currentMode === 'local') {
      this.recentlyPlayed = this.recentlyPlayed.filter(track => track.source === 'local');
    } else if (this.currentMode === 'streaming') {
      this.recentlyPlayed = this.recentlyPlayed.filter(track => track.source === 'stream');
    }
  }  

  async playTrack(track: Track) {
    try {
      // Update recently played through data service
      await this.dataService.addToRecentlyPlayed(track.id);
      
      // Play the track (no need to manually refresh recently played list)
      this.mediaPlayerService.setQueue([track], 0);
    } catch (error) {
      console.error('Error playing track:', error);
    }
  }

  openPlaylist(playlist: Playlist) {
    this.navCtrl.navigateForward(`/tabs/playlist/${playlist.id}`);
  }
  navigateToUploads() {
    this.navCtrl.navigateForward('/tabs/uploads');
  }

  navigateToSearch() {
    this.navCtrl.navigateForward('/tabs/search');
  }
  // No need for reversedRecentlyPlayed getter since we want newest first

  getFirstTrackArtwork(playlist: Playlist): string {
    const firstTrack = this.recentlyPlayed.find(track => track.id === playlist.trackIds[0]);
    return firstTrack?.artwork || firstTrack?.imageUrl || 'assets/placeholder-playlist.png';
  }
  async presentActionSheet() {
    const buttons: ActionSheetButton[] = [
      {
        text: 'Upload Music',
        handler: () => {
          this.navigateToUploads();
          return true;
        }
      },
      {
        text: 'Search Music',
        handler: () => {
          this.navigateToSearch();
          return true;
        }
      },
      {
        text: 'Your Library',
        handler: () => {
          this.navCtrl.navigateForward('/tabs/library');
          return true;
        }
      },
      {
        text: 'Create Playlist',
        handler: () => {
          this.navCtrl.navigateForward('/tabs/library');
          // We'll need to implement this properly with the DataService
          return true;
        }
      },
      {
        text: 'Cancel',
        role: 'cancel'
      }
    ];
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Options',
      buttons
    });
    
    await actionSheet.present();
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
  async togglePlayTrack(track: Track): Promise<void> {
    if (this.currentPlaybackState?.currentTrack?.id === track.id) {
      // The track is already the current track, toggle play/pause
      this.mediaPlayerService.togglePlay();
    } else {
      // It's a different track, start playing it
      await this.playTrack(track);
    }
  }
  getTimeAgo(timestamp: string): string {
    const now = new Date();
    const played = new Date(timestamp);
    const diff = now.getTime() - played.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return days === 1 ? 'Yesterday' : `${days} days ago`;
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else if (minutes > 0) {
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    } else {
      return 'Just now';
    }
  }
  // Add a trending track to a playlist
  async addTrackToPlaylist(track: DeezerTrack) {
    try {
      // First convert the Deezer track to our Track format
      const trackToAdd: Track = {
        id: `deezer-${track.id}`,
        title: track.title,
        artist: track.artist?.name || 'Unknown Artist',
        album: track.album?.title || 'Unknown Album',
        duration: track.duration,
        imageUrl: track.album?.cover_medium || 'assets/placeholder-album.png',
        previewUrl: track.preview,
        spotifyId: '',
        liked: false,
        isLocal: false,
        source: 'stream',
        addedAt: new Date().toISOString(),
        pathOrUrl: track.preview,
        artwork: track.album?.cover_medium || null,
        type: 'mp3'
      };

      // Make sure the track is saved first
      await this.saveTrackIfNeeded(trackToAdd);
      
      // Get all playlists to show in action sheet
      const playlists = await this.dataService.getAllPlaylists();
      
      if (playlists.length === 0) {
        // No playlists yet, ask to create one
        this.createCustomPlaylistWithTrack(trackToAdd);
        return;
      }
      
      // Create buttons for each playlist
      const buttons: ActionSheetButton[] = playlists.map(playlist => ({
        text: playlist.name,
        handler: async () => {
          try {
            // Ensure track is in collection before adding to playlist
            const allTracks = await this.dataService.getAllTracks();
            const trackExists = allTracks.some(t => t.id === trackToAdd.id);
            
            if (!trackExists) {
              console.log('Track not in collection, saving it first...');
              await this.saveTrackIfNeeded(trackToAdd);
            }
            
            await this.dataService.addTrackToPlaylist(playlist.id, trackToAdd.id);
            this.showToast(`Added to playlist: ${playlist.name}`);
            return true;
          } catch (error) {
            console.error('Error adding to playlist:', error);
            this.showToast('Failed to add to playlist', 'danger');
            return false;
          }
        }
      }));      // Add buttons for creating new playlists
      buttons.push(
        {
          text: 'Create New Playlist',
          handler: async () => {
            try {
              // Ensure track is in collection before creating playlist
              const allTracks = await this.dataService.getAllTracks();
              const trackExists = allTracks.some(t => t.id === trackToAdd.id);
              
              if (!trackExists) {
                console.log('Track not in collection, saving it first...');
                await this.saveTrackIfNeeded(trackToAdd);
              }
              
              this.createCustomPlaylistWithTrack(trackToAdd);
              return true;
            } catch (error) {
              console.error('Error preparing to create playlist:', error);
              this.showToast('Failed to prepare track', 'danger');
              return false;
            }
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      );
      
      const actionSheet = await this.actionSheetController.create({
        header: 'Add to Playlist',
        buttons
      });

      await actionSheet.present();
    } catch (error) {
      console.error('Error preparing to add track to playlist:', error);
      this.showToast('Failed to prepare track', 'danger');
    }
  }
  // Create a custom playlist with a track
  async createCustomPlaylistWithTrack(track: Track) {
    try {
      // Ensure track is in collection before continuing
      await this.saveTrackIfNeeded(track);
      
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
                this.showToast('Please enter a playlist name', 'warning');
                return false;
              }
              
              try {
                // Create the playlist with custom name
                const playlist = await this.dataService.createPlaylist(data.name, data.description);
                
                // Verify track exists in collection before adding to playlist
                const allTracks = await this.dataService.getAllTracks();
                if (!allTracks.some(t => t.id === track.id)) {
                  console.log('Track not found in collection, saving it again...');
                  await this.saveTrackIfNeeded(track);
                }
                
                // Add the track to the playlist
                await this.dataService.addTrackToPlaylist(playlist.id, track.id);
                
                this.showToast(`Created playlist: ${data.name}`);
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
    } catch (error) {
      console.error('Error preparing to create playlist:', error);
      this.showToast('Failed to prepare track', 'danger');
    }
  }

  // Helper method to show toast messages
  async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });
    await toast.present();
  }
}
