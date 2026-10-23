import {
  BackSide,
  BufferGeometry,
  type Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  Points,
  PointsMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { Footprint } from '../../plant/tanks'
import { seeded } from '../rng'
import type { Palette } from '../tokens'
import type { TankSlot } from './types'

/** Peças que mais de um cenário usa: material, fila de tanques, céu e árvores. */

export function std(color: Color, params: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: color.clone(), roughness: 0.85, metalness: 0.05, flatShading: true, ...params })
}

/** Um retângulo no chão, no mundo. */
export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Tanques lado a lado, `perRow` por fileira, com `gap` metros entre os
 * equipamentos de um e do outro. As fileiras seguintes vão para trás. A
 * fileira fica centrada no x = 0.
 */
export function rowSlots(footprints: Footprint[], perRow: number, gap: number, rowGap: number, lift = 0): TankSlot[] {
  const slots: TankSlot[] = []
  let rowZ = 0
  for (let start = 0; start < footprints.length; start += perRow) {
    const row = footprints.slice(start, start + perRow)
    const width = row.reduce((sum, fp) => sum + (fp.maxX - fp.minX), 0) + gap * (row.length - 1)
    let cursor = -width / 2
    const front = Math.max(...row.map((fp) => fp.maxZ))
    for (const fp of row) {
      // A frente de todos na mesma linha: o que muda é o quanto cada um vai para trás.
      slots.push({ origin: new Vector3(cursor - fp.minX, lift, rowZ - front) })
      cursor += fp.maxX - fp.minX + gap
    }
    const depth = Math.max(...row.map((fp) => fp.maxZ - fp.minZ))
    rowZ -= depth + rowGap
  }
  return slots
}

/** O retângulo que todos os tanques ocupam, já no mundo. */
export function boundsOf(slots: TankSlot[], footprints: Footprint[]): Rect {
  const rect: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  slots.forEach((slot, i) => {
    const fp = footprints[i]
    rect.minX = Math.min(rect.minX, slot.origin.x + fp.minX)
    rect.maxX = Math.max(rect.maxX, slot.origin.x + fp.maxX)
    rect.minZ = Math.min(rect.minZ, slot.origin.z + fp.minZ)
    rect.maxZ = Math.max(rect.maxZ, slot.origin.z + fp.maxZ)
  })
  return rect
}

export function worldRect(slot: TankSlot, fp: Footprint, grow = 0): Rect {
  return {
    minX: slot.origin.x + fp.minX - grow,
    maxX: slot.origin.x + fp.maxX + grow,
    minZ: slot.origin.z + fp.minZ - grow,
    maxZ: slot.origin.z + fp.maxZ + grow,
  }
}

/** Ruído barato e suave (soma de senos), de -1 a 1: manchas de grama, morros, concreto. */
export function softNoise(x: number, z: number): number {
  return (
    0.5 * Math.sin(x * 0.13 + Math.sin(z * 0.07) * 2) +
    0.3 * Math.sin(z * 0.17 + x * 0.05 + 1.3) +
    0.2 * Math.sin((x + z) * 0.31 + Math.sin(x * 0.23))
  )
}

const m = new Matrix4()
const q = new Quaternion()
const UP = new Vector3(0, 1, 0)

/** Põe uma instância no lugar: posição, giro em y e escala. */
export function placeInstance(mesh: InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0): void {
  q.setFromAxisAngle(UP, rotY)
  m.compose(new Vector3(x, y, z), q, new Vector3(sx, sy, sz))
  mesh.setMatrixAt(i, m)
}

// --- céu ---------------------------------------------------------------------------

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww; // sempre no fundo
}`

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSun;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoon;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.6));
  col = mix(col, uGround, smoothstep(0.0, -0.08, h));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 18.0) * 0.28 + pow(sd, 400.0) * 0.6) * uSun;
  col = mix(col, uSunColor, smoothstep(0.9990, 0.9994, sd) * uSun);
  float md = max(dot(dir, uMoonDir), 0.0);
  col = mix(col, uMoonColor, smoothstep(0.99955, 0.99970, md) * uMoon);
  col += uMoonColor * pow(md, 60.0) * 0.12 * uMoon;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

/**
 * A cúpula do céu, com o degradê do zênite ao horizonte, o sol, a lua e as
 * estrelas. Tudo segue `daylight`: a luminosidade lida pelo sensor.
 */
export class SkyDome {
  readonly root = new Group()
  /** Para onde está o sol (ou a lua, à noite): a luz principal vem daí. */
  readonly lightDir = new Vector3(0.45, 0.8, 0.35)
  readonly horizon: Color
  private readonly material: ShaderMaterial
  private readonly stars: PointsMaterial
  private readonly palette: Palette

  constructor(palette: Palette, starCount: number) {
    this.palette = palette
    this.horizon = palette['--scene-horizon-day'].clone()
    this.material = new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uZenith: { value: palette['--scene-zenith-day'].clone() },
        uHorizon: { value: this.horizon },
        uGround: { value: palette['--scene-hill'].clone() },
        uSunDir: { value: new Vector3(0.4, 0.6, -0.7).normalize() },
        uSunColor: { value: palette['--scene-sun'].clone() },
        uSun: { value: 1 },
        uMoonDir: { value: new Vector3(-0.4, 0.5, -0.75).normalize() },
        uMoonColor: { value: palette['--scene-moon'].clone() },
        uMoon: { value: 0 },
      },
    })
    const dome = new Mesh(new SphereGeometry(190, 32, 16), this.material)
    dome.renderOrder = -10
    dome.frustumCulled = false
    this.root.add(dome)

    const random = seeded(11)
    const positions: number[] = []
    for (let i = 0; i < starCount; i += 1) {
      const theta = random() * Math.PI * 2
      const y = 0.12 + random() * 0.88
      const r = Math.sqrt(1 - y * y)
      positions.push(Math.cos(theta) * r * 170, y * 170, Math.sin(theta) * r * 170)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.stars = new PointsMaterial({
      color: palette['--scene-moon'].clone(),
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    const points = new Points(geometry, this.stars)
    points.frustumCulled = false
    this.root.add(points)
  }

  update(daylight: number): void {
    const p = this.palette
    const u = this.material.uniforms
    u.uZenith.value.copy(p['--scene-zenith-night']).lerp(p['--scene-zenith-day'], daylight)
    this.horizon.copy(p['--scene-horizon-night']).lerp(p['--scene-horizon-day'], daylight)
    u.uGround.value.copy(p['--scene-horizon-night']).lerp(p['--scene-hill'], daylight * 0.7)

    // O sol sobe com a luz; à noite ele afunda e a lua aparece do outro lado.
    const sunElevation = -0.25 + 1.25 * daylight
    u.uSunDir.value.set(0.55 * Math.cos(sunElevation), Math.sin(sunElevation), -0.6 * Math.cos(sunElevation)).normalize()
    u.uSun.value = Math.min(1, Math.max(0, daylight * 1.6 - 0.1))
    const moonElevation = 0.85 - 0.95 * daylight
    u.uMoonDir.value.set(-0.5 * Math.cos(moonElevation), Math.sin(moonElevation), -0.7 * Math.cos(moonElevation)).normalize()
    u.uMoon.value = Math.min(1, Math.max(0, (0.55 - daylight) * 2.2))
    this.stars.opacity = Math.max(0, (0.45 - daylight) / 0.45) * 0.95

    this.lightDir.copy(daylight > 0.18 ? u.uSunDir.value : u.uMoonDir.value)
    if (this.lightDir.y < 0.25) this.lightDir.y = 0.25
    this.lightDir.normalize()
  }
}

// --- árvores -----------------------------------------------------------------------

export interface TreeSpot {
  x: number
  z: number
  scale: number
  /** Copa redonda (ipê, mangueira) ou pinheiro. */
  pine: boolean
  /** Arbusto: só a copa, baixinha. */
  bush?: boolean
}

/**
 * Árvores e arbustos com três `InstancedMesh` (troncos, copas redondas e
 * pinheiros): dezenas de árvores, três chamadas de desenho, como o enunciado
 * recomenda para repetições.
 */
export function buildTrees(palette: Palette, spots: TreeSpot[], groundY: (x: number, z: number) => number): Group {
  const group = new Group()
  const trees = spots.filter((s) => !s.bush)
  const rounds = spots.filter((s) => !s.pine)
  const pines = spots.filter((s) => s.pine && !s.bush)

  const trunks = new InstancedMesh(new CylinderGeometry(0.12, 0.18, 1, 6), std(palette['--scene-trunk']), Math.max(1, trees.length))
  const crowns = new InstancedMesh(new IcosahedronGeometry(1, 0), std(palette['--surface']), Math.max(1, rounds.length))
  const cones = new InstancedMesh(new ConeGeometry(1, 1, 7), std(palette['--surface']), Math.max(1, pines.length * 2))
  for (const mesh of [trunks, crowns, cones]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.count = 0
  }

  const random = seeded(23)
  for (const spot of spots) {
    const y = groundY(spot.x, spot.z)
    const s = spot.scale
    const leaf = random() < 0.5 ? palette['--scene-leaf'] : palette['--scene-leaf-2']
    if (!spot.bush) {
      const h = spot.pine ? 1.1 * s : 1.6 * s
      placeInstance(trunks, trunks.count++, spot.x, y + h / 2, spot.z, s, h, s)
    }
    if (spot.bush) {
      placeInstance(crowns, crowns.count, spot.x, y + 0.35 * s, spot.z, 0.9 * s, 0.6 * s, 0.9 * s, random() * 3)
      crowns.setColorAt(crowns.count++, leaf)
    } else if (spot.pine) {
      placeInstance(cones, cones.count, spot.x, y + 2.4 * s, spot.z, 1.2 * s, 2.6 * s, 1.2 * s, random() * 3)
      cones.setColorAt(cones.count++, palette['--scene-leaf'])
      placeInstance(cones, cones.count, spot.x, y + 3.6 * s, spot.z, 0.85 * s, 1.9 * s, 0.85 * s, random() * 3)
      cones.setColorAt(cones.count++, palette['--scene-leaf'])
    } else {
      placeInstance(crowns, crowns.count, spot.x, y + 2.3 * s, spot.z, 1.35 * s, 1.15 * s, 1.35 * s, random() * 3)
      crowns.setColorAt(crowns.count++, leaf)
    }
  }
  group.add(trunks, crowns, cones)
  return group
}
