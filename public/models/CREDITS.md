# Models in this scene

Everything here is **CC0** — public domain, no attribution required. It is
listed anyway, because the repository's rule is that art carries its source,
and because the next person will want to know where to get more of it.

| File | Pack | Author |
| --- | --- | --- |
| `Warrior.glb`, `Warrior_Texture.png`, `Warrior_Sword_Texture.png` | RPG Characters (Nov 2020) | [Quaternius](https://quaternius.com/) |
| everything else (`tree_*`, `plant_*`, `rock_*`, `fence_*`, …) | Nature Kit | [Kenney](https://kenney.nl/assets/nature-kit) |

`Warrior.glb` was converted from the pack's `.blend` with Blender 4.5:

```
blender -b Warrior.blend --python-expr \
  "import bpy; bpy.ops.export_scene.gltf(filepath='Warrior.glb', export_animations=True)"
```

The pack ships FBX/OBJ/Blend but no glTF, and the conversion keeps all
fourteen animation clips. The textures are not packed into the `.glb` — the
material names survive the export, so the renderer binds the images back by
name.

**Kenney's colours are not used as authored.** The Nature Kit is a saturated
teal-and-orange house palette and Quaternius's characters are muted earth
tones; side by side the trees glow. Every Kenney material is a flat
`baseColorFactor` with no texture and there are only twelve distinct names, so
`spike/main.ts` remaps them at load. See the wiki: **첫 장면**.

Nothing under `spike/data/` is committed. That is baked from a WoW client and
does not belong in this repository — see the wiki: **저작권과 배포 경계**.
