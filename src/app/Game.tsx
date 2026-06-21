import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { phaserConfig } from '../game/config/phaser';
import HUD from '../ui/HUD';
import InventoryWindow from '../ui/InventoryWindow';
import CharacterWindow from '../ui/CharacterWindow';
import BlacksmithWindow from '../ui/BlacksmithWindow';

export default function Game() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showBlacksmith, setShowBlacksmith] = useState(false);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = new Phaser.Game(phaserConfig);

      gameRef.current.events.on('toggle-inventory', () => {
        setShowInventory((v) => !v);
        setShowCharacter(false);
        setShowBlacksmith(false);
      });
      gameRef.current.events.on('toggle-character', () => {
        setShowCharacter((v) => !v);
        setShowInventory(false);
        setShowBlacksmith(false);
      });
      gameRef.current.events.on('open-blacksmith', () => {
        setShowBlacksmith(true);
        setShowInventory(false);
        setShowCharacter(false);
      });
      gameRef.current.events.on('close-windows', () => {
        setShowInventory(false);
        setShowCharacter(false);
        setShowBlacksmith(false);
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
      {showBlacksmith && (
        <BlacksmithWindow onClose={() => setShowBlacksmith(false)} />
      )}
    </div>
  );
}
