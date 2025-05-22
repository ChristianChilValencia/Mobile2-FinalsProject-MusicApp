import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PlaylistStreamPage } from './playlist-stream.page';

const routes: Routes = [
  {
    path: '',
    component: PlaylistStreamPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PlaylistStreamPageRoutingModule {}
