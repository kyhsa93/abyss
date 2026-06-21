import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {}

  create() {
    this.generateTextures();
    this.scene.start('TownScene');
  }

  private generateTextures() {
    // Soft white radial glow, tinted at use-site. Backs torch light, portal sparkle,
    // and hit/death particle bursts everywhere else in the game.
    const size = 64;
    const glow = this.textures.createCanvas('glow', size, size);
    const ctx = glow!.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    glow!.refresh();

    // Dark screen-edge vignette, stretched to fill the camera viewport.
    const vw = 256;
    const vh = 144;
    const vignette = this.textures.createCanvas('vignette', vw, vh);
    const vctx = vignette!.getContext();
    const vgrad = vctx.createRadialGradient(vw / 2, vh / 2, vh * 0.25, vw / 2, vh / 2, vh * 0.78);
    vgrad.addColorStop(0, 'rgba(0,0,0,0)');
    vgrad.addColorStop(1, 'rgba(0,0,0,0.65)');
    vctx.fillStyle = vgrad;
    vctx.fillRect(0, 0, vw, vh);
    vignette!.refresh();
  }
}
