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
 * Every one of these packs exports `metallicFactor: 1`.
 *
 * glTF's default is fully metallic, and a fully metallic surface with nothing
 * to reflect is black — or, with only a hemisphere light, a muddy tint of the
 * sky.  Kenney's trees came out teal and Quaternius's warrior came out a
 * silhouette, and both were this one line.  It is not a per-pack quirk; it is
 * what the format's default does to art authored as flat colour.
 */
function dress(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      if (mat.metalness === undefined) continue
      mat.metalness = 0
      mat.roughness = 0.9
      mat.needsUpdate = true
    }
  })
}

// Doodads come out of the bake as a kind, never as a model path, so this is
// where a kind becomes something to draw.
//
// The first pass used Kenney's Nature Kit, and it was the wrong pack: that kit
// is a prototyping set — a hexagon on a stick is a tree — and next to hand
// painted characters it read as placeholder, because it is.  Availability had
// picked it, not quality.  Everything here is now Quaternius, the same author
// as the characters, which also made the palette problem disappear rather than
// need solving: one author, one palette.
//
// `height` is in yards and the scale is derived from the model's own bounding
// box, so a swapped model does not need a new magic number.
const KIND: Record<string, { model: string[]; height: number }> = {
  // No TwistedTree here on purpose: its leaf texture averages a red that is
  // autumn, and Elwynn is a green temperate forest.  The kit encodes season in
  // the variant, so which variants a region may use is a property of the
  // region — the same shape of fact as its terrain colour.
  tree: {
    model: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'],
    height: 13,
  },
  pine: { model: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'], height: 15 },
  // Bush_Common is dropped for the same reason as TwistedTree: it shares that
  // tree's leaf texture, which is the autumn one.
  bush: { model: ['Bush_Common_Flowers', 'Fern_1'], height: 1.7 },
  fence: { model: ['Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1'], height: 1.4 },
  rock: { model: ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], height: 1.8 },
  lily: { model: ['Clover_1'], height: 0.35 },
  water_plant: { model: ['Grass_Wispy_Tall'], height: 0.9 },
  grass: { model: ['Grass_Common_Tall'], height: 0.8 },
  flower: { model: ['Flower_3_Group', 'Flower_4_Group'], height: 0.5 },
  crop: { model: ['Grass_Common_Short'], height: 0.7 },
  mushroom: { model: ['Mushroom_Common'], height: 0.35 },
  stump: { model: ['DeadTree_1', 'DeadTree_2'], height: 6 },
  log: { model: ['DeadTree_2'], height: 5 },
  barrel: { model: ['Prop_Crate'], height: 1.1 },
  cart: { model: ['Prop_Wagon'], height: 2.2 },
  prop: { model: ['Pebble_Round_1', 'Pebble_Square_2'], height: 0.5 },
}

async function main() {
  const head = await fetch('./data/terrain.json')
  // Not just `ok`: a dev server answers a missing path with the index page and
  // a cheerful 200, so the first sign of trouble is JSON.parse choking on
  // "<!doctype".  Ask what came back, not whether something did.
  if (!head.ok || !(head.headers.get('content-type') ?? '').includes('json')) {
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

  const tex = new THREE.TextureLoader()
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

  // The ground is still flat colour, and it is still the weakest thing here.
  //
  // Tiling the kit's `Grass.png` over it was tried and was wrong twice over:
  // that sheet is the sprite atlas the grass *models* are cut from, not a
  // ground material, so repeating it drew stripes across the hills.  A name is
  // not a promise about what an image is.  And the obvious replacement — a
  // photoreal seamless grass off a PBR library — would clash with painted
  // low-poly worse than plain colour does.  What this wants is a *stylised*
  // tiling ground, and that has not been found yet.
  /** Terrain at a given stride, so the triangle budget can be tested by eye. */
  function buildTerrain(stride: number) {
    const w = Math.floor((W - 1) / stride) + 1
    const h = Math.floor((H - 1) / stride) + 1
    const pos = new Float32Array(w * h * 3)
    const col = new Float32Array(w * h * 3)

    const rock = new THREE.Color(0x8a8272)
    const grass = new THREE.Color(0x6d9349)
    const low = new THREE.Color(0x5c8244)
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
        c.offsetHSL(0, 0, ((n - Math.floor(n)) - 0.5) * 0.05)
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
      cache.set(name, loader.loadAsync(`./models/nature/${name}.gltf`).then((g) => g.scene))
    return cache.get(name)!
  }

  let doodadTris = 0
  let instances = 0
  let drawnInstances = 0
  let drawnTris = 0
  const byModel = new Map<string, { d: Doodad; height: number }[]>()
  for (const dd of meta.doodads) {
    const k = KIND[dd.k]
    if (!k) continue
    const pick = k.model[(Math.abs(Math.round(dd.x * 7 + dd.y * 13)) % k.model.length)]
    if (!byModel.has(pick)) byModel.set(pick, [])
    byModel.get(pick)!.push({ d: dd, height: k.height })
  }

  // The Quaternius kit is roughly twenty times the triangles of the prototyping
  // set it replaced — 8.8 million across the slice against 450 thousand.  The
  // art is worth it; drawing all of it at once is not.  Instances are refilled
  // around wherever the camera is looking, which is what a game would do
  // anyway: nothing 600 yards away needs to be in the buffer.
  const VIEW = 220
  const refills: ((cx2: number, cy2: number) => void)[] = []

  const refill = (ax: number, ay: number) => {
    drawnInstances = 0; drawnTris = 0
    for (const f of refills) f(ax, ay)
  }

  const dummy = new THREE.Object3D()
  await Promise.all(
    [...byModel].map(async ([name, list]) => {
      const src = await load(name)
      dress(src)
      // Scale is derived, not typed: the model's own height decides it, so a
      // pack swap does not turn into a round of nudging constants.
      src.updateMatrixWorld(true)
      const tall = new THREE.Box3().setFromObject(src).getSize(new THREE.Vector3()).y || 1
      const base = list[0].height / tall
      const parts: THREE.Mesh[] = []
      src.traverse((o) => { if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh) })
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material as THREE.Material, list.length)
        inst.castShadow = true
        inst.receiveShadow = true
        inst.frustumCulled = false
        const local = part.matrixWorld.clone()
        const tris = part.geometry.index ? part.geometry.index.count / 3
          : part.geometry.attributes.position.count / 3
        const fill = (ax: number, ay: number) => {
          let n = 0
          for (const { d: dd } of list) {
            if ((dd.x - ax) ** 2 + (dd.y - ay) ** 2 > VIEW * VIEW) continue
            dummy.position.copy(toScene(dd.x, dd.y, groundAt(dd.x, dd.y), cx, cy))
            dummy.rotation.set(0, THREE.MathUtils.degToRad(dd.r), 0)
            dummy.scale.setScalar(base * (0.8 + (Math.abs(Math.round(dd.x * 3 + dd.y * 5)) % 45) / 100))
            dummy.updateMatrix()
            inst.setMatrixAt(n++, new THREE.Matrix4().copy(local).premultiply(dummy.matrix))
          }
          inst.count = n
          inst.instanceMatrix.needsUpdate = true
          drawnInstances += n
          drawnTris += n * tris
        }
        refills.push(fill)
        scene.add(inst)
        doodadTris += tris * list.length
        instances += list.length
      }
    }),
  )

  // --- the character -----------------------------------------------------
  const skin = await tex.loadAsync('./models/Warrior_Texture.png')
  const swordTex = await tex.loadAsync('./models/Warrior_Sword_Texture.png')
  for (const t of [skin, swordTex]) { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false }

  const gltf = await loader.loadAsync('./models/Warrior.glb')
  const hero = gltf.scene
  dress(hero)
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
  refill(START[0], START[1])
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
    if (o.x !== undefined && o.y !== undefined) refill(o.x as number, o.y as number)
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
      `doodads  ${drawnInstances.toLocaleString()} of ${instances.toLocaleString()} within ${VIEW} yd` +
        `  (${Math.round(drawnTris / 1000).toLocaleString()}k of ${Math.round(doodadTris / 1000).toLocaleString()}k tris)`,
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
