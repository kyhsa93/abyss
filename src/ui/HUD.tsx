import { usePlayerStore, requiredExp } from '../store/playerStore';
import { useDungeonStore } from '../store/dungeonStore';

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div style={{ background: '#1a0000', borderRadius: 4, overflow: 'hidden', height: 18, border: '1px solid #333' }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 0.1s',
        }}
      />
    </div>
  );
}

export default function HUD() {
  const hp = usePlayerStore((s) => s.hp);
  const maxHp = usePlayerStore((s) => s.maxHp);
  const mana = usePlayerStore((s) => s.mana);
  const maxMana = usePlayerStore((s) => s.maxMana);
  const exp = usePlayerStore((s) => s.exp);
  const level = usePlayerStore((s) => s.level);
  const gold = usePlayerStore((s) => s.gold);
  const floor = useDungeonStore((s) => s.floor);
  const scene = useDungeonStore((s) => s.scene);

  const expRequired = requiredExp(level);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '8px 16px 10px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.5))',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: 13,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
        {/* HP */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#ff6666' }}>HP</span>
            <span>{hp} / {maxHp}</span>
          </div>
          <Bar value={hp} max={maxHp} color="#cc2222" />
        </div>

        {/* EXP + Info */}
        <div style={{ flex: 1.2, textAlign: 'center' }}>
          <div style={{ marginBottom: 3, color: '#aaa', fontSize: 11 }}>
            {scene === 'dungeon' ? `Floor ${floor}` : 'Town'} &nbsp;|&nbsp; Lv.{level} &nbsp;|&nbsp; Gold: {gold}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#ffcc44', fontSize: 11 }}>EXP</span>
            <span style={{ fontSize: 11 }}>{exp} / {expRequired}</span>
          </div>
          <Bar value={exp} max={expRequired} color="#bb8800" />
        </div>

        {/* Mana */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#6688ff' }}>MP</span>
            <span>{mana} / {maxMana}</span>
          </div>
          <Bar value={mana} max={maxMana} color="#2244cc" />
        </div>
      </div>

      <div style={{ marginTop: 5, fontSize: 10, color: '#666', textAlign: 'center' }}>
        {scene === 'dungeon'
          ? 'Click to move  |  Click monster to attack  |  [I] Inventory  |  [C] Character  |  [T] Return to Town'
          : 'Click to move  |  [I] Inventory  |  [C] Character'}
      </div>
    </div>
  );
}
