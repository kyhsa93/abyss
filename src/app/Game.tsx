import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { phaserConfig } from '../game/config/phaser';
import HUD from '../ui/HUD';
import InventoryWindow from '../ui/InventoryWindow';
import CharacterWindow from '../ui/CharacterWindow';

export default function Game() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = new Phaser.Game(phaserConfig);

      gameRef.current.events.on('toggle-inventory', () => {
        setShowInventory((v) => !v);
        setShowCharacter(false);
      });
      gameRef.current.events.on('toggle-character', () => {
        setShowCharacter((v) => !v);
        setShowInventory(false);
      });
      gameRef.current.events.on('close-windows', () => {
        setShowInventory(false);
        setShowCharacter(false);
      });
    }

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <div id="game-container" style={{ width: '100%', height: '100%' }} />

      <HUD />

      {showInventory && (
        <InventoryWindow onClose={() => setShowInventory(false)} />
      )}
      {showCharacter && (
        <CharacterWindow onClose={() => setShowCharacter(false)} />
      )}
    </div>
  );
}
