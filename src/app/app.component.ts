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
  }
  
  async initializeApp() {
    await SplashScreen.hide();
    
    // Handle hardware back button
    this.platform.backButton.subscribeWithPriority(10, () => {
      // Check if we can go back in the navigation stack
      this.navController.back();
    });
    
    // Handle app exit on Android
    this.platform.backButton.subscribeWithPriority(5, () => {
      if (this.platform.is('android')) {
        App.exitApp();
      }
    });
  }
}
