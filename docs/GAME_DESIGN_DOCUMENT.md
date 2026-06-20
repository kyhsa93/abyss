# Abyss

## Game Design Document (GDD)

Version: 0.3
Status: Planning
Repository: https://github.com/kyhsa93/game

---

# Vision

Abyss는 디아블로 스타일의 브라우저 기반 핵앤슬래시 액션 RPG이다.

핵심 경험

- 빠른 전투
- 의미 있는 아이템 파밍
- 지속적인 성장
- 끝없는 던전 도전

초기 버전은 서버 없이 LocalStorage 기반으로 동작한다.

향후 서버를 추가하여 계정, 시즌, 랭킹, 멀티플레이를 지원한다.

---

# Product Goals

## MVP

플레이 가능한 핵앤슬래시 게임 구현

포함 기능

- 캐릭터 이동
- 몬스터 AI
- 전투
- 경험치
- 레벨업
- 아이템 드랍
- 장비 시스템
- 인벤토리
- 랜덤 던전
- 보스 전투
- 저장 / 불러오기

---

# Core Gameplay Loop

Town
→ Dungeon
→ Combat
→ Loot
→ Level Up
→ Equipment Upgrade
→ Boss Kill
→ Next Floor
→ Repeat

---

# Character Design

## Warrior

근접 전투 중심 클래스

### Base Stats

- HP: 100
- MP: 50
- Attack: 10
- Defense: 5
- Critical Chance: 5%
- Attack Speed: 1.0
- Move Speed: 100

---

# Combat System

## Basic Attack

- 근접 공격
- 자동 공격 지원 예정

## Skills

### Whirlwind

- Damage: 150%
- Radius Attack
- Cooldown: 5s

### Charge

- Dash Forward
- Damage On Path
- Cooldown: 8s

---

# Monster System

## Normal Monsters

### Slime
- Low HP
- Slow

### Goblin
- Fast
- Low Defense

### Skeleton
- Balanced

## Elite Monsters

- HP x5
- Damage x2
- Better Loot

## Boss Monsters

- Unique Mechanics
- Guaranteed Reward

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

## Rarity

- Common
- Magic
- Rare
- Epic
- Legendary

## Random Affixes

- Attack
- HP
- Defense
- Critical Chance
- Attack Speed
- Move Speed

---

# Dungeon System

Floor Structure

- Start Room
- Combat Room
- Combat Room
- Elite Room
- Boss Room

Difficulty increases every floor.

---

# Save System

Storage: LocalStorage

Saved Data

- Character
- Inventory
- Equipment
- Gold
- Floor Progress

---

# Technology Stack

## Frontend

- React 19
- TypeScript
- Vite

## Game Engine

- Phaser 3

## State Management

- Zustand

## Styling

- TailwindCSS

## Persistence

- LocalStorage

---

# Future Backend Stack

- NestJS
- PostgreSQL
- Redis
- Docker

---

# Roadmap

## Phase 1

MVP Release

## Phase 2

- Skill Tree
- Additional Classes
- Set Items
- More Bosses

## Phase 3

- Account System
- Ranking
- Seasons
- Multiplayer

---

# Success Criteria

Player should feel:

One More Run

after every dungeon completion.
