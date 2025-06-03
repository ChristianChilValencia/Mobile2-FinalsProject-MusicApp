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
    // Wait for the platform to be ready before handling the splash screen
    await this.platform.ready();
    
    // The splash screen will be shown automatically by the native layer
    // We just need to make sure it's hidden when the app is ready
    setTimeout(() => {
      SplashScreen.hide();
    }, 2000);
    
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
