import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, AlertController, NavController, ToastController } from '@ionic/angular';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService } from '../../services/media-player.service';

@Component({
  selector: 'app-playlist-stream',
  templateUrl: './playlist-stream.page.html',
  styleUrls: ['./playlist-stream.page.scss'],
  standalone: false
})
export class PlaylistStreamPage implements OnInit {
  playlist: Playlist | null = null;
  playlistTracks: Track[] = [];
  isReordering = false;
  playlistId: string | null = null;

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

  playTrack(track: Track, index: number) {
    // Start playback from the selected track
    this.mediaPlayerService.setQueue(this.playlistTracks, index);
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
              this.showToast('Track removed from playlist');
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
        this.showToast('Playlist order updated');
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
              this.showToast('Playlist updated');
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
              this.showToast('Playlist deleted');
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

  private async showToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color
    });
    
    await toast.present();
  }
}
