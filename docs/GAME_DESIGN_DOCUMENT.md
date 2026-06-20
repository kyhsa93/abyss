# Abyss

## Game Design Document (GDD)

Version: 0.2
Status: Planning
Repository: https://github.com/kyhsa93/game

---

# Vision

Abyss는 디아블로에서 영감을 받은 브라우저 기반 핵앤슬래시 RPG이다.

핵심 목표는 다음 네 가지 재미를 제공하는 것이다.

- 빠른 전투
- 의미 있는 아이템 파밍
- 지속적인 캐릭터 성장
- 끝없는 던전 도전

초기 버전은 서버 없이 동작하며 LocalStorage 기반 저장을 사용한다.

---

# Core Gameplay Loop

Town
-> Dungeon
-> Combat
-> Loot
-> Level Up
-> Equipment Upgrade
-> Boss Kill
-> Next Floor
-> Repeat

---

# MVP Scope

## Character

- Warrior 클래스
- 레벨 시스템
- 장비 시스템
- 인벤토리

## Combat

- 이동
- 기본 공격
- 스킬
- 몬스터 AI
- 데미지 계산

## Content

- 3종 일반 몬스터
- 엘리트 몬스터
- 보스 몬스터
- 무한 던전

## Progression

- 경험치
- 레벨업
- 랜덤 아이템
- 장비 강화 기반 성장

---

# Character Design

## Warrior

Role: Melee Fighter

Base Stats

- HP: 100
- MP: 50
- Attack: 10
- Defense: 5
- Critical Chance: 5%
- Attack Speed: 1.0
- Move Speed: 100

---

# Skill System

## Basic Attack

근접 단일 공격

## Whirlwind

- Weapon Damage 150%
- Radius Damage
- Cooldown 5s

## Charge

- Dash Forward
- Damage Enemies In Path
- Cooldown 8s

---

# Monster System

## Normal Monsters

### Slime
- Slow
- Low HP

### Goblin
- Fast
- Low Defense

### Skeleton
- Balanced

## Elite Monsters

- HP x5
- Attack x2
- Better Loot

## Boss Monsters

- Unique Pattern
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

## Item Rarity

- Common
- Magic
- Rare
- Epic
- Legendary

## Random Affixes

- Attack
- Defense
- HP
- Critical Chance
- Attack Speed
- Move Speed

---

# Dungeon System

Each Floor

- Start Room
- Combat Rooms
- Elite Room
- Boss Room

Difficulty increases every floor.

---

# Technical Stack

- Vue 3
- TypeScript
- Phaser 3
- Pinia
- LocalStorage

---

# Future Roadmap

Phase 2

- Skill Tree
- Additional Classes
- Set Items
- More Bosses

Phase 3

- Account System
- Ranking
- Seasons
- Multiplayer

---

# Success Criteria

Player should always feel:

"One More Run"
