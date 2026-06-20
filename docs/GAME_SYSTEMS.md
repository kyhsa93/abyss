# Game Systems

## Level System

Max Level: 100

Experience Formula

RequiredExp(level) = floor(100 * (1.15 ^ level))

---

## Damage Formula

Damage = max(1, (Attack * SkillMultiplier) - Defense)

Critical Damage

FinalDamage = Damage * 2

Default Critical Chance = 5%

---

## Monster Scaling

Per Floor

HP = BaseHP * (1 + Floor * 0.08)

Attack = BaseAttack * (1 + Floor * 0.05)

Experience = BaseExp * (1 + Floor * 0.06)

---

## Loot System

Base Drop Chance = 30%

Rarity

- Common 60%
- Magic 25%
- Rare 10%
- Epic 4%
- Legendary 1%

Legendary chance increases every 10 floors.

---

## Item Affixes

Common: 1
Magic: 2
Rare: 3
Epic: 4
Legendary: 5

Possible Affixes

- Attack
- HP
- Defense
- Critical Chance
- Attack Speed
- Move Speed

---

## Gold Economy

Monster Gold = Floor * 2

Boss Gold = Floor * 25

---

## Endgame

- Infinite Dungeon
- Legendary Farming
- Floor Progression
- Build Optimization
