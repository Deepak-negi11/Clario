import Phaser from "phaser";

// The errand target on the 2D map: the room glows blue and a pin bounces above its middle.

const TILE = 32;
const BLUE = 0x3686ff;

export type ErrandMarker = { show: (room: { x: number; y: number; width: number; height: number } | null) => void };

export function addErrandMarker(scene: Phaser.Scene): ErrandMarker {
  // Under the furniture, over the floors and rugs.
  const glow = scene.add.graphics().setDepth(-989).setVisible(false);
  const pin = scene.add.graphics().setDepth(9400).setVisible(false);
  // Pin drawn around (0, 0) at its tip.
  pin.fillStyle(0x000000, 0.18); pin.fillEllipse(0, 4, 18, 6);
  pin.fillStyle(0x12151c, 1); pin.fillCircle(0, -26, 13); pin.fillTriangle(-9, -18, 9, -18, 0, 0);
  pin.fillStyle(BLUE, 1); pin.fillCircle(0, -26, 11); pin.fillTriangle(-7, -19, 7, -19, 0, -3);
  pin.fillStyle(0xffffff, 1); pin.fillCircle(0, -26, 4.5);

  let bounce: Phaser.Tweens.Tween | null = null;
  let pulse: Phaser.Tweens.Tween | null = null;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  return {
    show(room) {
      bounce?.stop();
      pulse?.stop();
      glow.clear();
      glow.setVisible(!!room);
      pin.setVisible(!!room);
      if (!room) return;
      const x = room.x * TILE, y = room.y * TILE, w = room.width * TILE, h = room.height * TILE;
      glow.fillStyle(BLUE, 0.1); glow.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 10);
      glow.lineStyle(3, BLUE, 0.85); glow.strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, 10);
      const tipY = y + h / 2;
      pin.setPosition(x + w / 2, tipY);
      if (reduceMotion) return;
      bounce = scene.tweens.add({ targets: pin, y: tipY - 10, duration: 520, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
      glow.setAlpha(1);
      pulse = scene.tweens.add({ targets: glow, alpha: 0.45, duration: 900, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
    },
  };
}
