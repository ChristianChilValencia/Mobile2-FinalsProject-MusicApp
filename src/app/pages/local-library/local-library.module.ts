import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { LibraryPage } from './local-library.page';

import { LibraryPageRoutingModule } from './local-library-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LibraryPageRoutingModule
  ],
  declarations: [LibraryPage]
})
export class LibraryPageModule {}