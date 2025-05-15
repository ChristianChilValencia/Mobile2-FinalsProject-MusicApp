import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AudioFile } from '../../services/local/file.service';
import { LocalAudioService } from '../../services/local/local-audio.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-metadata-display',
  templateUrl: './metadata-display.component.html',
  styleUrls: ['./metadata-display.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class MetadataDisplayComponent implements OnInit, OnDestroy {
  currentFile: AudioFile | null = null;
  private subscription: Subscription | null = null;

  constructor(private audioService: LocalAudioService) { }

  ngOnInit() {
    // Subscribe to current file changes
    this.subscription = this.audioService.getCurrentFile().subscribe(file => {
      this.currentFile = file;
    });
  }

  ngOnDestroy() {
    // Clean up subscription
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
