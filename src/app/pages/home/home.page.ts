import { Component } from '@angular/core';
import { DataService, Track } from '../../services/data.service';
import { MediaPlayerService } from '../../services/media-player.service';
import { DeezerService, DeezerTrack } from '../../services/deezer.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage{  
  trendingTracks: DeezerTrack[] = [];
  exploreTracks: DeezerTrack[] = [];
  loadingTrending = false;
  trendingError = false;
  exploreError = false;
  loadingExplore = false;
  
  constructor(
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private deezerService: DeezerService
  ) {}   
  
  ionViewWillEnter() {
    if (this.trendingTracks.length === 0 && !this.loadingTrending) {
      this.loadTrendingTracks();
    }
    
    if (this.exploreTracks.length === 0 && !this.loadingExplore) {
      this.loadExploreTracks();
    }
  }

  refreshContent(event: any) {
    this.loadTrendingTracks();
    this.loadExploreTracks();
    if (event) {
      event.target.complete();
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
      await this.deezerService.addDeezerTrackToLibrary(track);      
      await this.mediaPlayerService.play(trackToPlay);
    } catch (error) {
      console.error('Error playing trending track:', error);
      this.showToast('Could not play track', 'danger');
    }
  }

  async playExploreTrack(track: DeezerTrack) {
    try {
      const trackToPlay = this.convertDeezerTrackToTrack(track);
      await this.deezerService.addDeezerTrackToLibrary(track);
      await this.mediaPlayerService.play(trackToPlay);
    } catch (error) {
      console.error('Error playing explore track:', error);
      this.showToast('Could not play track', 'danger');
    }
  }

  async addTrackToPlaylist(track: DeezerTrack) {
    try {
      const trackToAdd = this.convertDeezerTrackToTrack(track);
      await this.deezerService.addDeezerTrackToLibrary(track);
      await this.showAddToPlaylistOptions(trackToAdd);
    } catch (error) {
      console.error('Error preparing to add track to playlist:', error);
    }
  }

  async showAddToPlaylistOptions(track: Track) {
    await this.dataService.showAddToPlaylistOptions(track);
  }
  
  async showToast(message: string, color: string = 'success') {
    await this.dataService.showToast(message, color);
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
