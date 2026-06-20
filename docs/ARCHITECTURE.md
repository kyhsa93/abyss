# Architecture

## Tech Stack

- React 19
- TypeScript
- Vite
- Phaser 3
- Zustand
- TailwindCSS

---

# High Level Architecture

React = UI Layer
Phaser = Game Layer
Zustand = Shared State
LocalStorage = Persistence

---

# Folder Structure

src/
├─ app/
├─ game/
│  ├─ scenes/
│  ├─ entities/
│  ├─ systems/
│  ├─ managers/
│  └─ data/
├─ ui/
├─ store/
├─ hooks/
├─ services/
└─ types/

---

# Phaser Scenes

- BootScene
- PreloadScene
- TownScene
- DungeonScene
- UIScene

---

# Entity Layer

- Player
- Monster
- EliteMonster
- BossMonster
- Projectile
- ItemDrop

---

# System Layer

- CombatSystem
- MovementSystem
- LootSystem
- ExperienceSystem
- SaveSystem
- DungeonSystem

---

# State Management

Zustand Stores

- playerStore
- inventoryStore
- equipmentStore
- gameStore

---

# Save Strategy

LocalStorage

Keys

- player
- inventory
- equipment
- progress
