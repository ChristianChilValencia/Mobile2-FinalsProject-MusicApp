import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, AlertController, NavController } from '@ionic/angular';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService } from '../../services/media-player.service';

@Component({
  selector: 'app-playlist-stream',
  templateUrl: './playlist.page.html',
  styleUrls: ['./playlist.page.scss'],
  standalone: false
})
export class PlaylistPage implements OnInit {  
  playlist: Playlist | null = null;
  playlistTracks: Track[] = [];
  isReordering = false;
  playlistId: string | null = null;

  @ViewChild('coverArtInput', { static: false }) coverArtInput!: ElementRef;

  constructor(
    private route: ActivatedRoute,
    private dataService: DataService,
    private mediaPlayerService: MediaPlayerService,
    private navController: NavController,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
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
      
      for (const trackId of this.playlist.trackIds) {
        const track = await this.dataService.getTrack(trackId);
        if (track) {
          this.playlistTracks.push(track);
        }
      }
    } catch (error) {
      console.error('Error loading playlist:', error);
      this.dataService.showToast('Failed to load playlist', 'danger');
      this.navController.navigateBack('/tabs/library');
    }
  }
  
  async playTrack(track: Track, index: number) {
    try {
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
              await this.loadPlaylist(this.playlist!.id);
            } catch (error) {
              console.error('Error removing track:', error);
              this.dataService.showToast('Failed to remove track', 'danger');
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  async handleReorder(event: any) {
    const itemMove = this.playlistTracks.splice(event.detail.from, 1)[0];
    this.playlistTracks.splice(event.detail.to, 0, itemMove);
    
    event.detail.complete();
    
    if (this.playlist) {
      try {
        this.playlist.trackIds = this.playlistTracks.map(track => track.id);
        
        await this.dataService.savePlaylists([this.playlist]);
      } catch (error) {
        console.error('Error updating playlist order:', error);
        this.dataService.showToast('Failed to update playlist order', 'danger');
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
              this.dataService.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            try {
              await this.dataService.updatePlaylistDetails(
                this.playlist!.id,
                data.name.trim(),
                data.description.trim()
              );
              
              await this.loadPlaylist(this.playlist!.id);
              return true;
            } catch (error) {
              console.error('Error updating playlist:', error);
              this.dataService.showToast('Failed to update playlist', 'danger');
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
  
  isCurrentlyPlaying(track: Track): boolean {
    return this.mediaPlayerService.isCurrentlyPlaying(track);
  }
  
  togglePlayTrack(track: Track): void {
    if (!this.playlistTracks.length) return;
      const index = this.playlistTracks.findIndex(t => t.id === track.id);
    if (index !== -1) {
      if (this.mediaPlayerService.isCurrentlyPlaying(track)) {
        this.mediaPlayerService.togglePlay();
      } else {
        this.playTrack(track, index);
      }
    }
  }
  
  async showAddToPlaylistOptions(track: Track) {
    await this.dataService.showAddToPlaylistOptions(track);
  }

  triggerCoverArtUpload(): void {
    this.coverArtInput.nativeElement.click();
  }

  async onCoverArtSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.showToast('Please select an image file', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showToast('Image is too large. Please select an image under 5MB', 'warning');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) return;
        
        if (this.playlist) {
          const coverArtDataUrl = e.target.result as string;
          await this.dataService.updatePlaylistDetails(
            this.playlist.id,
            this.playlist.name,
            this.playlist.description || undefined,
            coverArtDataUrl
          );
          
          await this.loadPlaylist(this.playlist.id);
          this.showToast('Playlist cover art updated');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading cover art:', error);
      this.showToast('Failed to update cover art', 'danger');
    } finally {
      input.value = '';
    }
  }
  
  private async showToast(message: string, color: string = 'success') {
    await this.dataService.showToast(message, color);
  }
}
