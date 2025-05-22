import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LocalAudioPageRoutingModule } from './local-audio-routing.module';

import { LocalAudioPage } from './local-audio.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LocalAudioPageRoutingModule
  ],
  declarations: [LocalAudioPage]
})
export class LocalAudioPageModule {}
