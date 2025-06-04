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

  async loadPlaylists() {
    this.playlists = await this.dataService.getAllPlaylists();
  }

  searchChanged() {
    if (this.searchQuery.trim().length === 0) {
      this.searchResults = [];
      return;
    }

    if (this.searchQuery.trim().length < 3) {
      return;  
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
  }  async playTrack(track: Track) {
    try {
      const trackToSave = {
        ...track,
        lastPlayed: new Date().toISOString(),
        addedAt: track.addedAt || new Date().toISOString()
      };

      // Check if track already exists in collection
      const allTracks = await this.dataService.getAllTracks();
      const existingTrack = allTracks.find(t => t.id === trackToSave.id);
      
      // Save track to collection BEFORE playing
      if (!existingTrack) {
        console.log('Saving new track to collection');
        await this.dataService.saveTracks([...allTracks, trackToSave]);
      } else {
        console.log('Updating existing track in collection');
        const updatedTracks = allTracks.map(t => 
          t.id === trackToSave.id ? trackToSave : t
        );
        await this.dataService.saveTracks(updatedTracks);
      }
      
      // Play the track using the play method (not setQueue)
      await this.mediaPlayerService.play(trackToSave);
      
      // Show a toast to confirm the track is playing
      this.dataService.showToast(`Playing "${trackToSave.title}"`);
    } catch (error) {
      console.error('Error playing track:', error);
      this.dataService.showToast('Error playing track', 'danger');
    }
  }
  async showAddToPlaylistOptions(track: Track) {
    await this.dataService.showAddToPlaylistOptions(track);
  }
  async addTrackToPlaylist(track: Track, playlistId: string) {
    await this.dataService.addTrackToPlaylistAndNotify(track, playlistId);
  }  async createArtistMixWithTrack(track: Track) {
    await this.dataService.createArtistMixWithTrack(track);
  }
  async createCustomPlaylistWithTrack(track: Track) {
    await this.dataService.createCustomPlaylistWithTrack(track);
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
  }  // Toggle play/pause for a track
  togglePlayTrack(track: Track): void {
    this.mediaPlayerService.togglePlayTrack(track);
  }

  // Check if a track is currently playing
  isCurrentlyPlaying(track: Track): boolean {
    return this.mediaPlayerService.isCurrentlyPlaying(track);
  }
  // Add a helper method to show toast messages
  async showToast(message: string, color: string = 'success') {
    await this.dataService.showToast(message, color);
  }
}
