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
  ) {}  ngOnInit() {
    this.tracksSubscription = this.dataService.tracks$.subscribe(tracks => {
      // Don't set recently played from all tracks
      // Only get tracks specifically marked as recently played
      this.dataService.getRecentlyPlayedTracks().then(recentTracks => {
        this.recentlyPlayed = recentTracks;
        this.modeChanged();
      });
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
    // Update recently played through data service
    await this.dataService.addToRecentlyPlayed(track.id);
    
    // Refresh the recently played list
    const recentTracks = await this.dataService.getRecentlyPlayedTracks();
    this.recentlyPlayed = recentTracks;
    
    // Then play the track
    this.mediaPlayerService.setQueue([track], 0);
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
}
