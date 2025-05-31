import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, AlertController, NavController, ToastController } from '@ionic/angular';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService, PlaybackState } from '../../services/media-player.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-playlist-stream',
  templateUrl: './playlist-stream.page.html',
  styleUrls: ['./playlist-stream.page.scss'],
  standalone: false
})
export class PlaylistStreamPage implements OnInit, OnDestroy {  playlist: Playlist | null = null;
  playlistTracks: Track[] = [];
  isReordering = false;
  playlistId: string | null = null;
  currentPlaybackState: PlaybackState | null = null;
  private playbackSubscription: Subscription | null = null;

  @ViewChild('coverArtInput', { static: false }) coverArtInput!: ElementRef;

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private navController: NavController,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private toastController: ToastController
  ) { }

  async ngOnInit() {
    this.playlistId = this.route.snapshot.paramMap.get('id');
    
    if (this.playlistId) {
      await this.loadPlaylist(this.playlistId);
    } else {
      this.navController.navigateBack('/tabs/library');
    }    // Subscribe to playback state changes
    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.currentPlaybackState = state;
    });
  }
  ngOnDestroy() {
    // Unsubscribe from playback state changes
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
    }
  }

  async ionViewWillEnter() {
    // Reload playlist on each page entry to ensure it's up to date
    if (this.playlistId) {
      await this.loadPlaylist(this.playlistId);
    }
  }

  async loadPlaylist(playlistId: string) {
    try {
      this.playlist = await this.dataService.getPlaylist(playlistId);
      
      if (!this.playlist) {
        throw new Error('Playlist not found');
      }
      
      this.playlistTracks = [];
      
      // Load all tracks in the playlist
      for (const trackId of this.playlist.trackIds) {
        const track = await this.dataService.getTrack(trackId);
        if (track) {
          this.playlistTracks.push(track);
        }
      }
    } catch (error) {
      console.error('Error loading playlist:', error);
      this.showToast('Failed to load playlist', 'danger');
      this.navController.navigateBack('/tabs/library');
    }
  }
  async playTrack(track: Track, index: number) {
    try {
      // Add to recently played first
      await this.dataService.addToRecentlyPlayed(track.id);
      // Start playback from the selected track
      this.mediaPlayerService.setQueue(this.playlistTracks, index);
    } catch (error) {
      console.error('Error playing track:', error);
    }
  }

  playAll() {
    if (this.playlistTracks.length > 0) {
      this.mediaPlayerService.setQueue(this.playlistTracks, 0);
    }
  }

  shufflePlay() {
    if (this.playlistTracks.length > 0) {
      // Create a shuffled copy of the tracks
      const shuffled = [...this.playlistTracks].sort(() => Math.random() - 0.5);
      this.mediaPlayerService.setQueue(shuffled, 0);
    }
  }

  async removeTrack(track: Track) {
    if (!this.playlist) return;
    
    const alert = await this.alertController.create({
      header: 'Remove Track',
      message: `Remove "${track.title}" from this playlist?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          handler: async () => {
            try {
              await this.dataService.removeTrackFromPlaylist(this.playlist!.id, track.id);
              // Reload the playlist
              await this.loadPlaylist(this.playlist!.id);
            } catch (error) {
              console.error('Error removing track:', error);
              this.showToast('Failed to remove track', 'danger');
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  async handleReorder(event: any) {
    // Get the item that was moved
    const itemMove = this.playlistTracks.splice(event.detail.from, 1)[0];
    
    // Insert it at the destination
    this.playlistTracks.splice(event.detail.to, 0, itemMove);
    
    // Complete the reorder
    event.detail.complete();
    
    // Update the playlist trackIds to match the new order
    if (this.playlist) {
      try {
        this.playlist.trackIds = this.playlistTracks.map(track => track.id);
        this.playlist.updatedAt = new Date().toISOString();
        
        await this.dataService.savePlaylists([this.playlist]);
      } catch (error) {
        console.error('Error updating playlist order:', error);
        this.showToast('Failed to update playlist order', 'danger');
      }
    }
  }
  async presentActionSheet() {
    if (!this.playlist) return;
      const buttons = [
      {
        text: 'Edit Details',
        handler: () => {
          this.editPlaylistDetails();
          return true;
        }
      },
      {
        text: this.isReordering ? 'Done Reordering' : 'Reorder Tracks',
        handler: () => {
          this.isReordering = !this.isReordering;
          return true;
        }
      },
      {
        text: 'Delete Playlist',
        role: 'destructive',
        handler: () => {
          this.deletePlaylist();
          return true;
        }
      },
      {
        text: 'Cancel',
        role: 'cancel',
        handler: () => {
          return true;
        }
      }
    ];
    
    const actionSheet = await this.actionSheetController.create({
      header: 'Playlist Options',
      buttons
    });
    
    await actionSheet.present();
  }

  async presentPlaylistOptions() {
    // Use the existing presentActionSheet method
    await this.presentActionSheet();
  }

  async editPlaylistDetails() {
    if (!this.playlist) return;
    
    const alert = await this.alertController.create({
      header: 'Edit Playlist',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.playlist.name,
          placeholder: 'Playlist Name'
        },
        {
          name: 'description',
          type: 'text',
          value: this.playlist.description || '',
          placeholder: 'Description (optional)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Save',
          handler: async (data) => {
            if (!data.name || data.name.trim() === '') {
              this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            try {
              await this.dataService.updatePlaylistDetails(
                this.playlist!.id,
                data.name.trim(),
                data.description.trim()
              );
              
              // Reload the playlist
              await this.loadPlaylist(this.playlist!.id);
              return true;
            } catch (error) {
              console.error('Error updating playlist:', error);
              this.showToast('Failed to update playlist', 'danger');
              return false;
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  async deletePlaylist() {
    if (!this.playlist) return;
    
    const alert = await this.alertController.create({
      header: 'Delete Playlist',
      message: `Are you sure you want to delete "${this.playlist.name}"? This cannot be undone.`,
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
              await this.dataService.deletePlaylist(this.playlist!.id);
              this.navController.navigateBack('/tabs/library');
            } catch (error) {
              console.error('Error deleting playlist:', error);
              this.showToast('Failed to delete playlist', 'danger');
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  navigateToSearch() {
    this.navController.navigateForward('/tabs/search');
  }

  getTotalDuration(): string {
    const totalSeconds = this.playlistTracks.reduce((total, track) => total + (track.duration || 0), 0);
    return this.formatTotalDuration(totalSeconds);
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }

  formatTotalDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    } else {
      return `${minutes} min`;
    }
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
    if (!this.currentPlaybackState) return;
    
    if (this.currentPlaybackState.currentTrack?.id === track.id) {
      // The track is already the current track, toggle play/pause
      this.mediaPlayerService.togglePlay();
    } else {
      // Get the index of the track in the playlist
      const index = this.playlistTracks.findIndex(t => t.id === track.id);
      if (index !== -1) {
        // Start playing from this track in the playlist
        this.playTrack(track, index);
      }
    }
  }

  // Show options to add track to another playlist
  async showAddToPlaylistOptions(track: Track) {
    // Get all playlists except the current one
    const allPlaylists = await this.dataService.getAllPlaylists();
    const playlists = allPlaylists.filter(p => p.id !== this.playlistId);
    
    const buttons = [];
    
    // Add create options
    buttons.push({
      text: 'Create Playlist',
      handler: () => {
        this.createCustomPlaylist(track);
        return true;
      }
    });
    
    buttons.push({
      text: `Create ${track.artist}'s Mix`,
      handler: () => {
        this.createArtistMix(track);
        return true;
      }
    });
    
    // Add existing playlists
    if (playlists.length > 0) {
      playlists.forEach(playlist => {
        buttons.push({
          text: playlist.name,
          handler: () => {
            this.addTrackToPlaylist(track, playlist.id);
            return true;
          }
        });
      });
    }
    
    // Add cancel button
    buttons.push({
      text: 'Cancel',
      role: 'cancel',
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

  // Create a custom playlist with a track
  async createCustomPlaylist(track: Track) {
    const alert = await this.alertController.create({
      header: 'New Playlist',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Enter playlist name'
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
  }

  // Create an artist mix playlist
  async createArtistMix(track: Track) {
    try {
      const artistName = track.artist || 'My';
      const mixName = `${artistName}'s Mix`;
      
      // Create the playlist
      const playlist = await this.dataService.createPlaylist(mixName);
      
      // Add the track to the playlist
      await this.dataService.addTrackToPlaylist(playlist.id, track.id);
      
      this.showToast(`Created artist mix: ${mixName}`);
      
      return true;
    } catch (error) {
      console.error('Error creating artist mix:', error);
      this.showToast('Failed to create artist mix', 'danger');
      return false;
    }
  }

  // Add track to an existing playlist
  async addTrackToPlaylist(track: Track, playlistId: string) {
    try {
      await this.dataService.addTrackToPlaylist(playlistId, track.id);
      
      // Get the playlist name
      const playlist = await this.dataService.getPlaylist(playlistId);
      const playlistName = playlist?.name || 'playlist';
      
      this.showToast(`Added to ${playlistName}`);
      return true;
    } catch (error) {
      console.error('Error adding to playlist:', error);
      this.showToast('Failed to add to playlist', 'danger');
      return false;
    }
  }

  // Trigger the hidden file input when clicking on cover art
  triggerCoverArtUpload(): void {
    this.coverArtInput.nativeElement.click();
  }

  // Handle cover art file selection
  async onCoverArtSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.showToast('Please select an image file', 'warning');
      return;
    }

    // File size validation - let's limit to 5MB
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      this.showToast('Image is too large. Please select an image under 5MB', 'warning');
      return;
    }

    // Read file as data URL
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) return;
        
        // Save cover art and update playlist
        if (this.playlist) {
          const coverArtDataUrl = e.target.result as string;
          await this.dataService.updatePlaylistDetails(
            this.playlist.id,
            this.playlist.name,
            this.playlist.description || undefined,
            coverArtDataUrl
          );
          
          // Reload the playlist to show new cover art
          await this.loadPlaylist(this.playlist.id);
          this.showToast('Playlist cover art updated');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading cover art:', error);
      this.showToast('Failed to update cover art', 'danger');
    } finally {
      // Clear the input
      input.value = '';
    }
  }

  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color
    });
    
    await toast.present();
  }
}
