import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActionSheetController, AlertController, NavController, ToastController } from '@ionic/angular';
import { DataService, Track, Playlist } from '../../services/data.service';
import { MediaPlayerService } from '../../services/media-player.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-library',
  templateUrl: './library.page.html',
  styleUrls: ['./library.page.scss'],
  standalone: false
})
export class LibraryPage{  
  playlistArtwork: { [key: string]: string } = {};
  playlists: Playlist[] = [];
  isLoading: boolean = true;

  constructor(
    private dataService: DataService,
    private navController: NavController,
    private alertController: AlertController,
  ) {}
  
  ionViewWillEnter() {
    console.log('Library page - entering view');
    this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    try {
      const [playlists] = await Promise.all([
        this.dataService.getAllPlaylists()
      ]);
      
      this.playlists = playlists;
      
      await Promise.all(playlists.map(playlist => this.loadPlaylistArtwork(playlist)));
    } catch (error) {
      console.error('Error loading library data:', error);
      this.showToast('Failed to load library', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPlaylistArtwork(playlist: Playlist) {
    if (playlist.trackIds.length > 0) {
      const firstTrack = await this.dataService.getTrack(playlist.trackIds[0]);
      if (firstTrack) {
        this.playlistArtwork[playlist.id] = firstTrack.artwork || firstTrack.imageUrl || 'assets/placeholder-playlist.png';
      }
    }
  }

  async createPlaylist() {
    const alert = await this.alertController.create({
      header: 'New Playlist',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Playlist Name'
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
          handler: (data) => {
            if (!data.name || data.name.trim() === '') {
              this.showToast('Please enter a playlist name', 'warning');
              return false;
            }
            
            this.dataService.createPlaylist(data.name, data.description)
              .then(() => this.showToast(`Playlist "${data.name}" created`))
              .catch(err => {
                console.error('Error creating playlist:', err);
                this.showToast('Failed to create playlist', 'danger');
              });
            return true;
          }
        }
      ]
    });
    
    await alert.present();
  }

  openPlaylist(playlist: Playlist) {
    this.navController.navigateForward(`/tabs/playlist/${playlist.id}`);
  }

  private async showToast(message: string, color: string = 'success') {
    await this.dataService.showToast(message, color);
  }

  async refreshLibrary(event?: any) {
    try {
      await this.loadData();
      
      if (event) {
        event.target.complete();
      }
    } catch (error) {
      console.error('Error refreshing library:', error);
      if (event) {
        event.target.complete();
      }    }
  }
}
