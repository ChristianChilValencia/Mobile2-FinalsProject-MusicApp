import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PlaylistStreamPageRoutingModule } from './playlist-stream-routing.module';

import { PlaylistStreamPage } from './playlist-stream.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PlaylistStreamPageRoutingModule
  ],
  declarations: [PlaylistStreamPage]
})
export class PlaylistStreamPageModule {}
