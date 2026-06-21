import { useEffect, useState } from 'react';
import { usePlayerStore, requiredExp } from '../store/playerStore';
import { useDungeonStore } from '../store/dungeonStore';
import { useSkillStore } from '../store/skillStore';
import { SKILL_DATA } from '../game/data/skills';
import { gameEvents } from '../game/gameEvents';

const SLOT_KEYS = ['1', '2', '3', '4'];

function SkillSlot({ index, skillId }: { index: number; skillId: string | null }) {
  const cooldownUntil = useSkillStore((s) => (skillId ? s.cooldownUntil[skillId] : undefined));
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 100);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const skill = skillId ? SKILL_DATA.find((sk) => sk.id === skillId) : undefined;
  const remaining = cooldownUntil ? Math.max(0, cooldownUntil - Date.now()) : 0;

  return (
    <div
      onClick={() => skillId && gameEvents.emit('use-skill', index)}
      style={{
        width: 50,
        height: 38,
        background: '#11111f',
        border: '1px solid #334',
        borderRadius: 4,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        pointerEvents: 'auto',
        cursor: skill ? 'pointer' : 'default',
      }}
    >
      <span style={{ position: 'absolute', top: 1, left: 3, color: '#556', fontSize: 8 }}>{SLOT_KEYS[index]}</span>
      <span style={{ color: skill ? '#ccc' : '#444', fontSize: 9 }}>{skill ? skill.name.split(' ')[0] : '—'}</span>
      {skill && <span style={{ color: '#5577aa', fontSize: 8 }}>{skill.manaCost}mp</span>}
      {remaining > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            color: '#ffaa44',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {(remaining / 1000).toFixed(1)}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      style={{
        pointerEvents: 'auto',
        background: 'none',
        border: 'none',
        color: '#ccc',
        fontFamily: 'monospace',
        fontSize: 13,
        padding: '8px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function HamburgerMenu({ scene }: { scene: 'town' | 'dungeon' }) {
  const [open, setOpen] = useState(false);

  const act = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          width: 40,
          height: 40,
          background: '#11111f',
          border: '1px solid #334',
          borderRadius: 4,
          color: '#ccc',
          fontSize: 18,
          cursor: 'pointer',
          pointerEvents: 'auto',
          zIndex: 30,
        }}
      >
        ☰
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'auto' }}
          />
          <div
            style={{
              position: 'fixed',
              top: 56,
              right: 12,
              background: '#0d0d1f',
              border: '1px solid #334',
              borderRadius: 6,
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 30,
              pointerEvents: 'auto',
              boxShadow: '0 0 20px rgba(0,0,0,0.8)',
            }}
          >
            <MenuItem label="Inventory" onTap={act(() => gameEvents.emit('toggle-inventory'))} />
            <MenuItem label="Character" onTap={act(() => gameEvents.emit('toggle-character'))} />
            {scene === 'dungeon' && (
              <MenuItem label="Return to Town" onTap={act(() => gameEvents.emit('return-to-town'))} />
            )}
          </div>
        </>
      )}
    </>
  );
}

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
  const mana = Math.floor(usePlayerStore((s) => s.mana));
  const maxMana = usePlayerStore((s) => s.maxMana);
  const exp = usePlayerStore((s) => s.exp);
  const level = usePlayerStore((s) => s.level);
  const gold = usePlayerStore((s) => s.gold);
  const floor = useDungeonStore((s) => s.floor);
  const scene = useDungeonStore((s) => s.scene);
  const equippedSkills = usePlayerStore((s) => s.equippedSkills);

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

      {scene === 'dungeon' && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6 }}>
          {equippedSkills.map((id, i) => (
            <SkillSlot key={i} index={i} skillId={id} />
          ))}
        </div>
      )}

      <HamburgerMenu scene={scene} />
    </div>
  );
}
