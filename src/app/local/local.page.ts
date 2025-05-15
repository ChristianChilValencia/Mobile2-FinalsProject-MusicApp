import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { NowPlayingComponent } from '../components/now-playing/now-playing.component';

@Component({
  selector: 'app-local',
  templateUrl: './local.page.html',
  styleUrls: ['./local.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, NowPlayingComponent]
})
export class LocalPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
