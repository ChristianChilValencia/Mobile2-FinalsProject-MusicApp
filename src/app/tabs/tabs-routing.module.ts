// filepath: d:\(CODING)\Mobile2-FinalsProject-MusicApp\src\app\tabs\tabs-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [      {
    path: 'local',
    loadChildren: () => import('../local/local.module').then(m => m.LocalPageModule)
      },
      {
        path: 'playlists',
        loadChildren: () => import('../playlists/playlists.module').then(m => m.PlaylistsPageModule)
      },
      {
        path: 'stream',
        loadChildren: () => import('../stream/stream.module').then(m => m.StreamPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/local',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/tabs/local',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule {}