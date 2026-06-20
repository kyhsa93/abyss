# Data Model

## Player

```ts
interface Player {
  id: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  criticalChance: number;
  attackSpeed: number;
  moveSpeed: number;
}
```

## Item

```ts
interface Item {
  id: string;
  name: string;
  rarity: ItemRarity;
  slot: EquipmentSlot;
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
  ring?: Item;
  necklace?: Item;
}
```

## Monster

```ts
interface Monster {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  expReward: number;
}
```

## DungeonFloor

```ts
interface DungeonFloor {
  floor: number;
  rooms: Room[];
}
```
