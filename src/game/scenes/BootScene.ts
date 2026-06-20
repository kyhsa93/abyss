import Phaser from 'phaser';
import { SaveService } from '../../services/SaveService';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    SaveService.load();
    this.scene.start('PreloadScene');
  }
}
