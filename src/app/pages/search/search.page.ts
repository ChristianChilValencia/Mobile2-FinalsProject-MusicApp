import { Component, OnInit } from '@angular/core';
import { ActionSheetController, ToastController } from '@ionic/angular';
import { DeezerService } from '../../services/deezer.service';
import { MediaPlayerService } from '../../services/media-player.service';
import { DataService } from '../../services/data.service';
import { Track, Playlist } from '../../models/track.model';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false
})
export class SearchPage implements OnInit {
  searchQuery = '';
  searchResults: Track[] = [];
  isLoading = false;
  errorMessage = '';
  playlists: Playlist[] = [];

  constructor(
    private deezerService: DeezerService,
    private mediaPlayerService: MediaPlayerService,
    private dataService: DataService,
    private actionSheetController: ActionSheetController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loadPlaylists();
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
    });

    // Add "Create new playlist" option
    buttons.unshift({
      text: 'Create New Playlist',
      // icon: 'add',
      handler: () => {
        this.createNewPlaylistWithTrack(track);
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
      await this.dataService.saveLocalMusic(track, track.pathOrUrl);
      
      // Then add it to the playlist
      await this.dataService.addTrackToPlaylist(playlistId, track.id);
      
      const toast = await this.toastController.create({
        message: `Added to playlist`,
        duration: 2000,
        position: 'bottom'
      });
      
      await toast.present();
    } catch (error) {
      console.error('Error adding to playlist:', error);
      
      const toast = await this.toastController.create({
        message: 'Failed to add to playlist',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      
      await toast.present();
    }
  }

  async createNewPlaylistWithTrack(track: Track) {
    // Create a basic name based on the track or artist
    const newPlaylistName = `${track.artist}'s Mix`;
    
    try {
      // Create the playlist
      const playlist = await this.dataService.createPlaylist(newPlaylistName);
      
      // Save the track and add it to the playlist
      await this.dataService.saveLocalMusic(track, track.pathOrUrl);
      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
      
      const toast = await this.toastController.create({
        message: `Created new playlist: ${newPlaylistName}`,
        duration: 2000,
        position: 'bottom'
      });
      
      await toast.present();
    } catch (error) {
      console.error('Error creating playlist:', error);
      
      const toast = await this.toastController.create({
        message: 'Failed to create playlist',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      
      await toast.present();
    }
  }
}
