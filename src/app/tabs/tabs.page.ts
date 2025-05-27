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
  private readonly doubleClickDelay: number = 200;
  private longPressTimer: any;
  private readonly longPressDelay: number = 500;

  handleSearchTabClick($event: Event): void {
    const currentTime = new Date().getTime();
    
    if (currentTime - this.lastClickTime < this.doubleClickDelay) {
      this.focusSearchInput();
      this.vibrate(50);
    }
    
    this.lastClickTime = currentTime;

    this.longPressTimer = setTimeout(() => {
      this.focusSearchInput();
      this.vibrate(100);
    }, this.longPressDelay);

    document.addEventListener('touchend', this.clearLongPressTimer, { once: true });
    document.addEventListener('touchcancel', this.clearLongPressTimer, { once: true });
  }

  private focusSearchInput(): void {
    const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  }

  private clearLongPressTimer = (): void => {
    clearTimeout(this.longPressTimer);
  }

  private vibrate(duration: number): void {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  }
}
