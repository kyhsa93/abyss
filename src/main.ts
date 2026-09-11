/**
 * The first scene: the client's own Elwynn terrain, drawn with art we own.
 *
 * Built to answer what the render decision left open — camera angle, whether
 * flat ground looks cheap beside hand-painted models, what the triangle count
 * really is.  It was a spike; deleting the old prototype left it as the only
 * code here, so it sits at the front instead of off to one side.  There is
 * still no simulation in it.
 *
 * The terrain comes from `pipeline/bake_terrain.py`, which reads the client's
 * `.adt` files.  Its output is not committed — see the wiki's boundary page.
 * Without it this page has nothing to draw, which is the honest state of the
 * project: the path that fills that gap without a client is not built yet.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type Doodad = { k: string; x: number; y: number; z: number; r: number; s: number }
type Meta = {
  width: number; height: number; unit: number
  x0: number; y0: number; centre: [number, number]; radius: number
  zMin: number; zMax: number
  doodads: Doodad[]
}

/**
 * World axes to scene axes.
 *
 * The client's world is +X north, +Y west, +Z up.  Three's is +Y up and the
 * camera looks down -Z.  Mapping north to -Z means "up the screen is north"
 * when the camera sits south of the subject, which is the orientation every
 * map of this place is drawn in.
 */
const toScene = (x: number, y: number, z: number, cx: number, cy: number) =>
  new THREE.Vector3(-(y - cy), z, -(x - cx))

const hud = document.getElementById('hud') as HTMLDivElement

/**
 * The two packs do not share a palette, and that is the harder half.
 *
 * Kenney's Nature Kit is authored in a saturated teal-and-orange house style —
 * the kit's own preview sheet is teal trees on orange ground, so this is their
 * intent, not a mis-read on our side.  Quaternius's characters are muted earth
 * tones.  Put them in one scene and the trees glow next to the warrior.
 *
 * What makes it cheap to fix: every Kenney material is a flat `baseColorFactor`
 * with no texture, and there are only twelve distinct names across the whole
 * kit.  So the palette is a lookup, applied once at load.  Twelve numbers buy
 * a scene that reads as one place.
 */
const PALETTE: Record<string, number> = {
  leafsGreen: 0x4e7a3a,
  leafsDark: 0x3d6130,
  grass: 0x5f8c42,
  woodBark: 0x6b4a30,
  woodBarkDark: 0x55391f,
  woodDark: 0x5a3d27,
  wood: 0x7a563a,
  woodInner: 0xa8875f,
  dirt: 0x7a5c3c,
  colorRed: 0x8c4238,
  colorRedDark: 0x6f3129,
  _defaultMat: 0x9b968b,
}

/**
 * Every one of these packs exports `metallicFactor: 1`.
 *
 * glTF's default is fully metallic, and a fully metallic surface with nothing
 * to reflect is black — or, with only a hemisphere light, a muddy tint of the
 * sky.  Kenney's trees came out teal and Quaternius's warrior came out a
 * silhouette, and both were this one line.  It is not a per-pack quirk; it is
 * what the format's default does to art authored as flat colour.
 */
function dress(root: THREE.Object3D, repalette: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      if (mat.metalness === undefined) continue
      mat.metalness = 0
      mat.roughness = 0.85
      if (repalette && PALETTE[mat.name] !== undefined) mat.color.setHex(PALETTE[mat.name])
      mat.needsUpdate = true
    }
  })
}

// Kenney's Nature Kit is modelled around one unit to a metre and its trees are
// waist-high next to a WoW yard.  These multipliers are not derived from
// anything: they were set by looking at the result, which is the honest label
// for them until something measures the real doodad sizes.
const KIND: Record<string, { model: string[]; scale: number }> = {
  tree: { model: ['tree_oak', 'tree_default', 'tree_tall'], scale: 7.0 },
  pine: { model: ['tree_pineTallA'], scale: 7.0 },
  bush: { model: ['plant_bushLarge', 'plant_bush'], scale: 2.4 },
  fence: { model: ['fence_simple'], scale: 2.0 },
  rock: { model: ['rock_largeA', 'rock_smallA'], scale: 3.4 },
  lily: { model: ['lily_large'], scale: 2.0 },
  water_plant: { model: ['grass_large'], scale: 2.0 },
  grass: { model: ['grass_large'], scale: 2.0 },
  flower: { model: ['flower_redA'], scale: 1.6 },
  crop: { model: ['crops_wheatStageB'], scale: 2.0 },
  mushroom: { model: ['mushroom_red'], scale: 1.6 },
  stump: { model: ['log_stack'], scale: 2.0 },
  log: { model: ['log_stack'], scale: 2.0 },
  barrel: { model: ['pot_large'], scale: 1.8 },
  lamp: { model: ['sign'], scale: 2.6 },
  sign: { model: ['sign'], scale: 2.2 },
  tent: { model: ['tent_smallClosed'], scale: 3.0 },
}

async function main() {
  const head = await fetch('./data/terrain.json')
  if (!head.ok) {
    // The deployed page reaches here, and that is not a bug to hide: the
    // terrain is baked from a client and cannot be committed, and the path
    // that fills the gap without one is not built yet.  Say so.
    hud.textContent = [
      'No terrain.',
      '',
      'It is baked from a WoW 3.3.5a client and is not committed —',
      'see the wiki page 저작권과 배포 경계.',
      '',
      '  pip3 install mpyq',
      '  npm run bake -- /path/to/wow-3.3.5a public/data',
    ].join('\n')
    return
  }
  const meta: Meta = await head.json()
  const raw = await (await fetch('./data/terrain.bin')).arrayBuffer()
  const heights = new Float32Array(raw)
  const { width: W, height: H, unit: U, x0, y0 } = meta
  const [cx, cy] = meta.centre

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x93b6cf)
  // Fog was at 260 and it turned every tree teal: an orthographic camera sits a
  // full `dist` back from its target, so half the view was already inside the
  // fog at a 110 yard zoom.  It belongs at the horizon, not in the foreground.
  scene.fog = new THREE.Fog(0x93b6cf, 700, 2400)

  const sun = new THREE.DirectionalLight(0xfff2e0, 2.4)
  sun.position.set(120, 200, 90)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const d = 160
  const sc = sun.shadow.camera as THREE.OrthographicCamera
  sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = 700
  scene.add(sun)
  scene.add(new THREE.HemisphereLight(0xcdd9e6, 0x55603c, 0.55))

  const height = (I: number, J: number) =>
    heights[Math.min(W - 1, Math.max(0, I)) * H + Math.min(H - 1, Math.max(0, J))]

  /** Terrain at a given stride, so the triangle budget can be tested by eye. */
  function buildTerrain(stride: number) {
    const w = Math.floor((W - 1) / stride) + 1
    const h = Math.floor((H - 1) / stride) + 1
    const pos = new Float32Array(w * h * 3)
    const col = new Float32Array(w * h * 3)
    const rock = new THREE.Color(0x7d7466)
    const grass = new THREE.Color(0x5f8c42)
    const low = new THREE.Color(0x4f7a3f)
    const c = new THREE.Color()
    for (let a = 0; a < w; a++) {
      for (let b = 0; b < h; b++) {
        const I = a * stride, J = b * stride
        const z = height(I, J)
        const p = (a * h + b) * 3
        // grid index to world, then world to scene
        const wx = x0 - I * U, wy = y0 - J * U
        pos[p] = -(wy - cy); pos[p + 1] = z; pos[p + 2] = -(wx - cx)
        // Slope decides rock or grass; height only tints.  Colour alone is the
        // whole of the ground's material — see the wiki: "바닥은 색 빼고 결만".
        const dzx = height(I + stride, J) - height(I - stride, J)
        const dzy = height(I, J + stride) - height(I, J - stride)
        const slope = Math.hypot(dzx, dzy) / (2 * stride * U)
        c.copy(z < 60 ? low : grass).lerp(rock, Math.min(1, slope * 1.7))
        // Flat colour reads as a wash rather than as ground.  A cheap
        // deterministic wobble per vertex gives it grain without giving it a
        // texture — which is the whole of what the art direction allows here.
        const n = Math.sin(I * 12.9898 + J * 78.233) * 43758.5453
        c.offsetHSL(0, 0, ((n - Math.floor(n)) - 0.5) * 0.055)
        col[p] = c.r; col[p + 1] = c.g; col[p + 2] = c.b
      }
    }
    const idx: number[] = []
    for (let a = 0; a < w - 1; a++)
      for (let b = 0; b < h - 1; b++) {
        const i0 = a * h + b, i1 = i0 + 1, i2 = i0 + h, i3 = i2 + 1
        // Winding, not a detail: the obvious order puts every normal face-down
        // and the ground vanishes behind back-face culling — which looks like
        // "the terrain did not load", not like "the terrain is inside out".
        idx.push(i0, i2, i1, i1, i2, i3)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }))
    m.receiveShadow = true
    return { mesh: m, tris: idx.length / 3 }
  }

  let stride = 1
  let terrain = buildTerrain(stride)
  scene.add(terrain.mesh)

  const groundAt = (wx: number, wy: number) =>
    height(Math.round((x0 - wx) / U), Math.round((y0 - wy) / U))

  // --- doodads, instanced per kind ---------------------------------------
  const loader = new GLTFLoader()
  const cache = new Map<string, Promise<THREE.Object3D>>()
  const load = (name: string) => {
    if (!cache.has(name))
      cache.set(name, loader.loadAsync(`./models/${name}.glb`).then((g) => g.scene))
    return cache.get(name)!
  }

  let doodadTris = 0
  let instances = 0
  const byModel = new Map<string, { d: Doodad; scale: number }[]>()
  for (const dd of meta.doodads) {
    const k = KIND[dd.k]
    if (!k) continue
    const pick = k.model[(Math.abs(Math.round(dd.x * 7 + dd.y * 13)) % k.model.length)]
    if (!byModel.has(pick)) byModel.set(pick, [])
    byModel.get(pick)!.push({ d: dd, scale: k.scale })
  }

  const dummy = new THREE.Object3D()
  await Promise.all(
    [...byModel].map(async ([name, list]) => {
      const src = await load(name)
      dress(src, true)
      const parts: THREE.Mesh[] = []
      src.traverse((o) => { if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh) })
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material as THREE.Material, list.length)
        inst.castShadow = true
        inst.receiveShadow = true
        list.forEach(({ d: dd, scale }, i) => {
          const g = groundAt(dd.x, dd.y)
          dummy.position.copy(toScene(dd.x, dd.y, g, cx, cy))
          dummy.rotation.set(0, THREE.MathUtils.degToRad(dd.r), 0)
          const s = scale * (0.75 + (Math.abs(Math.round(dd.x * 3 + dd.y * 5)) % 50) / 100)
          dummy.scale.setScalar(s)
          dummy.updateMatrix()
          const m = new THREE.Matrix4().copy(part.matrixWorld).premultiply(dummy.matrix)
          inst.setMatrixAt(i, m)
        })
        inst.instanceMatrix.needsUpdate = true
        scene.add(inst)
        const c = part.geometry.index ? part.geometry.index.count / 3
          : part.geometry.attributes.position.count / 3
        doodadTris += c * list.length
        instances += list.length
      }
    }),
  )

  // --- the character -----------------------------------------------------
  const tex = new THREE.TextureLoader()
  const skin = await tex.loadAsync('./models/Warrior_Texture.png')
  const swordTex = await tex.loadAsync('./models/Warrior_Sword_Texture.png')
  for (const t of [skin, swordTex]) { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false }

  const gltf = await loader.loadAsync('./models/Warrior.glb')
  const hero = gltf.scene
  dress(hero, false)
  hero.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      // The export carried material *names* but no image: the textures ship
      // beside the meshes in this pack, so they are bound back by name.
      mat.map = mat.name.includes('Sword') ? swordTex : skin
      mat.needsUpdate = true
    }
  })
  // The human warrior's own starting spot, out of `playercreateinfo`.
  const START: [number, number] = [-8949.95, -132.493]
  hero.position.copy(toScene(START[0], START[1], groundAt(...START), cx, cy))
  hero.scale.setScalar(1.15)
  scene.add(hero)
  const mixer = new THREE.AnimationMixer(hero)
  const idle = gltf.animations.find((a) => a.name === 'Idle_Weapon') ?? gltf.animations[0]
  mixer.clipAction(idle).play()

  const heroTris = (() => {
    let t = 0
    hero.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) t += m.geometry.index ? m.geometry.index.count / 3
        : m.geometry.attributes.position.count / 3
    })
    return t
  })()

  // --- camera ------------------------------------------------------------
  let yaw = Math.PI * 0.25
  let pitch = THREE.MathUtils.degToRad(48)
  let dist = 85
  let ortho = true
  const target = hero.position.clone().setY(hero.position.y + 2)
  let camera: THREE.Camera = makeCamera()

  function makeCamera(): THREE.Camera {
    const aspect = innerWidth / innerHeight
    if (ortho) {
      const hh = dist * 0.42
      return new THREE.OrthographicCamera(-hh * aspect, hh * aspect, hh, -hh, 0.5, 3000)
    }
    return new THREE.PerspectiveCamera(38, aspect, 0.5, 3000)
  }
  function place() {
    const r = Math.cos(pitch) * dist
    camera.position.set(
      target.x + Math.sin(yaw) * r,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * r,
    )
    camera.lookAt(target)
  }
  place()

  let drag = false, lx = 0, ly = 0
  addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY })
  addEventListener('pointerup', () => { drag = false })
  addEventListener('pointermove', (e) => {
    if (!drag) return
    yaw -= (e.clientX - lx) * 0.006
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - ly) * 0.004, 0.15, 1.4)
    lx = e.clientX; ly = e.clientY; place()
  })
  addEventListener('wheel', (e) => {
    dist = THREE.MathUtils.clamp(dist * (1 + Math.sign(e.deltaY) * 0.12), 12, 600)
    camera = makeCamera(); place()
  }, { passive: true })
  addEventListener('keydown', (e) => {
    if (e.key === '[') pitch = Math.max(0.15, pitch - 0.06)
    if (e.key === ']') pitch = Math.min(1.4, pitch + 0.06)
    if (e.key === 'o') { ortho = !ortho; camera = makeCamera() }
    if ('1234'.includes(e.key)) {
      scene.remove(terrain.mesh)
      terrain.mesh.geometry.dispose()
      stride = Number(e.key)
      terrain = buildTerrain(stride)
      scene.add(terrain.mesh)
    }
    place()
  })
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight)
    camera = makeCamera(); place()
  })

  // Driven from the screenshot script: a scene is only finished when it has
  // been looked at, and looking at it means putting the camera somewhere on
  // purpose rather than wherever it happened to start.
  ;(window as unknown as { __cam: (o: Record<string, number | boolean>) => void }).__cam = (o) => {
    if (o.yaw !== undefined) yaw = THREE.MathUtils.degToRad(o.yaw as number)
    if (o.pitch !== undefined) pitch = THREE.MathUtils.degToRad(o.pitch as number)
    if (o.dist !== undefined) dist = o.dist as number
    if (o.ortho !== undefined) ortho = o.ortho as boolean
    if (o.x !== undefined && o.y !== undefined) {
      const g = groundAt(o.x as number, o.y as number)
      target.copy(toScene(o.x as number, o.y as number, g + 2, cx, cy))
    }
    if (o.stride !== undefined) {
      scene.remove(terrain.mesh); terrain.mesh.geometry.dispose()
      stride = o.stride as number
      terrain = buildTerrain(stride); scene.add(terrain.mesh)
    }
    camera = makeCamera(); place()
  }

  const clock = new THREE.Clock()
  let frames = 0, acc = 0, fps = 0
  function loop() {
    const dt = clock.getDelta()
    mixer.update(dt)
    acc += dt; frames++
    if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0 }
    renderer.render(scene, camera)
    const info = renderer.info.render
    hud.textContent = [
      `terrain  ${terrain.tris.toLocaleString()} tris  (stride ${stride}, ${(meta.unit * stride).toFixed(2)} yd)`,
      `doodads  ${instances.toLocaleString()} instances, ${Math.round(doodadTris).toLocaleString()} tris`,
      `hero     ${heroTris.toLocaleString()} tris`,
      `drawn    ${info.triangles.toLocaleString()} tris, ${info.calls} calls`,
      `camera   yaw ${(yaw * 180 / Math.PI).toFixed(0)}°  pitch ${(pitch * 180 / Math.PI).toFixed(0)}°  ` +
        `dist ${dist.toFixed(0)} yd  ${ortho ? 'ortho' : 'persp'}`,
      `fps      ${fps.toFixed(0)}`,
    ].join('\n')
    ;(window as unknown as { __ready: boolean }).__ready = true
    requestAnimationFrame(loop)
  }
  loop()
}

main().catch((e) => { hud.textContent = String(e); throw e })
