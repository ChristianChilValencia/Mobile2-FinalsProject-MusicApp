import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LocalAudioPage } from './local-audio.page';

describe('LocalAudioPage', () => {
  let component: LocalAudioPage;
  let fixture: ComponentFixture<LocalAudioPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LocalAudioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
