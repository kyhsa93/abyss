import { usePlayerStore, requiredExp } from '../store/playerStore';
import { Attributes } from '../types';

interface Props {
  onClose: () => void;
}

const ATTR_LABELS: { key: keyof Attributes; label: string; desc: string }[] = [
  { key: 'strength', label: 'Strength', desc: '+2 Attack per point' },
  { key: 'dexterity', label: 'Dexterity', desc: '+2 Accuracy, +1 Evasion per point' },
  { key: 'vitality', label: 'Vitality', desc: '+10 Max HP per point' },
  { key: 'energy', label: 'Energy', desc: '+10 Max Mana per point' },
];

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#eee' }}>{value}</span>
    </div>
  );
}

export default function CharacterWindow({ onClose }: Props) {
  const player = usePlayerStore();
  const spendStat = usePlayerStore((s) => s.spendStatPoint);

  const expRequired = requiredExp(player.level);

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#0d0d1f',
        border: '2px solid #334',
        borderRadius: 6,
        padding: 16,
        color: '#ccc',
        fontFamily: 'monospace',
        zIndex: 200,
        minWidth: 340,
        boxShadow: '0 0 30px rgba(0,0,0,0.9)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>Character</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: '1px solid #555', color: '#aaa', cursor: 'pointer', borderRadius: 3, padding: '2px 8px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: 18, color: '#ffdd88', marginBottom: 8 }}>{player.name}</div>

      {/* Level / EXP */}
      <div style={{ marginBottom: 12 }}>
        <StatRow label="Level" value={player.level} />
        <StatRow label="EXP" value={`${player.exp} / ${expRequired}`} />
        <StatRow label="Gold" value={player.gold} />
        {player.skillPoints > 0 && (
          <div style={{ color: '#ffff44', fontSize: 12 }}>Skill Points: {player.skillPoints}</div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #334', margin: '8px 0' }} />

      {/* Attributes */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
          Attributes
          {player.statPoints > 0 && (
            <span style={{ color: '#ffff44', marginLeft: 8 }}>{player.statPoints} points to spend</span>
          )}
        </div>
        {ATTR_LABELS.map(({ key, label, desc }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#ddd' }}>{label}</span>
                <span style={{ color: '#ffaa44' }}>{player.attributes[key]}</span>
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>{desc}</div>
            </div>
            {player.statPoints > 0 && (
              <button
                onClick={() => spendStat(key)}
                style={{
                  background: '#223',
                  border: '1px solid #446',
                  color: '#88aaff',
                  cursor: 'pointer',
                  borderRadius: 3,
                  padding: '2px 8px',
                  fontSize: 14,
                }}
              >
                +
              </button>
            )}
          </div>
        ))}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #334', margin: '8px 0' }} />

      {/* Derived stats */}
      <div style={{ fontSize: 12 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Combat Stats</div>
        <StatRow label="HP" value={`${player.hp} / ${player.maxHp}`} />
        <StatRow label="Mana" value={`${player.mana} / ${player.maxMana}`} />
        <StatRow label="Attack" value={player.attack} />
        <StatRow label="Defense" value={player.defense} />
        <StatRow label="Accuracy" value={player.accuracy} />
        <StatRow label="Evasion" value={player.evasion} />
        <StatRow label="Crit Chance" value={`${player.critChance}%`} />
      </div>
    </div>
  );
}
