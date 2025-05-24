import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { MiniPlayerComponent } from './mini-player/mini-player.component';

@NgModule({
  declarations: [
    MiniPlayerComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    RouterModule
  ],
  exports: [
    MiniPlayerComponent
  ]
})
export class ComponentsModule { }
