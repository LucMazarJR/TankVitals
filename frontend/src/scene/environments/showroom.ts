import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SpotLight,
  Vector3,
} from 'three'
import type { Footprint } from '../../plant/tanks'
import { disposeTree } from '../dispose'
import { seeded } from '../rng'
import type { Palette } from '../tokens'
import { boundsOf, buildTrees, placeInstance, rowSlots, std, worldRect, type Rect } from './shared'
import type { EnvContext, Environment, TankSlot } from './types'

/**
 * Aquário de exposição: sala escura, os tanques sobre um móvel de madeira
 * encostado no ripado do fundo, spots no teto e a luz do aquário acesa. A
 * faixa de claraboia e as luzes da sala seguem a luminosidade lida; à noite
 * sobra a luz azulada dos tanques.
 */

/** Altura do móvel: tudo do tanque (bomba, aerador, reposição) fica em cima dele. */
const STAGE = 0.85
const ROOM_HEIGHT = 5

/** Mancha de luz redonda e suave, para o chão em frente ao aquário. */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
  // É uma máscara (só o brilho); a cor vem do material, pelo token.
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new CanvasTexture(canvas)
}

export class ShowroomEnvironment implements Environment {
  readonly id = 'aquario' as const
  readonly fish = 'ornamental' as const
  readonly root = new Group()
  readonly keyLight: DirectionalLight
  readonly view = { overview: new Vector3(3, 2.5, 8.5), tank: new Vector3(0.28, 0.3, 1), maxDistance: 30 }
  readonly background = new Color()
  readonly fog = null
  readonly tankGlow = 1.3

  private palette!: Palette
  private hemi!: HemisphereLight
  private spots: SpotLight[] = []
  private skylight!: MeshBasicMaterial
  private led!: MeshBasicMaterial
  private pool!: MeshBasicMaterial

  constructor() {
    this.keyLight = new DirectionalLight()
    this.keyLight.castShadow = true
  }

  slots(footprints: Footprint[]): TankSlot[] {
    return rowSlots(footprints, 3, 1.6, 4, STAGE)
  }

  build(ctx: EnvContext): void {
    const p = (this.palette = ctx.palette)
    const bounds = boundsOf(ctx.slots, ctx.footprints)
    const room: Rect = { minX: bounds.minX - 5, maxX: bounds.maxX + 5, minZ: bounds.minZ - 1.2, maxZ: bounds.maxZ + 9 }
    const center = new Vector3((bounds.minX + bounds.maxX) / 2, STAGE, (bounds.minZ + bounds.maxZ) / 2)
    this.background.copy(p['--scene-room']).multiplyScalar(0.6)

    this.root.add(this.buildFloor(room))
    this.root.add(this.buildWalls(room, bounds))
    this.root.add(this.buildStages(ctx.slots, ctx.footprints))
    this.root.add(this.buildFurniture(room, bounds))

    this.hemi = new HemisphereLight(p['--scene-window'], p['--scene-room-floor'], 0.6)
    this.keyLight.color.copy(p['--scene-lamp'])
    this.keyLight.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize)
    this.keyLight.shadow.bias = -0.0004
    this.keyLight.shadow.normalBias = 0.02
    this.keyLight.target.position.copy(center)
    this.root.add(this.hemi, this.keyLight, this.keyLight.target)

    // Dois spots no teto, sempre acesos: é uma vitrine. Sem sombra, para pesar pouco.
    const span = Math.max(2, (bounds.maxX - bounds.minX) / 4)
    for (const side of [-1, 1]) {
      const spot = new SpotLight(p['--scene-lamp'], 70, 0, 0.55, 0.65, 1.6)
      spot.position.set(center.x + side * span, ROOM_HEIGHT - 0.2, bounds.maxZ + 2.5)
      spot.target.position.set(center.x + side * span * 0.6, STAGE + 1, center.z)
      this.spots.push(spot)
      this.root.add(spot, spot.target)
    }
  }

  update(daylight: number): void {
    const p = this.palette
    const night = 1 - daylight
    this.keyLight.position.copy(this.keyLight.target.position).add(new Vector3(4, 16, 10))
    this.keyLight.intensity = 0.25 + 0.9 * daylight
    this.hemi.intensity = 0.3 + 0.7 * daylight
    this.skylight.color.copy(p['--scene-zenith-night']).lerp(p['--scene-window'], daylight)
    const lit = MathUtils.smoothstep(night, 0.2, 0.7)
    this.led.color.copy(p['--scene-room']).lerp(p['--scene-led'], 0.45 + 0.55 * lit)
    this.pool.opacity = 0.18 + 0.5 * lit
    for (const spot of this.spots) spot.intensity = 45 + 30 * daylight
  }

  dispose(): void {
    disposeTree(this.root)
  }

  // --- montagem -----------------------------------------------------------------------

  /** Assoalho escuro de tábuas, encerado. */
  private buildFloor(room: Rect): InstancedMesh {
    const p = this.palette
    const plank = 0.24
    const length = 3
    const rows = Math.ceil((room.maxZ - room.minZ) / plank)
    const cols = Math.ceil((room.maxX - room.minX) / length) + 1
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), std(p['--surface'], { roughness: 0.35, metalness: 0.05 }), rows * cols)
    const random = seeded(61)
    const light = p['--scene-room-floor'].clone().lerp(p['--scene-wood'], 0.18)
    let n = 0
    for (let r = 0; r < rows; r += 1) {
      // As emendas desencontradas de uma fileira para a outra.
      const shift = (r % 3) * (length / 3)
      for (let c = 0; c < cols; c += 1) {
        const x = room.minX - shift + c * length + length / 2
        placeInstance(mesh, n, x, -0.02, room.minZ + plank / 2 + r * plank, length - 0.01, 0.04, plank - 0.008)
        mesh.setColorAt(n++, random() < 0.5 ? p['--scene-room-floor'] : light)
      }
    }
    mesh.receiveShadow = true
    return mesh
  }

  /** Paredes viradas para dentro, ripado de madeira atrás dos tanques e a faixa de claraboia. */
  private buildWalls(room: Rect, bounds: Rect): Group {
    const p = this.palette
    const group = new Group()
    const width = room.maxX - room.minX
    const depth = room.maxZ - room.minZ
    const cx = (room.minX + room.maxX) / 2
    const cz = (room.minZ + room.maxZ) / 2
    const wall = std(p['--scene-room'], { roughness: 0.95 })
    const walls: Array<{ length: number; x: number; z: number; rotY: number }> = [
      { length: width, x: cx, z: room.minZ, rotY: 0 },
      { length: depth, x: room.minX, z: cz, rotY: Math.PI / 2 },
      { length: depth, x: room.maxX, z: cz, rotY: -Math.PI / 2 },
    ]
    for (const w of walls) {
      const panel = new Mesh(new PlaneGeometry(w.length, ROOM_HEIGHT), wall)
      panel.position.set(w.x, ROOM_HEIGHT / 2, w.z)
      panel.rotation.y = w.rotY
      panel.receiveShadow = true
      group.add(panel)
    }

    // Ripado vertical atrás dos tanques.
    const span = bounds.maxX - bounds.minX + 2
    const slats = Math.floor(span / 0.22)
    const slatMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), std(p['--scene-cabinet'], { roughness: 0.7 }), slats)
    for (let i = 0; i < slats; i += 1) {
      placeInstance(slatMesh, i, bounds.minX - 1 + i * 0.22 + 0.11, ROOM_HEIGHT / 2 - 0.3, room.minZ + 0.05, 0.08, ROOM_HEIGHT - 1.4, 0.06)
    }
    slatMesh.receiveShadow = true
    group.add(slatMesh)

    // A claraboia: uma faixa alta que acende com o dia lá fora.
    this.skylight = new MeshBasicMaterial({ color: p['--scene-window'].clone(), toneMapped: false })
    const skylight = new Mesh(new PlaneGeometry(width - 1, 0.5), this.skylight)
    skylight.position.set(cx, ROOM_HEIGHT - 0.35, room.minZ + 0.02)
    group.add(skylight)
    return group
  }

  /** O móvel sob os tanques, com as portas, a fita de LED e a luz do aquário no chão. */
  private buildStages(slots: TankSlot[], footprints: Footprint[]): Group {
    const p = this.palette
    const group = new Group()
    const cabinet = std(p['--scene-cabinet'], { roughness: 0.6 })
    const doors = std(p['--scene-cabinet'].clone().lerp(p['--scene-wood'], 0.3), { roughness: 0.55 })
    this.led = new MeshBasicMaterial({ color: p['--scene-led'].clone(), toneMapped: false })
    const texture = glowTexture()
    this.pool = new MeshBasicMaterial({
      map: texture,
      color: p['--scene-led'].clone(),
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    slots.forEach((slot, i) => {
      const r = worldRect(slot, footprints[i], 0.15)
      const width = r.maxX - r.minX
      const depth = r.maxZ - r.minZ
      const cx = (r.minX + r.maxX) / 2
      const cz = (r.minZ + r.maxZ) / 2
      const body = new Mesh(new BoxGeometry(width, STAGE, depth), cabinet)
      body.position.set(cx, STAGE / 2, cz)
      body.castShadow = body.receiveShadow = true
      group.add(body)

      const count = Math.max(2, Math.round(width / 1.3))
      const doorMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), doors, count)
      for (let k = 0; k < count; k += 1) {
        const x = r.minX + ((k + 0.5) * width) / count
        placeInstance(doorMesh, k, x, STAGE / 2, r.maxZ + 0.012, width / count - 0.08, STAGE - 0.2, 0.025)
      }
      group.add(doorMesh)

      const strip = new Mesh(new BoxGeometry(width, 0.025, 0.03), this.led)
      strip.position.set(cx, STAGE - 0.02, r.maxZ + 0.02)
      const kick = new Mesh(new BoxGeometry(width - 0.1, 0.02, 0.02), this.led)
      kick.position.set(cx, 0.04, r.maxZ + 0.01)
      group.add(strip, kick)

      const pool = new Mesh(new PlaneGeometry(width + 2.5, 3.4), this.pool)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(cx, 0.003, r.maxZ + 1.4)
      group.add(pool)
    })
    return group
  }

  /** Banco dos visitantes, vasos nos cantos e quadros nas paredes. */
  private buildFurniture(room: Rect, bounds: Rect): Group {
    const p = this.palette
    const group = new Group()
    const cx = (bounds.minX + bounds.maxX) / 2

    const wood = std(p['--scene-wood'], { roughness: 0.6 })
    const steel = std(p['--scene-steel'], { metalness: 0.5, roughness: 0.4 })
    const seat = new Mesh(new BoxGeometry(3, 0.1, 0.62), wood)
    seat.position.set(cx, 0.46, bounds.maxZ + 3.6)
    const legs = new InstancedMesh(new BoxGeometry(0.08, 0.42, 0.5), steel, 2)
    placeInstance(legs, 0, cx - 1.25, 0.21, seat.position.z, 1, 1, 1)
    placeInstance(legs, 1, cx + 1.25, 0.21, seat.position.z, 1, 1, 1)
    seat.castShadow = seat.receiveShadow = true
    group.add(seat, legs)

    // Vasos com folhagem nos cantos da frente da vitrine.
    const potSpots: Array<[number, number]> = [
      [bounds.minX - 1.6, bounds.minZ + 0.6],
      [bounds.maxX + 1.6, bounds.minZ + 0.6],
      [room.minX + 0.8, bounds.maxZ + 4.5],
      [room.maxX - 0.8, bounds.maxZ + 4.5],
    ]
    const pots = new InstancedMesh(new CylinderGeometry(0.34, 0.26, 0.62, 12), std(p['--scene-room-floor'].clone().lerp(p['--scene-sack'], 0.5)), potSpots.length)
    potSpots.forEach(([x, z], i) => placeInstance(pots, i, x, 0.31, z, 1, 1, 1))
    pots.castShadow = true
    group.add(pots)
    group.add(
      buildTrees(
        p,
        potSpots.flatMap(([x, z]) => [
          { x, z, scale: 0.8, pine: false, bush: true },
          { x: x + 0.12, z: z - 0.1, scale: 0.55, pine: false, bush: true },
        ]),
        () => 0.5,
      ),
    )

    // Quadros nas paredes do lado: moldura e a pintura nas cores dos peixes.
    const paintings = [p['--fish-3'], p['--brand-fish'], p['--plant'], p['--fish-4']]
    const frame = std(p['--scene-cabinet'])
    const sideZ = [bounds.maxZ + 0.6, bounds.maxZ + 3.8]
    let n = 0
    for (const [x, rot] of [
      [room.minX + 0.04, Math.PI / 2],
      [room.maxX - 0.04, -Math.PI / 2],
    ] as const) {
      for (const z of sideZ) {
        const holder = new Group()
        holder.position.set(x, 2.1, z)
        holder.rotation.y = rot
        const border = new Mesh(new BoxGeometry(1.7, 1.15, 0.05), frame)
        const art = new Mesh(new BoxGeometry(1.48, 0.93, 0.06), std(paintings[n++ % paintings.length], { roughness: 0.7 }))
        art.position.z = 0.01
        holder.add(border, art)
        group.add(holder)
      }
    }
    return group
  }
}
