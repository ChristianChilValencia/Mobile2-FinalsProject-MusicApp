import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LocalPage } from './local.page';

describe('LocalPage', () => {
  let component: LocalPage;
  let fixture: ComponentFixture<LocalPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LocalPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
