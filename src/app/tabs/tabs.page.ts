import { Component } from '@angular/core';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage {

  constructor() {}

  private lastClickTime: number = 0;
  private readonly doubleClickDelay: number = 300; // Milliseconds between clicks to be considered a double click

  handleSearchTabClick($event: Event): void {
    const currentTime = new Date().getTime();
    
    if (currentTime - this.lastClickTime < this.doubleClickDelay) {
      // Double click detected
      // Focus on the search input to open keyboard on mobile
      const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }
    
    this.lastClickTime = currentTime;
  }
}
