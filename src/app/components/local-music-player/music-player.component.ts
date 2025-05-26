import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { MediaPlayerService, Track } from '../services/media-player.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-music-player',
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss'],
  standalone: false
})
export class MusicPlayerComponent implements OnInit {
  @Input() track: Track | null = null;
  @Input() isPlaying = false;
  @Input() currentTime = 0;
  @Input() duration = 0;
  @Output() playPause = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();
  @Output() seek = new EventEmitter<number>();
  @Output() toggleLike = new EventEmitter<void>();
  
  slideOffset = 0;
  touchStartY = 0;
  dismissThreshold = 80;
  
  constructor(
    private mediaPlayer: MediaPlayerService,
    private router: Router
  ) { }

  ngOnInit() {}

  onTogglePlay() {
    this.playPause.emit();
  }

  onNext() {
    this.next.emit();
  }

  onPrevious() {
    this.previous.emit();
  }

  onSeek(event: any) {
    this.seek.emit(event.detail.value);
  }

  onToggleLike() {
    this.toggleLike.emit();
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === undefined || seconds < 0) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  goToNowPlaying() {
    this.router.navigate(['/player']);
  }
  
  // Touch handling for mini player
  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    event.stopPropagation();
  }

  onTouchMove(event: TouchEvent) {
    const touchY = event.touches[0].clientY;
    const deltaY = touchY - this.touchStartY;

    if (deltaY >= 0) {
      this.slideOffset = deltaY;
    } else {
      this.slideOffset = 0;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  onTouchEnd(event: TouchEvent) {
    if (this.slideOffset > this.dismissThreshold) {
      // Add closing class for animation
      const miniPlayer = event.currentTarget as HTMLElement;
      miniPlayer.classList.add('closing');

      // Emit event to handle dismissal in parent component
      this.playPause.emit();
    } else {
      // Not enough to dismiss, reset position
      this.slideOffset = 0;
    }

    event.stopPropagation();
  }
}