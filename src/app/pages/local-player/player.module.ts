import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PlayerPage } from './player.page';
import { PlayerPageRoutingModule } from './player-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PlayerPageRoutingModule
  ],
  declarations: [PlayerPage] // Only include PlayerPage here, no component
})
export class PlayerPageModule {}