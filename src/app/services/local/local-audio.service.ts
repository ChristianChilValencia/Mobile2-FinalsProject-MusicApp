import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AudioFile, FileService } from './file.service';

export enum PlaybackState {
  STOPPED = 'stopped',
  PLAYING = 'playing',
  PAUSED = 'paused',
  LOADING = 'loading'
}

@Injectable({
  providedIn: 'root'
})
export class LocalAudioService {
  private audioElement: HTMLAudioElement;
  private currentFile = new BehaviorSubject<AudioFile | null>(null);
  private playbackState = new BehaviorSubject<PlaybackState>(PlaybackState.STOPPED);
  private currentTimeSubject = new BehaviorSubject<number>(0);
  private durationSubject = new BehaviorSubject<number>(0);

  constructor(private fileService: FileService) {
    this.audioElement = new Audio();
    
    // Set up audio element event listeners
    this.audioElement.addEventListener('timeupdate', () => {
      this.currentTimeSubject.next(this.audioElement.currentTime);
    });
    
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.durationSubject.next(this.audioElement.duration);
    });
    
    this.audioElement.addEventListener('ended', () => {
      this.playbackState.next(PlaybackState.STOPPED);
    });
    
    this.audioElement.addEventListener('pause', () => {
      this.playbackState.next(PlaybackState.PAUSED);
    });
    
    this.audioElement.addEventListener('play', () => {
      this.playbackState.next(PlaybackState.PLAYING);
    });
  }

  /**
   * Load and play an audio file
   */
  playFile(file: AudioFile): void {
    this.currentFile.next(file);
    this.playbackState.next(PlaybackState.LOADING);
    
    // Set the src attribute and load the audio
    this.audioElement.src = file.path;
    this.audioElement.load();
    
    // Play the audio
    this.audioElement.play()
      .catch(error => {
        console.error('Error playing audio:', error);
        this.playbackState.next(PlaybackState.STOPPED);
      });
  }

  /**
   * Play a file by ID
   */
  playFileById(id: string): void {
    this.fileService.getAudioFileById(id).subscribe(file => {
      if (file) {
        this.playFile(file);
      }
    });
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (!this.audioElement.src) {
      // No audio loaded, do nothing
      return;
    }
    
    if (this.audioElement.paused) {
      this.audioElement.play();
    } else {
      this.audioElement.pause();
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.audioElement.pause();
  }

  /**
   * Resume playback
   */
  play(): void {
    if (this.audioElement.src) {
      this.audioElement.play();
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.playbackState.next(PlaybackState.STOPPED);
  }

  /**
   * Seek to a specific time
   */
  seekTo(time: number): void {
    if (this.audioElement.src) {
      this.audioElement.currentTime = time;
    }
  }

  /**
   * Get the currently playing file
   */
  getCurrentFile(): Observable<AudioFile | null> {
    return this.currentFile.asObservable();
  }

  /**
   * Get the current playback state
   */
  getPlaybackState(): Observable<PlaybackState> {
    return this.playbackState.asObservable();
  }

  /**
   * Get the current playback time
   */
  getCurrentTime(): Observable<number> {
    return this.currentTimeSubject.asObservable();
  }

  /**
   * Get the duration of the current track
   */
  getDuration(): Observable<number> {
    return this.durationSubject.asObservable();
  }
}
