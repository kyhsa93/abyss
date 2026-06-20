# Abyss

# Diablo II Inspired Browser ARPG

Version: 0.4
Status: Planning

---

# Vision

Abyss는 Diablo II에서 영감을 받은 브라우저 기반 싱글플레이 핵앤슬래시 RPG이다.

핵심 목표

- 클릭 이동
- 클릭 전투
- 랜덤 아이템 파밍
- 캐릭터 빌드 연구
- 무한 던전 도전

초기 버전은 서버 없이 LocalStorage 기반으로 동작한다.

---

# Core Gameplay Loop

Town
→ Dungeon
→ Kill Monsters
→ Loot Items
→ Gain Experience
→ Improve Build
→ Defeat Boss
→ Descend Deeper
→ Repeat

---

# Controls

- Left Click : Move
- Left Click Enemy : Attack
- Right Click : Skill
- I : Inventory
- C : Character
- ESC : Menu

---

# Character System

## Initial Class

- Warrior

## Attributes

- Strength
- Dexterity
- Vitality
- Energy

## Level Up Rewards

Every Level:

- Stat Points +5
- Skill Points +1

---

# Combat System

## Attack Flow

Target Selection
→ Move Into Range
→ Attack
→ Damage Calculation

## Damage Types

- Physical
- Fire
- Cold
- Lightning
- Poison

---

# Item System

## Equipment Slots

- Weapon
- Helmet
- Armor
- Gloves
- Boots
- Ring
- Necklace

## Item Rarity

- Normal
- Magic
- Rare
- Set
- Unique

## Item Generation

Base Item + Affixes = Final Item

Example:

Long Sword + Attack + Critical Chance

---

# Dungeon System

Town
↓
Floor 1
↓
Floor 2
↓
Floor 3
↓
Boss

## Goal

Infinite Abyss Progression

---

# Endgame

- Infinite Dungeon
- Unique Item Hunting
- Set Collection
- Build Optimization
- Highest Floor Challenge

---

# Technology Stack

## Frontend

- React 19
- TypeScript
- Vite

## Game Engine

- Phaser 3

## State

- Zustand

## Storage

- LocalStorage

---

# Future Online Features

- Account System
- Seasons
- Rankings
- Multiplayer

---

# Success Criteria

Player should always feel:

One More Run