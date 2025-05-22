import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LocalAudioPage } from './local-audio.page';

const routes: Routes = [
  {
    path: '',
    component: LocalAudioPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LocalAudioPageRoutingModule {}
