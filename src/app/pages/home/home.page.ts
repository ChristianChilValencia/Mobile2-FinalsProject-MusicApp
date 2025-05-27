import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService } from '../../services/media-player.service';

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
  
  private tracksSubscription: Subscription | null = null;
  private playlistsSubscription: Subscription | null = null;

  constructor(
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.tracksSubscription = this.dataService.tracks$.subscribe(tracks => {
      this.recentlyPlayed = tracks.slice(0, 10);
      
      this.modeChanged();
    });
    
    this.playlistsSubscription = this.dataService.playlists$.subscribe(playlists => {
      this.playlists = playlists;
    });
  }

  ngOnDestroy() {
    if (this.tracksSubscription) {
      this.tracksSubscription.unsubscribe();
    }
    
    if (this.playlistsSubscription) {
      this.playlistsSubscription.unsubscribe();
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
  }
  playTrack(track: Track) {
    this.recentlyPlayed = this.recentlyPlayed.filter(t => t.id !== track.id);
    this.recentlyPlayed.unshift(track);
    if (this.recentlyPlayed.length > 10) {
      this.recentlyPlayed.pop();
    }
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
}
