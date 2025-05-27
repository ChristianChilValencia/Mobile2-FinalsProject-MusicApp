import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UploadsPageRoutingModule } from './uploads-routing.module';

import { UploadsPage } from './uploads.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UploadsPageRoutingModule
  ],
  declarations: [UploadsPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class UploadsPageModule {}
