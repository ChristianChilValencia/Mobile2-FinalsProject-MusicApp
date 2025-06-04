import { Component } from '@angular/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { NavController, Platform } from '@ionic/angular';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private navController: NavController
  ) {
    this.initializeApp();
  }  async initializeApp() {
    await this.platform.ready();
    
    setTimeout(() => {
      SplashScreen.hide();
    }, 2000);
    
    this.platform.backButton.subscribeWithPriority(10, () => {
      this.navController.back();
    });
    
    this.platform.backButton.subscribeWithPriority(5, () => {
      if (this.platform.is('android')) {
        App.exitApp();
      }
    });
  }
}
