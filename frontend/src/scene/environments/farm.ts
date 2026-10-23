import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Footprint } from '../../plant/tanks'
import { disposeTree } from '../dispose'
import { seeded } from '../rng'
import type { Palette } from '../tokens'
import { boundsOf, buildTrees, placeInstance, rowSlots, SkyDome, softNoise, std, worldRect, type Rect, type TreeSpot } from './shared'
import type { EnvContext, Environment, TankSlot } from './types'

/**
 * Piscicultura ao ar livre: os tanques num deck de madeira sobre o gramado,
 * a casinha das máquinas, a cerca, árvores e morros ao fundo, e o céu que vai
 * do dia à noite pela luminosidade lida.
 */

const GROUND_Y = -0.12

/** Distância de (x, z) até o retângulo dos tanques: 0 dentro dele. */
function outside(rect: Rect, x: number, z: number): number {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX)
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ)
  return Math.hypot(dx, dz)
}

export class FarmEnvironment implements Environment {
  readonly id = 'fazenda' as const
  readonly fish = 'tilapia' as const
  readonly root = new Group()
  readonly keyLight: DirectionalLight
  readonly view = { overview: new Vector3(5.3, 2.5, 6.9), tank: new Vector3(0.5, 0.42, 1), maxDistance: 48 }
  readonly background = new Color()
  readonly fog = new Fog(new Color(), 30, 160)
  readonly tankGlow = 0.8

  private palette!: Palette
  private sky!: SkyDome
  private hemi!: HemisphereLight
  private lamp!: PointLight
  private bulbs!: MeshBasicMaterial
  private windows!: MeshBasicMaterial
  private clouds!: Group
  private cloudMaterial!: ReturnType<typeof std>
  private center = new Vector3()

  constructor() {
    this.keyLight = new DirectionalLight()
    this.keyLight.castShadow = true
  }

  slots(footprints: Footprint[]): TankSlot[] {
    return rowSlots(footprints, 3, 3.2, 4.5)
  }

  build(ctx: EnvContext): void {
    const p = (this.palette = ctx.palette)
    const bounds = boundsOf(ctx.slots, ctx.footprints)
    this.center.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2)
    const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2

    this.sky = new SkyDome(p, ctx.quality.stars)
    this.sky.root.position.copy(this.center)
    this.root.add(this.sky.root)
    this.fog.near = radius + 22
    this.fog.far = radius + 150

    const groundY = (x: number, z: number) => {
      const d = outside(bounds, x, z)
      return GROUND_Y + MathUtils.smoothstep(d, 24, 75) * (3 + 3 * softNoise(x * 0.5, z * 0.5))
    }
    this.root.add(this.buildGround(bounds, groundY))
    this.root.add(this.buildDecks(ctx.slots, ctx.footprints))
    const shed = this.buildShed()
    shed.position.set(bounds.maxX + 5.2, GROUND_Y, bounds.minZ + 1.8)
    this.root.add(shed)
    this.root.add(this.buildFence(bounds))
    this.root.add(this.buildLampPosts(ctx.slots, ctx.footprints))
    this.root.add(buildTrees(p, this.treeSpots(bounds, ctx.quality.trees), groundY))
    this.clouds = this.buildClouds(radius)
    this.clouds.position.copy(this.center)
    this.root.add(this.clouds)

    this.hemi = new HemisphereLight(p['--scene-horizon-day'], p['--scene-grass-2'], 1)
    this.keyLight.color.copy(p['--scene-sun'])
    this.keyLight.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize)
    this.keyLight.shadow.bias = -0.0004
    this.keyLight.shadow.normalBias = 0.02
    this.keyLight.target.position.copy(this.center)
    // A luz dos postes, uma só para todos: acende à noite.
    // Alcance curto: ilumina os decks, não a paisagem inteira.
    this.lamp = new PointLight(p['--scene-lamp'], 0, 22, 2)
    this.lamp.position.set(this.center.x, 4.5, this.center.z + 1)
    this.root.add(this.hemi, this.keyLight, this.keyLight.target, this.lamp)
  }

  update(daylight: number, t: number): void {
    const p = this.palette
    this.sky.update(daylight)
    this.fog.color.copy(this.sky.horizon)
    this.background.copy(this.sky.horizon)
    const night = 1 - daylight

    this.keyLight.position.copy(this.keyLight.target.position).addScaledVector(this.sky.lightDir, 40)
    this.keyLight.color.copy(p['--scene-moon']).lerp(p['--scene-sun'], daylight)
    this.keyLight.intensity = 0.22 + 2.4 * daylight
    this.hemi.color.copy(this.sky.horizon)
    this.hemi.groundColor.copy(p['--scene-grass-2']).multiplyScalar(0.3 + 0.7 * daylight)
    // Noite de verdade: quase só a lua e os postes.
    this.hemi.intensity = 0.16 + 1.14 * daylight

    const lit = MathUtils.smoothstep(night, 0.45, 0.8)
    this.bulbs.color.copy(p['--scene-steel']).lerp(p['--scene-lamp'], lit)
    this.windows.color.copy(p['--scene-window']).multiplyScalar(0.55 + 0.45 * daylight).lerp(p['--scene-lamp'], lit)
    this.lamp.intensity = 60 * lit
    this.cloudMaterial.color.copy(p['--surface']).lerp(p['--scene-horizon-night'], night * 0.85)
    this.clouds.rotation.y = t * 0.004
  }

  dispose(): void {
    disposeTree(this.root)
  }

  // --- montagem -----------------------------------------------------------------------

  /** Gramado com manchas, cascalho em volta dos decks e morros que crescem longe dos tanques. */
  private buildGround(bounds: Rect, groundY: (x: number, z: number) => number): Mesh {
    const p = this.palette
    const size = 320
    const geometry = new PlaneGeometry(size, size, 110, 110)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(this.center.x, 0, this.center.z)
    const position = geometry.getAttribute('position')
    const colors: number[] = []
    const color = new Color()
    const pathX = bounds.maxX + 4.6
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const z = position.getZ(i)
      const d = outside(bounds, x, z)
      const fine = 0.06 * softNoise(x * 2.3, z * 2.3) * MathUtils.smoothstep(d, 2, 8)
      position.setY(i, groundY(x, z) + fine)

      const patch = 0.5 + 0.5 * softNoise(x * 0.9 + 4, z * 0.9 - 2)
      color.copy(p['--scene-grass']).lerp(p['--scene-grass-2'], patch)
      color.lerp(p['--scene-hill'], MathUtils.smoothstep(d, 18, 55) * 0.7)
      // Cascalho em volta dos decks e o caminho até a casinha das máquinas.
      const onPath = d < 1.3 || (Math.abs(x - pathX) < 0.8 && z > bounds.minZ - 1 && z < bounds.maxZ + 2)
      if (onPath) color.copy(p['--scene-path']).lerp(p['--sand-dot'], 0.15 * (0.5 + 0.5 * softNoise(x * 6, z * 6)))
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const ground = new Mesh(geometry, std(p['--surface'], { vertexColors: true, roughness: 1 }))
    ground.receiveShadow = true
    return ground
  }

  /** Um deck de tábuas sob cada tanque, com o rodapé escuro em volta. */
  private buildDecks(slots: TankSlot[], footprints: Footprint[]): Group {
    const p = this.palette
    const group = new Group()
    const rects = slots.map((slot, i) => worldRect(slot, footprints[i], 0.3))
    const plankCount = rects.reduce((sum, r) => sum + Math.ceil((r.maxZ - r.minZ) / 0.3), 0)
    const planks = new InstancedMesh(new BoxGeometry(1, 1, 1), std(p['--surface'], { roughness: 0.9 }), plankCount)
    const skirts = new InstancedMesh(new BoxGeometry(1, 1, 1), std(p['--scene-wood-dark']), rects.length * 4)
    planks.receiveShadow = skirts.receiveShadow = true
    planks.castShadow = skirts.castShadow = true
    const light = p['--scene-wood'].clone()
    const dark = p['--scene-wood'].clone().lerp(p['--scene-wood-dark'], 0.3)
    let n = 0
    rects.forEach((r, k) => {
      const width = r.maxX - r.minX
      const rows = Math.ceil((r.maxZ - r.minZ) / 0.3)
      for (let i = 0; i < rows; i += 1) {
        placeInstance(planks, n, (r.minX + r.maxX) / 2, -0.035, r.minZ + 0.15 + i * 0.3, width, 0.07, 0.275)
        planks.setColorAt(n++, i % 3 === 1 ? dark : light)
      }
      const depth = r.maxZ - r.minZ
      const cx = (r.minX + r.maxX) / 2
      const cz = (r.minZ + r.maxZ) / 2
      placeInstance(skirts, k * 4, cx, -0.07, r.maxZ + 0.04, width + 0.16, 0.14, 0.08)
      placeInstance(skirts, k * 4 + 1, cx, -0.07, r.minZ - 0.04, width + 0.16, 0.14, 0.08)
      placeInstance(skirts, k * 4 + 2, r.minX - 0.04, -0.07, cz, 0.08, 0.14, depth)
      placeInstance(skirts, k * 4 + 3, r.maxX + 0.04, -0.07, cz, 0.08, 0.14, depth)
    })
    group.add(planks, skirts)
    return group
  }

  /** A casinha das máquinas: paredes claras, telhado de duas águas, porta e janela que acende à noite. */
  private buildShed(): Group {
    const p = this.palette
    const shed = new Group()
    const W = 3.4
    const D = 3
    const H = 2.6
    const add = (geometry: BoxGeometry, color: Color, x: number, y: number, z: number) => {
      const mesh = new Mesh(geometry, std(color))
      mesh.position.set(x, y, z)
      mesh.castShadow = mesh.receiveShadow = true
      shed.add(mesh)
      return mesh
    }
    add(new BoxGeometry(W + 0.5, 0.16, D + 0.5), p['--scene-concrete'], 0, 0.08, 0)
    add(new BoxGeometry(W, H, D), p['--scene-wall'], 0, 0.16 + H / 2, 0)

    // Telhado: duas placas inclinadas e as duas empenas triangulares.
    const rise = 0.95
    const run = D / 2 + 0.3
    const slope = Math.atan2(rise, run)
    const length = Math.hypot(rise, run)
    for (const side of [1, -1]) {
      const panel = add(new BoxGeometry(W + 0.5, 0.1, length), p['--scene-roof'], 0, 0.16 + H + rise / 2 - 0.05, (side * run) / 2)
      panel.rotation.x = side * slope
    }
    const gable = new Shape()
    gable.moveTo(-D / 2, 0)
    gable.lineTo(D / 2, 0)
    gable.lineTo(0, rise)
    gable.closePath()
    for (const side of [1, -1]) {
      const end = new Mesh(new ShapeGeometry(gable), std(p['--scene-wall'], { side: DoubleSide }))
      end.rotation.y = Math.PI / 2
      end.position.set((side * W) / 2, 0.16 + H, 0)
      shed.add(end)
    }

    add(new BoxGeometry(0.95, 1.95, 0.06), p['--scene-wood-dark'], -0.7, 0.16 + 0.975, D / 2 + 0.03)
    this.windows = new MeshBasicMaterial({ color: p['--scene-window'].clone(), toneMapped: false })
    const window = new Mesh(new BoxGeometry(0.9, 0.7, 0.05), this.windows)
    window.position.set(0.75, 0.16 + 1.55, D / 2 + 0.03)
    shed.add(window)
    add(new BoxGeometry(1.06, 0.08, 0.1), p['--scene-wood-dark'], 0.75, 0.16 + 1.16, D / 2 + 0.06)
    return shed
  }

  /** Cerca de madeira dos lados e do fundo; a frente fica aberta para a câmera. */
  private buildFence(bounds: Rect): Group {
    const p = this.palette
    const group = new Group()
    const r = { minX: bounds.minX - 6.5, maxX: bounds.maxX + 9.5, minZ: bounds.minZ - 6, maxZ: bounds.maxZ + 6 }
    const sides: Array<[number, number, number, number]> = [
      [r.minX, r.maxZ, r.minX, r.minZ],
      [r.minX, r.minZ, r.maxX, r.minZ],
      [r.maxX, r.minZ, r.maxX, r.maxZ],
    ]
    const postSpots: Array<[number, number]> = []
    for (const [x1, z1, x2, z2] of sides) {
      const length = Math.hypot(x2 - x1, z2 - z1)
      const count = Math.max(2, Math.round(length / 2.4))
      for (let i = 0; i < count; i += 1) {
        const k = i / count
        postSpots.push([MathUtils.lerp(x1, x2, k), MathUtils.lerp(z1, z2, k)])
      }
    }
    const wood = std(p['--scene-wood'])
    const posts = new InstancedMesh(new BoxGeometry(1, 1, 1), wood, postSpots.length)
    postSpots.forEach(([x, z], i) => placeInstance(posts, i, x, GROUND_Y + 0.55, z, 0.12, 1.1, 0.12))
    const rails = new InstancedMesh(new BoxGeometry(1, 1, 1), wood, sides.length * 2)
    sides.forEach(([x1, z1, x2, z2], i) => {
      const length = Math.hypot(x2 - x1, z2 - z1)
      const angle = Math.atan2(-(z2 - z1), x2 - x1)
      for (const [k, y] of [
        [0, 0.45],
        [1, 0.9],
      ] as const) {
        placeInstance(rails, i * 2 + k, (x1 + x2) / 2, GROUND_Y + y, (z1 + z2) / 2, length, 0.08, 0.05, angle)
      }
    })
    posts.castShadow = rails.castShadow = true
    group.add(posts, rails)
    return group
  }

  /** Dois postes atrás de cada deck; as lâmpadas acendem à noite. */
  private buildLampPosts(slots: TankSlot[], footprints: Footprint[]): Group {
    const p = this.palette
    const group = new Group()
    const spots = slots.flatMap((slot, i) => {
      const r = worldRect(slot, footprints[i], 0.1)
      return [
        [r.minX, r.minZ],
        [r.maxX, r.minZ],
      ]
    })
    const metal = std(p['--scene-steel'], { metalness: 0.4, roughness: 0.5 })
    const poles = new InstancedMesh(new CylinderGeometry(0.05, 0.065, 1, 8), metal, spots.length)
    const heads = new InstancedMesh(new BoxGeometry(1, 1, 1), metal, spots.length)
    this.bulbs = new MeshBasicMaterial({ color: p['--scene-steel'].clone(), toneMapped: false })
    const bulbs = new InstancedMesh(new SphereGeometry(0.075, 10, 8), this.bulbs, spots.length)
    spots.forEach(([x, z], i) => {
      placeInstance(poles, i, x, 1.4, z, 1, 2.8, 1)
      placeInstance(heads, i, x, 2.82, z + 0.12, 0.2, 0.08, 0.36)
      placeInstance(bulbs, i, x, 2.74, z + 0.22, 1, 1, 1)
    })
    poles.castShadow = heads.castShadow = true
    group.add(poles, heads, bulbs)
    return group
  }

  /** Árvores longe dos tanques, sem tapar a câmera da frente, e arbustos junto da cerca. */
  private treeSpots(bounds: Rect, count: number): TreeSpot[] {
    const random = seeded(31)
    const spots: TreeSpot[] = []
    const viewAngle = Math.atan2(this.view.overview.z, this.view.overview.x)
    let guard = 0
    while (spots.length < count && guard++ < count * 40) {
      const angle = random() * Math.PI * 2
      const distance = 11 + random() * 48
      const x = this.center.x + Math.cos(angle) * (distance + (bounds.maxX - bounds.minX) / 2)
      const z = this.center.z + Math.sin(angle) * (distance + (bounds.maxZ - bounds.minZ) / 2)
      const d = outside(bounds, x, z)
      if (d < 9.5) continue
      // A frente, de onde a câmera olha, fica limpa perto dos tanques.
      let delta = Math.abs(angle - viewAngle)
      if (delta > Math.PI) delta = Math.PI * 2 - delta
      if (delta < 0.75 && d < 32) continue
      if (x > bounds.maxX + 2 && x < bounds.maxX + 9 && z < bounds.minZ + 4 && z > bounds.minZ - 1.5) continue
      spots.push({ x, z, scale: 0.75 + random() * 0.7, pine: random() < 0.35 })
    }
    // Arbustos encostados na cerca do fundo.
    for (let i = 0; i < 12; i += 1) {
      const x = MathUtils.lerp(bounds.minX - 6, bounds.maxX + 9, random())
      spots.push({ x, z: bounds.minZ - 5.2 - random() * 0.6, scale: 0.6 + random() * 0.5, pine: false, bush: true })
    }
    return spots
  }

  /** Nuvens de poucos polígonos, bem alto, girando devagar em volta da planta. */
  private buildClouds(radius: number): Group {
    const group = new Group()
    const random = seeded(47)
    const clouds = 9
    const puffs = 4
    this.cloudMaterial = std(this.palette['--surface'], { roughness: 1 })
    const mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), this.cloudMaterial, clouds * puffs)
    let n = 0
    for (let c = 0; c < clouds; c += 1) {
      const angle = (c / clouds) * Math.PI * 2 + random() * 0.5
      const distance = radius + 55 + random() * 55
      const cx = Math.cos(angle) * distance
      const cz = Math.sin(angle) * distance
      const y = 34 + random() * 12
      for (let k = 0; k < puffs; k += 1) {
        const size = 3.2 + random() * 3
        placeInstance(mesh, n++, cx + (k - 1.5) * 3.4, y + random() * 1.2, cz + (random() - 0.5) * 3, size, size * 0.55, size * 0.8, random() * 3)
      }
    }
    group.add(mesh)
    return group
  }
}
