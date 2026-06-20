import { useState } from 'react';
import { useInventoryStore } from '../store/inventoryStore';
import { Item, EquipSlot } from '../types';

const RARITY_COLORS: Record<string, string> = {
  Normal: '#cccccc',
  Magic: '#4488ff',
  Rare: '#ffee22',
  Set: '#22ee88',
  Unique: '#ffaa44',
};

const SLOTS: EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring1', 'ring2', 'necklace'];
const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  helmet: 'Helmet',
  armor: 'Armor',
  gloves: 'Gloves',
  boots: 'Boots',
  ring1: 'Ring 1',
  ring2: 'Ring 2',
  necklace: 'Necklace',
};

function ItemTooltip({ item }: { item: Item }) {
  const color = RARITY_COLORS[item.rarity] ?? '#fff';
  return (
    <div
      style={{
        position: 'absolute',
        left: '105%',
        top: 0,
        background: '#1a1a2e',
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: '8px 10px',
        minWidth: 180,
        zIndex: 300,
        fontFamily: 'monospace',
        fontSize: 12,
        whiteSpace: 'nowrap',
        boxShadow: `0 0 10px ${color}44`,
      }}
    >
      <div style={{ color, fontWeight: 'bold', marginBottom: 4 }}>{item.name}</div>
      <div style={{ color: '#888', fontSize: 11 }}>{item.rarity} — ilvl {item.itemLevel}</div>
      {item.baseAttack > 0 && <div style={{ color: '#ffccaa' }}>Attack: +{item.baseAttack}</div>}
      {item.baseDefense > 0 && <div style={{ color: '#aaccff' }}>Defense: +{item.baseDefense}</div>}
      {item.affixes.map((a) => (
        <div key={a.id} style={{ color: color }}>
          {a.name}: +{a.value}
        </div>
      ))}
    </div>
  );
}

function ItemSlot({ item, onClick }: { item?: Item; label?: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        onClick={onClick}
        style={{
          width: 44,
          height: 44,
          background: '#0a0a1a',
          border: `1px solid ${item ? RARITY_COLORS[item.rarity] ?? '#555' : '#333'}`,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: item ? 'pointer' : 'default',
          fontSize: 10,
          color: '#555',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item ? (
          <span style={{ color: RARITY_COLORS[item.rarity] ?? '#fff', fontSize: 9, textAlign: 'center', padding: 2 }}>
            {item.name.substring(0, 8)}
          </span>
        ) : '—'}
      </div>
      {hover && item && <ItemTooltip item={item} />}
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export default function InventoryWindow({ onClose }: Props) {
  const inventory = useInventoryStore((s) => s.inventory);
  const equipment = useInventoryStore((s) => s.equipment);
  const equipItem = useInventoryStore((s) => s.equipItem);
  const unequipItem = useInventoryStore((s) => s.unequipItem);

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
        minWidth: 560,
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 0 30px rgba(0,0,0,0.9)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>Inventory</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: '1px solid #555', color: '#aaa', cursor: 'pointer', borderRadius: 3, padding: '2px 8px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Equipment */}
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Equipment</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SLOTS.map((slot) => (
              <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#666', width: 60 }}>{SLOT_LABELS[slot]}</span>
                <ItemSlot
                  item={equipment[slot]}
                  onClick={() => equipment[slot] && unequipItem(slot)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: '#334' }} />

        {/* Inventory bags */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
            Items ({inventory.length})
          </div>
          {inventory.length === 0 && (
            <div style={{ color: '#555', fontSize: 12 }}>No items</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {inventory.map((item) => (
              <div key={item.id} style={{ position: 'relative' }}>
                <ItemSlot item={item} onClick={() => equipItem(item)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: '#555' }}>
        Click equipment slot to unequip · Click item to equip
      </div>
    </div>
  );
}
