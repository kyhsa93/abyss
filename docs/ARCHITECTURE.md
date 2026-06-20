# ARCHITECTURE

## Technology

- React 19
- TypeScript
- Vite
- Phaser 3
- Zustand
- TailwindCSS
- LocalStorage

## Architecture Layers

React = UI
Phaser = Game Runtime
Zustand = Shared State
LocalStorage = Persistence

## Folder Structure

src/
├─ app/
├─ game/
│  ├─ scenes/
│  ├─ entities/
│  ├─ systems/
│  ├─ managers/
│  ├─ generators/
│  └─ data/
├─ ui/
├─ store/
├─ services/
└─ types/

## Scenes

- BootScene
- PreloadScene
- TownScene
- DungeonScene
- UIScene

## Core Entities

- Player
- Monster
- EliteMonster
- BossMonster
- ItemDrop

## Managers

- SaveManager
- DungeonManager
- SpawnManager
- ItemManager
- TargetManager

## Systems

- InputSystem
- PathfindingSystem
- MovementSystem
- CombatSystem
- SkillSystem
- LootSystem
- ExperienceSystem
- SaveSystem

## Click To Move Flow

Mouse Click
→ Target Position
→ Pathfinding
→ Move

## Combat Flow

Select Target
→ Move Into Range
→ Attack
→ Hit Check
→ Damage
→ Loot

## State Stores

- playerStore
- inventoryStore
- equipmentStore
- dungeonStore
- settingsStore

## Save Strategy

Auto Save Every 30 Seconds

Save Triggers
- Level Up
- Item Pickup
- Floor Complete
- Exit Game