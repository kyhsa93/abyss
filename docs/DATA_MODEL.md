# DATA MODEL

## Player

```ts
interface Attributes {
  strength: number;
  dexterity: number;
  vitality: number;
  energy: number;
}

interface Player {
  id: string;
  name: string;
  level: number;
  exp: number;
  attributes: Attributes;
  statPoints: number;
  skillPoints: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: number;
}
```

## Item

```ts
interface Affix {
  id: string;
  name: string;
  value: number;
}

interface Item {
  id: string;
  baseType: string;
  rarity: 'Normal'|'Magic'|'Rare'|'Set'|'Unique';
  itemLevel: number;
  affixes: Affix[];
}
```

## Equipment

```ts
interface Equipment {
  weapon?: Item;
  helmet?: Item;
  armor?: Item;
  gloves?: Item;
  boots?: Item;
  ring1?: Item;
  ring2?: Item;
  necklace?: Item;
}
```

## Monster

```ts
interface Monster {
  id: string;
  name: string;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  accuracy: number;
  expReward: number;
}
```

## SaveData

```ts
interface SaveData {
  version: string;
  player: Player;
  equipment: Equipment;
  inventory: Item[];
  floor: number;
  timestamp: number;
}
```