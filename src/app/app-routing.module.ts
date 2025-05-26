import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'search',
    loadChildren: () => import('./pages/search/search.module').then( m => m.SearchPageModule)
  },
  {
    path: 'library',
    loadChildren: () => import('./pages/library/library.module').then( m => m.LibraryPageModule)
  },
  {
    path: 'uploads',
    loadChildren: () => import('./pages/uploads/uploads.module').then( m => m.UploadsPageModule)
  },
  {
    path: 'playlist-stream',
    loadChildren: () => import('./pages/playlist-stream/playlist-stream.module').then( m => m.PlaylistStreamPageModule)
  },  {
    path: 'player',
    loadChildren: () => import('./pages/player/player.module').then( m => m.PlayerPageModule)
  },  
  {
    path: 'local-home',
    redirectTo: '/tabs/local-home',
    pathMatch: 'full'
  },
  {
    path: 'local-library',
    redirectTo: '/tabs/local-library',
    pathMatch: 'full'
  },
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
