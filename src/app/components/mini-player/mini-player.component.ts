import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavController } from '@ionic/angular';
import { Router } from '@angular/router';
import { MediaPlayerService } from '../../services/media-player.service';
import { PlaybackState, Track } from '../../services/data.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-mini-player',
  templateUrl: './mini-player.component.html',
  styleUrls: ['./mini-player.component.scss'],
  standalone: false
})
export class MiniPlayerComponent implements OnInit, OnDestroy {
  playbackState: PlaybackState | null = null;
  private subscription: Subscription | null = null;
  isPlayerPage: boolean = false;

  constructor(
    private mediaPlayerService: MediaPlayerService,
    private navCtrl: NavController,
    private router: Router
  ) {}
  ngOnInit() {
    this.subscription = this.mediaPlayerService.playbackState$.subscribe(state => {
      this.playbackState = state;
    });
    
    // Check current route to hide mini-player on player page
    this.router.events.subscribe(() => {
      this.isPlayerPage = this.router.url.includes('/tabs/player');
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  togglePlay() {
    this.mediaPlayerService.togglePlay();
  }  openPlayerPage() {
    const currentTrack = this.playbackState?.currentTrack;
    // Navigate to the appropriate player page based on the track source
    if (currentTrack?.source === 'local' || currentTrack?.isLocal) {
      this.navCtrl.navigateForward('/tabs/player');
    } else {
      this.navCtrl.navigateForward('/tabs/player');
    }
  }
  onSeekChange(event: any) {
    const newPosition = event.detail.value;
    // Make sure the position is within our 30-second limit
    const limitedPosition = Math.min(newPosition, 30);
    this.mediaPlayerService.seek(limitedPosition);
  }
}