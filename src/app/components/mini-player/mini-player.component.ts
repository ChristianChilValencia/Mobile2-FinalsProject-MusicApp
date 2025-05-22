import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavController } from '@ionic/angular';
import { MediaPlayerService } from '../../services/media-player.service';
import { PlaybackState, Track } from '../../models/track.model';
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

  constructor(
    private mediaPlayerService: MediaPlayerService,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.subscription = this.mediaPlayerService.playbackState$.subscribe(state => {
      this.playbackState = state;
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  togglePlay() {
    this.mediaPlayerService.togglePlay();
  }

  openPlayerPage() {
    this.navCtrl.navigateForward('/tabs/player');
  }

  onSeekChange(event: any) {
    const newPosition = event.detail.value;
    this.mediaPlayerService.seek(newPosition);
  }
}