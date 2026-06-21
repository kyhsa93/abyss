import { usePlayerStore, requiredExp } from '../store/playerStore';
import { SKILL_DATA } from '../game/data/skills';
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
  const learnSkill = usePlayerStore((s) => s.learnSkill);
  const equipSkill = usePlayerStore((s) => s.equipSkill);

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
        minWidth: 320,
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflow: 'auto',
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

      {/* Skills */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
          Skills
          {player.skillPoints > 0 && (
            <span style={{ color: '#ffff44', marginLeft: 8 }}>{player.skillPoints} points to spend</span>
          )}
        </div>
        {SKILL_DATA.map((skill) => {
          const learned = player.learnedSkills.includes(skill.id);
          const canLearn = !learned && player.skillPoints > 0 && player.level >= skill.requiredLevel;
          const slotIndex = player.equippedSkills.indexOf(skill.id);

          return (
            <div key={skill.id} style={{ marginBottom: 8, opacity: learned || canLearn ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: learned ? '#88ddff' : '#ddd' }}>{skill.name}</span>
                {!learned && (
                  <button
                    disabled={!canLearn}
                    onClick={() => learnSkill(skill.id)}
                    style={{
                      background: canLearn ? '#223' : '#1a1a1a',
                      border: '1px solid #446',
                      color: canLearn ? '#88aaff' : '#555',
                      cursor: canLearn ? 'pointer' : 'default',
                      borderRadius: 3,
                      padding: '2px 8px',
                      fontSize: 11,
                    }}
                  >
                    Learn (Lv.{skill.requiredLevel})
                  </button>
                )}
                {learned && (
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <button
                        key={i}
                        onClick={() => equipSkill(i, skill.id)}
                        title={`Assign to slot ${i + 1}`}
                        style={{
                          width: 26,
                          height: 26,
                          fontSize: 11,
                          background: slotIndex === i ? '#446688' : '#1a1a2e',
                          border: '1px solid #446',
                          color: slotIndex === i ? '#fff' : '#777',
                          cursor: 'pointer',
                          borderRadius: 3,
                          padding: 0,
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#666' }}>{skill.description}</div>
              <div style={{ fontSize: 10, color: '#5577aa' }}>
                MP {skill.manaCost} &nbsp;|&nbsp; Cooldown {(skill.cooldown / 1000).toFixed(1)}s
              </div>
            </div>
          );
        })}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #334', margin: '8px 0' }} />

      {/* Derived stats */}
      <div style={{ fontSize: 12 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Combat Stats</div>
        <StatRow label="HP" value={`${player.hp} / ${player.maxHp}`} />
        <StatRow label="Mana" value={`${Math.floor(player.mana)} / ${player.maxMana}`} />
        <StatRow label="Attack" value={player.attack} />
        <StatRow label="Defense" value={player.defense} />
        <StatRow label="Accuracy" value={player.accuracy} />
        <StatRow label="Evasion" value={player.evasion} />
        <StatRow label="Crit Chance" value={`${player.critChance}%`} />
      </div>
    </div>
  );
}
