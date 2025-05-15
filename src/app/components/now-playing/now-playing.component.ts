import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';
import { MetadataDisplayComponent } from '../metadata-display/metadata-display.component';
import { SongListComponent } from '../song-list/song-list.component';

@Component({
  selector: 'app-now-playing',
  templateUrl: './now-playing.component.html',
  styleUrls: ['./now-playing.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, AudioPlayerComponent, MetadataDisplayComponent, SongListComponent]
})
export class NowPlayingComponent implements OnInit {

  constructor() {}

  ngOnInit() {}
}
