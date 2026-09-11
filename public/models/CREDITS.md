# Models

Everything here is **CC0** — public domain, no attribution required. Listed
anyway, because the repository's rule is that art carries its source, and
because the next person will want to know where to get more of it.

| Files | Pack | Author |
| --- | --- | --- |
| `Warrior.glb`, `Warrior_*_Texture.png` | RPG Characters (Nov 2020) | [Quaternius](https://quaternius.com/) |
| `nature/CommonTree_*`, `Pine_*`, `DeadTree_*`, `Bush_*`, `Fern_*`, `Grass_*`, `Flower_*`, `Clover_*`, `Mushroom_*`, `Rock_*`, `Pebble_*` | Stylized Nature MegaKit | [Quaternius](https://quaternius.com/packs/stylizednaturemegakit.html) |
| `nature/Prop_WoodenFence_*`, `Prop_Crate`, `Prop_Wagon` | Medieval Village MegaKit | [Quaternius](https://quaternius.com/) |

All three are one author on purpose. The first attempt mixed Kenney's Nature
Kit with these characters and the trees glowed teal beside them — not a bug,
just two house styles. One author is the cheapest way to not have that problem.

## What was changed on the way in

**`Warrior.glb` was converted from the pack's `.blend`** with Blender 4.5; the
pack ships FBX/OBJ/Blend but no glTF. All fourteen animation clips survive.
Its textures are not packed into the `.glb` — the material names do survive, so
the renderer binds the images back by name.

```
blender -b Warrior.blend --python-expr \
  "import bpy; bpy.ops.export_scene.gltf(filepath='Warrior.glb', export_animations=True)"
```

**Normal maps were dropped and diffuse textures reduced to 512px.** The kit
ships 2048² PNGs: 41 MiB on disk and, more to the point, 16 MiB of decode
memory *each*. Fourteen of them is a quarter of a gigabyte for scenery.

Two traps are worth writing down, because both were fallen into:

- A glob of `*Normal*` matches `Bark_NormalTree.png`. Normal maps end in
  `_Normal`; match the suffix, or delete the diffuse of every "normal tree" in
  the pack and spend a while wondering why the trees are white.
- **Resizing an alpha-cutout texture bleeds the transparent colour into the
  opaque pixels.** These leaves are green on opaque white, so a plain LANCZOS
  downscale turned every canopy pale. Premultiply by alpha, resize, then
  divide it back out.

**`TwistedTree_*` and `Bush_Common` are not included.** They share a leaf
texture that averages a strong red — the kit encodes season in the variant, and
Elwynn is a green temperate forest.
