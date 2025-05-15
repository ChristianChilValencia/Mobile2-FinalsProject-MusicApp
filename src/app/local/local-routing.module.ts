// This file is no longer needed as we're using standalone components
// Keep it empty to avoid import errors
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

@NgModule({
  imports: [RouterModule],
  exports: [RouterModule],
})
export class LocalPageRoutingModule {}
