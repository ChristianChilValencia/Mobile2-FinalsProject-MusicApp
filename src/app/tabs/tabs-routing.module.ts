import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
      },
      {
        path: 'search',
        loadChildren: () => import('../pages/search/search.module').then(m => m.SearchPageModule)
      },
      {
        path: 'library',
        loadChildren: () => import('../pages/library/library.module').then(m => m.LibraryPageModule)
      },
      {
        path: 'uploads',
        loadChildren: () => import('../pages/uploads/uploads.module').then(m => m.UploadsPageModule)
      },
      {
        path: 'playlist/:id',
        loadChildren: () => import('../pages/playlist-stream/playlist-stream.module').then(m => m.PlaylistStreamPageModule)
      },      {
        path: 'player',
        loadChildren: () => import('../pages/player/player.module').then(m => m.PlayerPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
