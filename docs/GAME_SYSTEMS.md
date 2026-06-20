# GAME SYSTEMS

## Character Progression

Max Level: 100

Level Up Rewards
- Stat Points +5
- Skill Points +1

Attributes
- Strength
- Dexterity
- Vitality
- Energy

Experience Formula

RequiredExp(level) = floor(100 * (1.15 ^ level))

---

## Combat Rules

HitChance = Accuracy / (Accuracy + Evasion)

Minimum Hit Chance: 5%
Maximum Hit Chance: 95%

Damage Formula

Damage = max(1, ((Attack * SkillMultiplier) - Defense))

Critical Strike

Critical Damage = Damage × 2

Damage Types
- Physical
- Fire
- Cold
- Lightning
- Poison

Resistance Cap = 75%

---

## Item Rules

Rarity
- Normal
- Magic
- Rare
- Set
- Unique

Affix Count
- Normal: 0
- Magic: 1-2
- Rare: 3-6
- Set: Fixed
- Unique: Fixed

Item Level (ilvl)

Item Level = Monster Level

---

## Loot Rules

Base Drop Chance = 30%

Rarity Distribution
- Normal 60%
- Magic 25%
- Rare 10%
- Set 4%
- Unique 1%

Higher Floors increase Rare, Set and Unique chances.

---

## Monster Scaling

Per Floor

HP = BaseHP * (1 + Floor * 0.08)
Attack = BaseAttack * (1 + Floor * 0.05)
Experience = BaseExp * (1 + Floor * 0.06)
Gold = BaseGold * (1 + Floor * 0.05)

Elite Monsters
- HP ×5
- Damage ×2

Boss Monsters
- HP ×20
- Guaranteed Reward

---

## Infinite Abyss

No maximum floor.

Goals
- Unique Hunting
- Set Collection
- Build Optimization
- Highest Floor Challenge