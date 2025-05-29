import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavController, ActionSheetController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService, PlaybackState } from '../../services/media-player.service';

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
  currentPlaybackState: PlaybackState | null = null;
  
  private tracksSubscription: Subscription | null = null;
  private playlistsSubscription: Subscription | null = null;
  private playbackSubscription: Subscription | null = null;
  constructor(
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private navCtrl: NavController,
    private actionSheetController: ActionSheetController
  ) {} 

  ionViewWillEnter() {
    // Refresh recently played tracks when entering the home page
    this.dataService.refreshRecentlyPlayed();
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

  modeChanged() {
    if (this.currentMode === 'all') {
      // No filtering needed
    } else if (this.currentMode === 'local') {
      this.recentlyPlayed = this.recentlyPlayed.filter(track => track.source === 'local');
    } else if (this.currentMode === 'streaming') {
      this.recentlyPlayed = this.recentlyPlayed.filter(track => track.source === 'stream');
    }
  }  async playTrack(track: Track) {
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
    const buttons = [
      {
        text: 'Upload Music',
        icon: 'cloud-upload',
        handler: () => {
          this.navigateToUploads();
          return true;
        }
      },
      {
        text: 'Search Music',
        icon: 'search',
        handler: () => {
          this.navigateToSearch();
          return true;
        }
      },
      {
        text: 'Your Library',
        icon: 'library',
        handler: () => {
          this.navCtrl.navigateForward('/tabs/library');
          return true;
        }
      },
      {
        text: 'Create Playlist',
        icon: 'add-circle',
        handler: () => {
          this.navCtrl.navigateForward('/tabs/library');
          // We'll need to implement this properly with the DataService
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

  // Refresh the recently played list - can be called by UI (pull-to-refresh, etc.)
  async refreshRecentlyPlayed(event?: any) {
    try {
      await this.dataService.refreshRecentlyPlayed();
      if (event) {
        event.target.complete();
      }
    } catch (error) {
      console.error('Error refreshing recently played:', error);
      if (event) {
        event.target.complete();
      }
    }
  }
}
