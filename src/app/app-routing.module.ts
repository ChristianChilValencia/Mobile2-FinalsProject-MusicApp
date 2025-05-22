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
    path: 'local-audio',
    loadChildren: () => import('./pages/local-audio/local-audio.module').then( m => m.LocalAudioPageModule)
  },
  {
    path: 'playlist-stream',
    loadChildren: () => import('./pages/playlist-stream/playlist-stream.module').then( m => m.PlaylistStreamPageModule)
  },
  {
    path: 'player',
    loadChildren: () => import('./pages/player/player.module').then( m => m.PlayerPageModule)
  }
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
