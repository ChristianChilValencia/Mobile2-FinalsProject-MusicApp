import { Component, OnInit, OnDestroy } from '@angular/core';
import { FileScannerService } from '../../services/file-scanner.service';
import { MediaPlayerService } from '../../services/media-player.service';
import { DataService, Track, PlaybackState } from '../../services/data.service';
import { Subscription } from 'rxjs';
import { ToastController, AlertController, NavController } from '@ionic/angular';

@Component({
  selector: 'app-local-music',
  templateUrl: './local-music.page.html',
  styleUrls: ['./local-music.page.scss'],
})
export class LocalMusicPage implements OnInit, OnDestroy {
  // Tracks
  localTracks: Track[] = [];
  filteredTracks: Track[] = [];
  
  // UI state
  isScanning = false;
  currentTrack: Track | null = null;
  isPlaying = false;
  
  // View options
  currentView = 'tracks';
  searchTerm = '';
  sortOption = 'title';
  
  // Artists and albums for group views
  artists: string[] = [];
  albums: string[] = [];
  selectedArtist: string | null = null;
  selectedAlbum: string | null = null;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private fileScanner: FileScannerService,
    private mediaPlayer: MediaPlayerService,
    private dataService: DataService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    // Subscribe to scanning status
    this.subscriptions.push(
      this.fileScanner.isScanning$.subscribe(scanning => {
        this.isScanning = scanning;
      })
    );
    
    // Subscribe to playback state
    this.subscriptions.push(
      this.mediaPlayer.playbackState$.subscribe((state: PlaybackState) => {
        this.currentTrack = state.currentTrack;
        this.isPlaying = state.isPlaying;
      })
    );
    
    // Load local tracks
    this.loadLocalTracks();
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async loadLocalTracks() {
    try {
      this.localTracks = await this.dataService.getLocalTracks();
      this.filterTracks();
      this.updateArtistsAndAlbums();
    } catch (error) {
      console.error('Error loading local tracks:', error);
      this.localTracks = [];
      this.filteredTracks = [];
    }
  }

  async scanFiles() {
    try {
      const tracks = await this.fileScanner.scanAudioFiles();
      
      if (tracks.length > 0) {
        await this.loadLocalTracks(); // Reload tracks after scanning
        this.showToast(`Found ${tracks.length} audio files`);
      } else {
        this.showToast('No audio files found');
      }
    } catch (error) {
      console.error('Error scanning files:', error);
      this.showToast('Error scanning files. Please check app permissions.');
    }
  }

  filterTracks() {
    // Reset selected artist/album when searching
    if (this.searchTerm) {
      this.selectedArtist = null;
      this.selectedAlbum = null;
    }

    // Apply filters
    let filtered = [...this.localTracks];
    
    // Filter by search term
    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(track => 
        track.title.toLowerCase().includes(term) ||
        track.artist.toLowerCase().includes(term) ||
        (track.album && track.album.toLowerCase().includes(term))
      );
    }
    
    // Filter by selected artist
    if (this.selectedArtist) {
      filtered = filtered.filter(track => track.artist === this.selectedArtist);
    }
    
    // Filter by selected album
    if (this.selectedAlbum) {
      filtered = filtered.filter(track => track.album === this.selectedAlbum);
    }
    
    // Apply sorting
    this.filteredTracks = this.sortTracksByOption(filtered, this.sortOption);
  }

  sortTracks() {
    this.filteredTracks = this.sortTracksByOption(this.filteredTracks, this.sortOption);
  }

  private sortTracksByOption(tracks: Track[], option: string): Track[] {
    const sorted = [...tracks];
    
    switch (option) {
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'artist':
        return sorted.sort((a, b) => a.artist.localeCompare(b.artist));
      case 'album':
        return sorted.sort((a, b) => {
          const albumA = a.album || 'Unknown Album';
          const albumB = b.album || 'Unknown Album';
          return albumA.localeCompare(albumB);
        });
      case 'dateAdded':
        return sorted.sort((a, b) => 
          new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );
      default:
        return sorted;
    }
  }

  updateArtistsAndAlbums() {
    // Extract unique artists
    this.artists = [...new Set(this.localTracks.map(track => track.artist))]
      .filter(artist => artist)
      .sort();
      // Extract unique albums
    this.albums = [...new Set(this.localTracks
      .map(track => track.album || '')
      .filter(album => album && album !== 'Unknown Album'))]
      .sort();
  }

  viewChanged() {
    // Reset filters when changing views
    this.selectedArtist = null;
    this.selectedAlbum = null;
    this.filterTracks();
  }

  showArtistTracks(artist: string) {
    this.selectedArtist = artist;
    this.currentView = 'tracks';
    this.filterTracks();
  }

  showAlbumTracks(album: string) {
    this.selectedAlbum = album;
    this.currentView = 'tracks';
    this.filterTracks();
  }

  getTrackCountByArtist(artist: string): number {
    return this.localTracks.filter(track => track.artist === artist).length;
  }

  getTrackCountByAlbum(album: string): number {
    return this.localTracks.filter(track => track.album === album).length;
  }

  playTrack(track: Track) {
    // Create a queue from filtered tracks, starting with the selected track
    const index = this.filteredTracks.findIndex(t => t.id === track.id);
    if (index !== -1) {
      this.mediaPlayer.loadQueue(this.filteredTracks, index);
    }
  }

  togglePlayback(event: Event, track: Track) {
    // Stop event propagation to prevent item click
    event.stopPropagation();
    
    if (this.currentTrack?.id === track.id) {
      // Toggle playback of current track
      this.mediaPlayer.togglePlay();
    } else {
      // Play new track
      this.playTrack(track);
    }
  }

  next(event: Event) {
    event.stopPropagation();
    this.mediaPlayer.next();
  }

  openNowPlaying() {
    // This would navigate to a now playing page
    // For now, just show details about the current track
    this.showTrackDetails(this.currentTrack!);
  }

  async showTrackDetails(track: Track) {
    const alert = await this.alertCtrl.create({
      header: track.title,
      subHeader: `${track.artist} - ${track.album || 'Unknown Album'}`,
      message: `
        <p><strong>File Type:</strong> ${track.type?.toUpperCase() || 'Unknown'}</p>
        <p><strong>Path:</strong> ${track.pathOrUrl}</p>
        <p><strong>Added:</strong> ${new Date(track.addedAt).toLocaleString()}</p>
      `,
      buttons: ['Close']
    });
    
    await alert.present();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }
}
