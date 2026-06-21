import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { phaserConfig } from '../game/config/phaser';
import { gameEvents } from '../game/gameEvents';
import HUD from '../ui/HUD';
import Joystick from '../ui/Joystick';
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
    }

    const onToggleInventory = () => {
      setShowInventory((v) => !v);
      setShowCharacter(false);
      setShowBlacksmith(false);
    };
    const onToggleCharacter = () => {
      setShowCharacter((v) => !v);
      setShowInventory(false);
      setShowBlacksmith(false);
    };
    const onOpenBlacksmith = () => {
      setShowBlacksmith(true);
      setShowInventory(false);
      setShowCharacter(false);
    };
    const onCloseWindows = () => {
      setShowInventory(false);
      setShowCharacter(false);
      setShowBlacksmith(false);
    };

    gameEvents.on('toggle-inventory', onToggleInventory);
    gameEvents.on('toggle-character', onToggleCharacter);
    gameEvents.on('open-blacksmith', onOpenBlacksmith);
    gameEvents.on('close-windows', onCloseWindows);

    return () => {
      gameEvents.off('toggle-inventory', onToggleInventory);
      gameEvents.off('toggle-character', onToggleCharacter);
      gameEvents.off('open-blacksmith', onOpenBlacksmith);
      gameEvents.off('close-windows', onCloseWindows);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <div id="game-container" style={{ width: '100%', height: '100%' }} />

      <HUD />
      <Joystick />

      {showInventory && (
        <InventoryWindow onClose={() => setShowInventory(false)} />
      )}
      {showCharacter && (
        <CharacterWindow onClose={() => setShowCharacter(false)} />
      )}
      {showBlacksmith && (
        <BlacksmithWindow onClose={() => setShowBlacksmith(false)} />
      )}

      <div
        className="rotate-hint"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          zIndex: 9999,
          fontFamily: 'monospace',
          padding: 24,
        }}
      >
        Rotate your device to landscape for the best experience
      </div>
    </div>
  );
}
