import Phaser from 'phaser';

export function addPortalSparkle(scene: Phaser.Scene, x: number, y: number, tint = 0x88aaff) {
  return scene.add.particles(x, y, 'glow', {
    tint,
    lifespan: 900,
    speed: { min: 10, max: 40 },
    angle: { min: 250, max: 290 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 0.8, end: 0 },
    frequency: 90,
    blendMode: 'ADD',
  }).setDepth(7);
}

export function addDeathBurst(scene: Phaser.Scene, x: number, y: number, tint: number) {
  const emitter = scene.add.particles(x, y, 'glow', {
    tint,
    lifespan: 450,
    speed: { min: 60, max: 160 },
    scale: { start: 0.45, end: 0 },
    quantity: 14,
    blendMode: 'ADD',
  });
  emitter.explode(14);
  scene.time.delayedCall(500, () => emitter.destroy());
}

export function addTorchGlow(scene: Phaser.Scene, x: number, y: number, tint: number, depth = 1) {
  const glow = scene.add.image(x, y, 'glow')
    .setTint(tint)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(2.2)
    .setAlpha(0.5)
    .setDepth(depth);

  scene.tweens.add({
    targets: glow,
    alpha: { from: 0.3, to: 0.65 },
    scale: { from: 2.0, to: 2.5 },
    duration: Phaser.Math.Between(900, 1400),
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return glow;
}

export function addVignette(scene: Phaser.Scene, depth = 60) {
  return scene.add.image(scene.scale.width / 2, scene.scale.height / 2, 'vignette')
    .setDisplaySize(scene.scale.width, scene.scale.height)
    .setScrollFactor(0)
    .setDepth(depth);
}
