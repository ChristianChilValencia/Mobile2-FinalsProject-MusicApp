import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AudioFile, FileService } from '../../services/local/file.service';
import { LocalAudioService, PlaybackState } from '../../services/local/local-audio.service';

@Component({
  selector: 'app-song-list',
  templateUrl: './song-list.component.html',
  styleUrls: ['./song-list.component.scss'],
})
export class SongListComponent implements OnInit, OnDestroy {
  audioFiles: AudioFile[] = [];
  currentFile: AudioFile | null = null;
  playbackState: PlaybackState = PlaybackState.STOPPED;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private fileService: FileService,
    private audioService: LocalAudioService
  ) { }

  ngOnInit() {
    // Get audio files
    this.fileService.getAudioFiles().subscribe(files => {
      this.audioFiles = files;
    });

    // Subscribe to current playing file
    this.subscriptions.push(
      this.audioService.getCurrentFile().subscribe(file => {
        this.currentFile = file;
      })
    );

    // Subscribe to playback state
    this.subscriptions.push(
      this.audioService.getPlaybackState().subscribe(state => {
        this.playbackState = state;
      })
    );
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  playFile(file: AudioFile): void {
    this.audioService.playFile(file);
  }

  // State check getters
  get isPlaying(): boolean {
    return this.playbackState === PlaybackState.PLAYING;
  }

  get isPaused(): boolean {
    return this.playbackState === PlaybackState.PAUSED;
  }
}
