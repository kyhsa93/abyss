import { useState } from 'react';
import { useInventoryStore } from '../store/inventoryStore';
import { usePlayerStore } from '../store/playerStore';
import { getUpgradeCost, getUpgradeIncrement } from '../game/systems/BlacksmithSystem';
import { Item } from '../types';

const RARITY_COLORS: Record<string, string> = {
  Normal: '#cccccc',
  Magic: '#4488ff',
  Rare: '#ffee22',
  Set: '#22ee88',
  Unique: '#ffaa44',
};

interface Props {
  onClose: () => void;
}

function ItemRow({ item, right }: { item: Item; right: React.ReactNode }) {
  const color = RARITY_COLORS[item.rarity] ?? '#fff';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        background: '#11112299',
        border: '1px solid #2a2a44',
        borderRadius: 3,
        marginBottom: 4,
        gap: 12,
      }}
    >
      <div>
        <span style={{ color, fontSize: 13 }}>{item.name}</span>
        {item.enhanceLevel > 0 && <span style={{ color: '#ffdd66', fontSize: 12 }}> +{item.enhanceLevel}</span>}
        <div style={{ color: '#666', fontSize: 10 }}>{item.rarity} — ilvl {item.itemLevel}</div>
      </div>
      {right}
    </div>
  );
}

function SellTab() {
  const inventory = useInventoryStore((s) => s.inventory);
  const sellItem = useInventoryStore((s) => s.sellItem);

  if (inventory.length === 0) {
    return <div style={{ color: '#555', fontSize: 12 }}>No items to sell</div>;
  }

  return (
    <div>
      {inventory.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          right={
            <button
              onClick={() => sellItem(item.id)}
              style={{
                background: '#223', border: '1px solid #446', color: '#ffd700',
                cursor: 'pointer', borderRadius: 3, padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap',
              }}
            >
              Sell · {item.value}g
            </button>
          }
        />
      ))}
    </div>
  );
}

function UpgradeTab() {
  const inventory = useInventoryStore((s) => s.inventory);
  const equipment = useInventoryStore((s) => s.equipment);
  const upgradeItem = useInventoryStore((s) => s.upgradeItem);
  const gold = usePlayerStore((s) => s.gold);

  const equippedItems = Object.values(equipment).filter(Boolean) as Item[];
  const allItems = [...equippedItems, ...inventory];

  if (allItems.length === 0) {
    return <div style={{ color: '#555', fontSize: 12 }}>No items to upgrade</div>;
  }

  return (
    <div>
      {allItems.map((item) => {
        const cost = getUpgradeCost(item);
        const inc = getUpgradeIncrement(item);
        const canAfford = gold >= cost;
        const statLabel = item.baseAttack > 0 && item.baseDefense > 0
          ? `+${inc} ATK/DEF`
          : item.baseAttack > 0
            ? `+${inc} ATK`
            : item.baseDefense > 0
              ? `+${inc} DEF`
              : 'no stat bonus';

        return (
          <ItemRow
            key={item.id}
            item={item}
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#888', fontSize: 11, whiteSpace: 'nowrap' }}>{statLabel}</span>
                <button
                  onClick={() => upgradeItem(item.id)}
                  disabled={!canAfford}
                  style={{
                    background: canAfford ? '#223' : '#181818',
                    border: `1px solid ${canAfford ? '#446' : '#333'}`,
                    color: canAfford ? '#88aaff' : '#555',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    borderRadius: 3, padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap',
                  }}
                >
                  Upgrade · {cost}g
                </button>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

export default function BlacksmithWindow({ onClose }: Props) {
  const [tab, setTab] = useState<'sell' | 'upgrade'>('sell');
  const gold = usePlayerStore((s) => s.gold);

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
        maxHeight: '85vh',
        overflow: 'auto',
        boxShadow: '0 0 30px rgba(0,0,0,0.9)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>Blacksmith</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: '1px solid #555', color: '#aaa', cursor: 'pointer', borderRadius: 3, padding: '2px 8px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['sell', 'upgrade'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? '#223' : 'none',
                border: '1px solid #446',
                color: tab === t ? '#fff' : '#888',
                cursor: 'pointer', borderRadius: 3, padding: '4px 12px', fontSize: 12, textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <span style={{ color: '#ffd700', fontSize: 13 }}>{gold}g</span>
      </div>

      {tab === 'sell' ? <SellTab /> : <UpgradeTab />}
    </div>
  );
}
