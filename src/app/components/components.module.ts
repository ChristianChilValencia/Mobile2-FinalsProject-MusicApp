import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

import { NowPlayingComponent } from './now-playing/now-playing.component';
import { AudioPlayerComponent } from './audio-player/audio-player.component';
import { MetadataDisplayComponent } from './metadata-display/metadata-display.component';
import { SongListComponent } from './song-list/song-list.component';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    NowPlayingComponent
  ],
  exports: [
    NowPlayingComponent
  ]
})
export class ComponentsModule { }
