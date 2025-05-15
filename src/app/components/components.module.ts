import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

import { NowPlayingComponent } from './now-playing/now-playing.component';
import { AudioPlayerComponent } from './audio-player/audio-player.component';
import { MetadataDisplayComponent } from './metadata-display/metadata-display.component';
import { SongListComponent } from './song-list/song-list.component';

@NgModule({
  declarations: [
    NowPlayingComponent,
    AudioPlayerComponent,
    MetadataDisplayComponent,
    SongListComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule
  ],
  exports: [
    NowPlayingComponent,
    AudioPlayerComponent,
    MetadataDisplayComponent,
    SongListComponent
  ]
})
export class ComponentsModule { }
