import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavController } from '@ionic/angular';
import { Router, NavigationEnd } from '@angular/router';
import { MediaPlayerService } from '../../services/media-player.service';
import { PlaybackState } from '../../services/data.service';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-mini-player',
  templateUrl: './mini-player.component.html',
  styleUrls: ['./mini-player.component.scss'],
  standalone: false
})
export class MiniPlayerComponent implements OnInit, OnDestroy {
  playbackState: PlaybackState | null = null;
  private playbackSubscription: Subscription | null = null;
  private routerSubscription: Subscription | null = null;
  isPlayerPage: boolean = false;

  constructor(
    private mediaPlayerService: MediaPlayerService,
    private navCtrl: NavController,
    private router: Router
  ) {}

  ngOnInit() {
    this.playbackSubscription = this.mediaPlayerService.getPlaybackState().subscribe(state => {
      this.playbackState = state;
    });
    
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.isPlayerPage = this.router.url.includes('/tabs/player');
      });
      
    this.isPlayerPage = this.router.url.includes('/tabs/player');
  }

  ngOnDestroy() {
    if (this.playbackSubscription) {
      this.playbackSubscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  togglePlay(event: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.mediaPlayerService.togglePlay();
  }

  openPlayerPage() {
    this.navCtrl.navigateForward('/tabs/player');
  }
  onSeekChange(event: any) {
    if (!this.playbackState?.currentTrack) return;
    
    const newPosition = event.detail.value;
    const duration = this.playbackState.duration || 0;
    
    const limitedPosition = Math.min(newPosition, duration);
    this.mediaPlayerService.seek(limitedPosition);
  }
}