import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

/** Shape of your app's settings */
export interface AppSettings {
  darkMode: boolean;
  streamingQuality: string;
  downloadQuality: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly STORAGE_KEY = 'app_settings';
  private readonly THEME_KEY = 'theme'; // For backwards compatibility

  /** Default settings */
  private defaultSettings: AppSettings = {
    darkMode: false,
    streamingQuality: 'High',
    downloadQuality: 'High',
  };

  /** Internal subject holding the current settings */
  private settingsSubject = new BehaviorSubject<AppSettings>(this.defaultSettings);

  /** Public observable for anyone to subscribe */
  public settings$: Observable<AppSettings> = this.settingsSubject.asObservable();

  constructor() {
    this.loadSettings();
  }

  /** Load saved settings (if any) from Preferences, else use defaults */
  private async loadSettings(): Promise<void> {
    try {
      // First try to get theme from the separate theme key (for backwards compatibility)
      const themeResult = await Preferences.get({ key: this.THEME_KEY });

      // Then get the full settings object
      const settingsResult = await Preferences.get({ key: this.STORAGE_KEY });

      let currentSettings = { ...this.defaultSettings };

      // Apply settings if they exist
      if (settingsResult && settingsResult.value) {
        try {
          const savedSettings = JSON.parse(settingsResult.value);
          currentSettings = { ...currentSettings, ...savedSettings };
        } catch (e) {
          console.error('Error parsing saved settings:', e);
        }
      }
      if (themeResult && themeResult.value) {
        currentSettings.darkMode = themeResult.value === 'dark';
      }
      this.settingsSubject.next(currentSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  /** Get current settings snapshot */
  get currentSettings(): AppSettings {
    return this.settingsSubject.value;
  }


  /** Persist and emit new settings */
  private async updateSettings(settings: AppSettings): Promise<void> {
    try {
      // Update subject with new settings
      this.settingsSubject.next(settings);

      // Save to storage
      await Preferences.set({
        key: this.STORAGE_KEY,
        value: JSON.stringify(settings),
      });
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  }

}