import { Component, Input, OnInit } from '@angular/core';
import { LocalAudioService, PlaybackState } from '../../services/local/local-audio.service';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
  standalone: false
})
export class AudioPlayerComponent implements OnInit {
  @Input() showFullControls = true;
  
  playbackState = PlaybackState.STOPPED;
  currentTime = 0;
  duration = 0;

  constructor(private audioService: LocalAudioService) { }

  ngOnInit() {
    // Subscribe to playback state
    this.audioService.getPlaybackState().subscribe(state => {
      this.playbackState = state;
    });

    // Subscribe to current time and duration
    this.audioService.getCurrentTime().subscribe(time => {
      this.currentTime = time;
    });

    this.audioService.getDuration().subscribe(duration => {
      this.duration = duration;
    });
  }

  togglePlayPause(): void {
    this.audioService.togglePlayPause();
  }

  stop(): void {
    this.audioService.stop();
  }

  onSeek(event: any): void {
    this.audioService.seekTo(event.detail.value);
  }

  // Helper methods for template
  formatTime(time: number): string {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  // State check getters
  get isPlaying(): boolean {
    return this.playbackState === PlaybackState.PLAYING;
  }

  get isPaused(): boolean {
    return this.playbackState === PlaybackState.PAUSED;
  }
  
  get isStopped(): boolean {
    return this.playbackState === PlaybackState.STOPPED;
  }
  
  get isLoading(): boolean {
    return this.playbackState === PlaybackState.LOADING;
  }
}
