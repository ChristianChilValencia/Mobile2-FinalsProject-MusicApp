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
export class HomePage implements OnInit, OnDestroy {  currentMode = 'all';
  playlists: Playlist[] = [];
  trendingTracks: DeezerTrack[] = [];
  exploreTracks: DeezerTrack[] = [];
  loadingTrending = false;
  trendingError = false;
  loadingExplore = false;
  exploreError = false;
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
    if (this.trendingTracks.length === 0 && !this.loadingTrending) {
      this.loadTrendingTracks();
    }
    
    if (this.exploreTracks.length === 0 && !this.loadingExplore) {
      this.loadExploreTracks();
    }
  }
  
  ngOnInit() {
    this.playlistsSubscription = this.dataService.playlists$.subscribe(playlists => {
      this.playlists = playlists;
    });
    
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

  loadTrendingTracks() {
    this.loadingTrending = true;
    this.trendingError = false;
    
    this.deezerService.getTrendingTracks().subscribe(
      tracks => {
        this.trendingTracks = tracks.slice(0, 10);
        this.loadingTrending = false;
        console.log('Loaded trending tracks:', this.trendingTracks);
      },
      error => {
        console.error('Failed to load trending tracks:', error);
        this.trendingError = true;
        this.loadingTrending = false;
      }
    );
  } 
  
  loadExploreTracks() {
    this.loadingExplore = true;
    this.exploreError = false;
    
    this.deezerService.getExploreTracks().subscribe(
      tracks => {
        this.exploreTracks = tracks.slice(0, 10);
        this.loadingExplore = false;
        console.log('Loaded explore tracks:', this.exploreTracks);
      },
      error => {
        console.error('Failed to load explore tracks:', error);
        this.exploreError = true;
        this.loadingExplore = false;
      }
    );
  }
  async playTrendingTrack(track: DeezerTrack) {
    try {
      const trackToPlay = this.convertDeezerTrackToTrack(track);

      await this.saveTrackIfNeeded(trackToPlay);
      
      await this.mediaPlayerService.play(trackToPlay);
      
    } catch (error) {
      console.error('Error playing trending track:', error);
      this.showToast('Could not play track', 'danger');
    }
  }
  
  async playExploreTrack(track: DeezerTrack) {
    try {
      // Convert to our track format using the helper method
      const trackToPlay = this.convertDeezerTrackToTrack(track);

      // First ensure the track is saved to the database correctly
      await this.saveTrackIfNeeded(trackToPlay);
      
      // Use the play method to play the track directly
      await this.mediaPlayerService.play(trackToPlay);
      
    } catch (error) {
      console.error('Error playing explore track:', error);
      this.showToast('Could not play track', 'danger');
    }
  }
  
  // Save a track if it doesn't exist in the database
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
    }  }  

  refreshContent(event: any) {
    // Only reload trending and explore tracks
    this.loadTrendingTracks();
    this.loadExploreTracks();
    if (event) {
      event.target.complete();
    }
  }

  async playTrack(track: Track) {
    try {
      // Play the track
      this.mediaPlayerService.setQueue([track], 0);
    } catch (error) {
      console.error('Error playing track:', error);
    }
  }  // No need for reversedRecentlyPlayed getter since we want newest first

  async getFirstTrackArtwork(playlist: Playlist): Promise<string> {
    // Use the first track in the playlist
    if (playlist.trackIds.length > 0) {
      const tracks = await this.dataService.getAllTracks();
      const firstTrack = tracks.find(track => track.id === playlist.trackIds[0]);
      return firstTrack?.artwork || firstTrack?.imageUrl || 'assets/placeholder-playlist.png';
    }
    return 'assets/placeholder-playlist.png';
  }

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

  async addTrackToPlaylist(track: DeezerTrack) {
    try {
      // Convert DeezerTrack to our internal Track format
      const trackToAdd = this.convertDeezerTrackToTrack(track);
      
      // Make sure the track is saved first
      await this.saveTrackIfNeeded(trackToAdd);
      
      // Show the add to playlist options
      await this.showAddToPlaylistOptions(trackToAdd);
    } catch (error) {
      console.error('Error preparing to add track to playlist:', error);
    }
  }
  
  // Show options to add a track to playlist (similar to search page implementation)
  async showAddToPlaylistOptions(track: Track) {
    // Get all playlists
    const playlists = await this.dataService.getAllPlaylists();
    
    const buttons: ActionSheetButton[] = [];
    
    // Add options to create new playlists (at the top, just like search page)
    buttons.push({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        this.createArtistMixWithTrack(track);
        return true;
      }
    });
    
    buttons.push({
      text: 'Create Playlist',
      handler: () => {
        this.createCustomPlaylistWithTrack(track);
        return true;
      }
    });
    
    // Add existing playlists
    if (playlists.length > 0) {
      playlists.forEach(playlist => {
        buttons.push({
          text: playlist.name,
          handler: () => {
            this.addTrackToExistingPlaylist(track, playlist.id);
            return true;
          }
        });
      });
    }
    
    // Add cancel button
    buttons.push({
      text: 'Cancel',
      role: 'cancel'
    });
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Add to Playlist',
      buttons
    });
    
    await actionSheet.present();
  }
    // Add a track to an existing playlist
  async addTrackToExistingPlaylist(track: Track, playlistId: string) {
    try {
      // First, make sure the track is saved in our data service
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.dataService.saveLocalMusic(track, filePath);
      
      // Ensure track is in collection
      await this.saveTrackIfNeeded(track);
      
      // Add to playlist
      await this.dataService.addTrackToPlaylist(playlistId, track.id);
      
      // Get playlist name for toast message
      const playlist = await this.dataService.getPlaylist(playlistId);
      const playlistName = playlist?.name || 'playlist';
      
      this.showToast(`Added to ${playlistName}`);
    } catch (error) {
      console.error('Error adding to playlist:', error);
    }
  }  // Create a custom playlist with a track
  async createCustomPlaylistWithTrack(track: Track) {
    try {
      // First, make sure the track is saved in our data service
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.dataService.saveLocalMusic(track, filePath);
      
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
                return false;
              }
            }
          }
        ]
      });
      
      await alert.present();
    } catch (error) {
      console.error('Error preparing to create playlist:', error);
    }
  }  
  
  async createArtistMixWithTrack(track: Track) {
    try {
      const filePath = track.pathOrUrl || track.previewUrl;
      await this.dataService.saveLocalMusic(track, filePath);
      
      await this.saveTrackIfNeeded(track);
      
      const artistName = track.artist || 'My';
      const mixName = `${artistName}'s Mix`;
      
      const playlist = await this.dataService.createPlaylist(mixName);
      
      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
      
      this.showToast(`Created artist mix: ${mixName}`);
    } catch (error) {
      console.error('Error creating artist mix:', error);
    }
  }

  async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });
    await toast.present();
  }

  convertDeezerTrackToTrack(track: DeezerTrack): Track {
    return {
      id: `deezer-${track.id}`,
      title: track.title,
      artist: track.artist?.name || 'Unknown Artist',
      album: track.album?.title || 'Unknown Album',
      duration: track.duration,
      imageUrl: track.album?.cover_medium || 'assets/placeholder-player.png',
      previewUrl: track.preview,
      isLocal: false,
      source: 'stream',
      addedAt: new Date().toISOString(),
      pathOrUrl: track.preview,
      artwork: track.album?.cover_medium || null,
      type: 'mp3'
    };
  }
}
