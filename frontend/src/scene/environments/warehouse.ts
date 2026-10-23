import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Footprint } from '../../plant/tanks'
import { disposeTree } from '../dispose'
import { seeded } from '../rng'
import type { Palette } from '../tokens'
import { boundsOf, placeInstance, rowSlots, softNoise, std, worldRect, type Rect } from './shared'
import type { EnvContext, Environment, TankSlot } from './types'

/**
 * Galpão de aquicultura: os tanques em duas fileiras sobre o piso de
 * concreto, as paredes do fundo com janelas altas, a estrutura de aço do
 * telhado e as luminárias que acendem quando escurece.
 *
 * As paredes da frente não existem e o telhado fica só na estrutura: de fora,
 * a câmera vê dentro do galpão, como numa casa de boneca.
 */

const HALL_HEIGHT = 7.2
const BAY = 6

export class WarehouseEnvironment implements Environment {
  readonly id = 'galpao' as const
  readonly fish = 'tilapia' as const
  readonly root = new Group()
  readonly keyLight: DirectionalLight
  readonly view = { overview: new Vector3(4.2, 4.6, 7.8), tank: new Vector3(0.5, 0.48, 1), maxDistance: 38 }
  readonly background = new Color()
  readonly fog = null
  readonly tankGlow = 0.6

  private palette!: Palette
  private hemi!: HemisphereLight
  private lamp!: PointLight
  private windows!: MeshBasicMaterial
  private lampDiscs!: MeshBasicMaterial

  constructor() {
    this.keyLight = new DirectionalLight()
    this.keyLight.castShadow = true
  }

  slots(footprints: Footprint[]): TankSlot[] {
    return rowSlots(footprints, 2, 4, 3.5)
  }

  build(ctx: EnvContext): void {
    const p = (this.palette = ctx.palette)
    const bounds = boundsOf(ctx.slots, ctx.footprints)
    const hall: Rect = { minX: bounds.minX - 6, maxX: bounds.maxX + 6, minZ: bounds.minZ - 5, maxZ: bounds.maxZ + 7 }
    const center = new Vector3((hall.minX + hall.maxX) / 2, 0, (hall.minZ + hall.maxZ) / 2)
    this.background.copy(p['--scene-steel']).multiplyScalar(0.45)

    this.root.add(this.buildFloor(hall))
    this.root.add(this.buildSafetyLines(ctx.slots, ctx.footprints))
    this.root.add(this.buildWalls(hall))
    this.root.add(this.buildStructure(hall))
    this.root.add(this.buildLamps(ctx.slots, ctx.footprints))
    this.root.add(this.buildStock(hall))

    this.hemi = new HemisphereLight(p['--scene-window'], p['--scene-concrete'], 1)
    this.keyLight.color.copy(p['--scene-sun'])
    this.keyLight.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize)
    this.keyLight.shadow.bias = -0.0004
    this.keyLight.shadow.normalBias = 0.02
    this.keyLight.target.position.copy(center)
    this.lamp = new PointLight(p['--scene-lamp'], 0, 0, 1.4)
    this.lamp.position.set(center.x, HALL_HEIGHT - 1.4, center.z)
    this.root.add(this.hemi, this.keyLight, this.keyLight.target, this.lamp)
  }

  update(daylight: number): void {
    const p = this.palette
    const night = 1 - daylight
    // O sol entra de lado, pelas janelas altas.
    this.keyLight.position.copy(this.keyLight.target.position).add(new Vector3(-14, 22, 9))
    this.keyLight.intensity = 0.15 + 1.6 * daylight
    this.hemi.intensity = 0.55 + 0.55 * daylight
    const lit = MathUtils.smoothstep(night, 0.35, 0.75)
    this.windows.color.copy(p['--scene-zenith-night']).lerp(p['--scene-window'], daylight)
    this.lampDiscs.color.copy(p['--scene-steel']).lerp(p['--scene-lamp'], 0.25 + 0.75 * lit)
    this.lamp.intensity = 6 + 40 * lit
    this.background.copy(p['--scene-steel']).multiplyScalar(0.25 + 0.25 * daylight)
  }

  dispose(): void {
    disposeTree(this.root)
  }

  // --- montagem -----------------------------------------------------------------------

  /** Concreto manchado, com as juntas de dilatação. */
  private buildFloor(hall: Rect): Group {
    const p = this.palette
    const group = new Group()
    const width = hall.maxX - hall.minX
    const depth = hall.maxZ - hall.minZ
    const geometry = new PlaneGeometry(width, depth, Math.ceil(width), Math.ceil(depth))
    geometry.rotateX(-Math.PI / 2)
    geometry.translate((hall.minX + hall.maxX) / 2, -0.01, (hall.minZ + hall.maxZ) / 2)
    const position = geometry.getAttribute('position')
    const colors: number[] = []
    const color = new Color()
    for (let i = 0; i < position.count; i += 1) {
      const k = 0.5 + 0.5 * softNoise(position.getX(i) * 1.7, position.getZ(i) * 1.7)
      color.copy(p['--scene-concrete']).lerp(p['--scene-steel'], 0.12 * k)
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const floor = new Mesh(geometry, std(p['--surface'], { vertexColors: true, roughness: 0.7, flatShading: false }))
    floor.receiveShadow = true
    group.add(floor)

    // Juntas a cada 4 m, nos dois sentidos.
    const joints: Array<[number, number, number, number]> = []
    for (let x = hall.minX + 4; x < hall.maxX; x += 4) joints.push([x, (hall.minZ + hall.maxZ) / 2, 0.025, depth])
    for (let z = hall.minZ + 4; z < hall.maxZ; z += 4) joints.push([(hall.minX + hall.maxX) / 2, z, width, 0.025])
    const lines = new InstancedMesh(new BoxGeometry(1, 1, 1), std(p['--scene-concrete'].clone().lerp(p['--scene-steel'], 0.45)), joints.length)
    joints.forEach(([x, z, w, d], i) => placeInstance(lines, i, x, -0.008, z, w, 0.004, d))
    group.add(lines)
    return group
  }

  /** Faixa amarela de segurança em volta de cada tanque. */
  private buildSafetyLines(slots: TankSlot[], footprints: Footprint[]): InstancedMesh {
    const material = std(this.palette['--scene-paint'], { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 })
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, slots.length * 4)
    slots.forEach((slot, i) => {
      const r = worldRect(slot, footprints[i], 0.35)
      const cx = (r.minX + r.maxX) / 2
      const cz = (r.minZ + r.maxZ) / 2
      const w = r.maxX - r.minX
      const d = r.maxZ - r.minZ
      placeInstance(mesh, i * 4, cx, -0.004, r.minZ, w, 0.006, 0.12)
      placeInstance(mesh, i * 4 + 1, cx, -0.004, r.maxZ, w, 0.006, 0.12)
      placeInstance(mesh, i * 4 + 2, r.minX, -0.004, cz, 0.12, 0.006, d)
      placeInstance(mesh, i * 4 + 3, r.maxX, -0.004, cz, 0.12, 0.006, d)
    })
    mesh.receiveShadow = true
    return mesh
  }

  /**
   * Paredes do fundo e dos lados, viradas para dentro: vistas de fora pelas
   * costas, elas somem e deixam ver o galpão. A faixa de baixo é de aço e as
   * janelas altas brilham com a luz do dia.
   */
  private buildWalls(hall: Rect): Group {
    const p = this.palette
    const group = new Group()
    const width = hall.maxX - hall.minX
    const depth = hall.maxZ - hall.minZ
    const cx = (hall.minX + hall.maxX) / 2
    const cz = (hall.minZ + hall.maxZ) / 2
    const walls: Array<{ length: number; x: number; z: number; rotY: number }> = [
      { length: width, x: cx, z: hall.minZ, rotY: 0 },
      { length: depth, x: hall.minX, z: cz, rotY: Math.PI / 2 },
      { length: depth, x: hall.maxX, z: cz, rotY: -Math.PI / 2 },
    ]
    const wall = std(p['--scene-wall'], { roughness: 0.9 })
    const wainscot = std(p['--scene-steel'], { roughness: 0.6, metalness: 0.3 })
    this.windows = new MeshBasicMaterial({ color: p['--scene-window'].clone(), toneMapped: false })
    for (const w of walls) {
      const panel = new Mesh(new PlaneGeometry(w.length, HALL_HEIGHT), wall)
      panel.position.set(w.x, HALL_HEIGHT / 2, w.z)
      panel.rotation.y = w.rotY
      panel.receiveShadow = true
      const band = new Mesh(new PlaneGeometry(w.length, 1.3), wainscot)
      band.position.set(0, -HALL_HEIGHT / 2 + 0.65, 0.01)
      panel.add(band)
      // Janelas altas a cada 3,5 m.
      const count = Math.max(1, Math.floor((w.length - 2) / 3.5))
      const windows = new InstancedMesh(new PlaneGeometry(1, 1), this.windows, count)
      for (let i = 0; i < count; i += 1) {
        const x = -((count - 1) * 3.5) / 2 + i * 3.5
        placeInstance(windows, i, x, HALL_HEIGHT / 2 - 1.6, 0.02, 2.4, 1.3, 1)
      }
      panel.add(windows)
      group.add(panel)
    }
    return group
  }

  /** Pilares nas paredes e as treliças de aço do telhado, a cada 6 m. */
  private buildStructure(hall: Rect): Group {
    const p = this.palette
    const group = new Group()
    const steel = std(p['--scene-steel'], { roughness: 0.5, metalness: 0.45 })
    const width = hall.maxX - hall.minX
    const depth = hall.maxZ - hall.minZ
    const bays = Math.max(2, Math.floor(depth / BAY) + 1)
    const columns = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, bays * 2)
    const chords = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, bays * 2)
    const webCount = Math.max(2, Math.floor(width / 2))
    const webs = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, bays * webCount)
    for (let b = 0; b < bays; b += 1) {
      const z = hall.minZ + Math.min(depth, b * BAY)
      placeInstance(columns, b * 2, hall.minX + 0.2, HALL_HEIGHT / 2, z, 0.32, HALL_HEIGHT, 0.32)
      placeInstance(columns, b * 2 + 1, hall.maxX - 0.2, HALL_HEIGHT / 2, z, 0.32, HALL_HEIGHT, 0.32)
      placeInstance(chords, b * 2, (hall.minX + hall.maxX) / 2, HALL_HEIGHT, z, width, 0.16, 0.14)
      placeInstance(chords, b * 2 + 1, (hall.minX + hall.maxX) / 2, HALL_HEIGHT - 0.8, z, width, 0.12, 0.12)
      for (let k = 0; k < webCount; k += 1) {
        const x = hall.minX + ((k + 0.5) * width) / webCount
        placeInstance(webs, b * webCount + k, x, HALL_HEIGHT - 0.4, z, 0.08, 0.8, 0.08)
      }
    }
    // Terças correndo ao longo do galpão.
    const purlinCount = Math.max(2, Math.floor(width / 3))
    const purlins = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, purlinCount)
    for (let k = 0; k < purlinCount; k += 1) {
      const x = hall.minX + ((k + 0.5) * width) / purlinCount
      placeInstance(purlins, k, x, HALL_HEIGHT + 0.14, (hall.minZ + hall.maxZ) / 2, 0.1, 0.12, depth)
    }
    columns.castShadow = true
    group.add(columns, chords, webs, purlins)
    return group
  }

  /** Uma luminária sobre cada tanque e outra no corredor, pendurada na treliça. */
  private buildLamps(slots: TankSlot[], footprints: Footprint[]): Group {
    const p = this.palette
    const group = new Group()
    const spots = slots.flatMap((slot, i) => {
      const r = worldRect(slot, footprints[i])
      return [
        [slot.origin.x, slot.origin.z],
        [(r.minX + r.maxX) / 2, r.maxZ + 1.2],
      ]
    })
    const steel = std(p['--scene-steel'], { roughness: 0.4, metalness: 0.5 })
    const rods = new InstancedMesh(new CylinderGeometry(0.02, 0.02, 1, 6), steel, spots.length)
    const housings = new InstancedMesh(new CylinderGeometry(0.28, 0.5, 0.36, 14, 1, true), steel, spots.length)
    this.lampDiscs = new MeshBasicMaterial({ color: p['--scene-lamp'].clone(), toneMapped: false })
    const discs = new InstancedMesh(new CylinderGeometry(0.46, 0.46, 0.02, 16), this.lampDiscs, spots.length)
    spots.forEach(([x, z], i) => {
      placeInstance(rods, i, x, HALL_HEIGHT - 0.6, z, 1, 1.2, 1)
      placeInstance(housings, i, x, HALL_HEIGHT - 1.38, z, 1, 1, 1)
      placeInstance(discs, i, x, HALL_HEIGHT - 1.56, z, 1, 1, 1)
    })
    group.add(rods, housings, discs)
    return group
  }

  /** Paletes com sacos de ração no fundo e uma bancada de trabalho no canto. */
  private buildStock(hall: Rect): Group {
    const p = this.palette
    const group = new Group()
    const random = seeded(53)
    const pallets = 4
    const wood = std(p['--scene-pallet'])
    const palletMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), wood, pallets)
    const sacksPer = 8
    const sacks = new InstancedMesh(new SphereGeometry(1, 10, 6), std(p['--scene-sack'], { roughness: 1 }), pallets * sacksPer)
    for (let i = 0; i < pallets; i += 1) {
      const x = hall.minX + 2 + i * 1.5
      const z = hall.minZ + 1.1
      placeInstance(palletMesh, i, x, 0.07, z, 1.2, 0.14, 1)
      for (let k = 0; k < sacksPer; k += 1) {
        const layer = Math.floor(k / 4)
        const sx = (k % 2) - 0.5
        const sz = (Math.floor((k % 4) / 2)) - 0.5
        placeInstance(sacks, i * sacksPer + k, x + sx * 0.55, 0.28 + layer * 0.26, z + sz * 0.45, 0.3, 0.14, 0.24, random() * 0.4)
      }
    }
    palletMesh.castShadow = sacks.castShadow = true
    palletMesh.receiveShadow = sacks.receiveShadow = true
    group.add(palletMesh, sacks)

    // Bancada no canto do fundo, do outro lado.
    const steel = std(p['--scene-steel'], { metalness: 0.4, roughness: 0.5 })
    const top = new Mesh(new BoxGeometry(2.2, 0.08, 0.8), std(p['--scene-wood']))
    top.position.set(hall.maxX - 2, 0.92, hall.minZ + 0.9)
    const legs = new InstancedMesh(new BoxGeometry(0.06, 0.88, 0.06), steel, 4)
    let n = 0
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) placeInstance(legs, n++, top.position.x + dx * 1.02, 0.44, top.position.z + dz * 0.34, 1, 1, 1)
    const toolbox = new Mesh(new BoxGeometry(0.5, 0.24, 0.26), std(p['--brand-fish'], { roughness: 0.5 }))
    toolbox.position.set(top.position.x - 0.5, 1.08, top.position.z)
    for (const mesh of [top, toolbox]) mesh.castShadow = mesh.receiveShadow = true
    group.add(top, legs, toolbox)
    return group
  }
}
