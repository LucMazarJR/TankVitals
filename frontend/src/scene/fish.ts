import {
  BufferAttribute,
  type BufferGeometry,
  type Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { FishStyle } from './environments/types'
import type { Palette } from './tokens'

/**
 * O cardume de um tanque (WEB-07): um `InstancedMesh` desenha todos os peixes.
 *
 * O peixe tem corpo torneado e achatado dos lados, cauda bifurcada, dorsal,
 * anal e olhos. A cor por vértice faz o dorso escuro e a barriga clara; a cor
 * de cada instância dá a espécie. O rabo ondula no shader, mais rápido quanto
 * mais oxigênio: o dado ao vivo continua mexendo no ritmo, como antes.
 */

// --- geometria ---------------------------------------------------------------------

/** Contorno do corpo, da cauda (y = -0,5) ao focinho (y = 0,5): raio em x. */
const PROFILE = [
  [0.0, -0.5],
  [0.045, -0.47],
  [0.075, -0.4],
  [0.135, -0.27],
  [0.19, -0.1],
  [0.215, 0.04],
  [0.205, 0.18],
  [0.17, 0.3],
  [0.115, 0.4],
  [0.055, 0.47],
  [0.0, 0.5],
].map(([r, y]) => new Vector2(r, y))

function polygon(points: Array<[number, number]>): ShapeGeometry {
  const shape = new Shape()
  shape.moveTo(...points[0])
  for (const point of points.slice(1)) shape.lineTo(...point)
  shape.closePath()
  return new ShapeGeometry(shape)
}

/** Pinta os vértices: `shade` recebe a posição e devolve o tom (1 = cor da espécie). */
function paint(geometry: BufferGeometry, shade: (x: number, y: number, z: number) => number): BufferGeometry {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const sway = new Float32Array(position.count)
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const k = shade(x, position.getY(i), position.getZ(i))
    colors.set([k, k, k], i * 3)
    // Quanto cada ponto balança: nada na cabeça, tudo na ponta da cauda.
    sway[i] = MathUtils.smoothstep(-x, -0.1, 0.62)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('aSway', new BufferAttribute(sway, 1))
  return geometry
}

function buildFishGeometry(style: FishStyle): BufferGeometry {
  const body = new LatheGeometry(PROFILE, 14)
  body.rotateZ(-Math.PI / 2) // o eixo do corpo vai para +x: focinho em +x
  body.scale(1, 1, style === 'tilapia' ? 0.42 : 0.36)
  paint(body, (x, y) => {
    // Dorso escuro, barriga clara; a tilápia tem faixas verticais leves.
    const countershade = 0.5 + 0.5 * MathUtils.smoothstep(-y, -0.16, 0.18)
    const bars = style === 'tilapia' && y > -0.05 && Math.sin(x * 30) > 0.55 ? 0.86 : 1
    return countershade * bars
  })

  const finTone = style === 'tilapia' ? 0.62 : 0.85
  const tail = paint(
    polygon([
      [-0.44, 0.045],
      [-0.69, 0.22],
      [-0.6, 0.0],
      [-0.69, -0.22],
      [-0.44, -0.045],
    ]),
    () => finTone,
  )
  const dorsal = paint(
    polygon([
      [0.2, 0.16],
      [0.06, style === 'tilapia' ? 0.31 : 0.35],
      [-0.2, 0.27],
      [-0.33, 0.12],
    ]),
    () => finTone * 0.92,
  )
  const anal = paint(
    polygon([
      [-0.04, -0.15],
      [-0.16, -0.27],
      [-0.31, -0.2],
      [-0.33, -0.1],
    ]),
    () => finTone,
  )
  const eyes = [-1, 1].map((side) => {
    const eye = new SphereGeometry(0.034, 8, 6)
    eye.translate(0.355, 0.055, side * 0.062)
    return paint(eye, () => 0.05)
  })

  const merged = mergeGeometries([body, tail, dorsal, anal, ...eyes])
  for (const part of [body, tail, dorsal, anal, ...eyes]) part.dispose()
  return merged
}

// --- material com o rabo ondulando --------------------------------------------------

function swimMaterial(): { material: MeshStandardMaterial; time: { value: number }; beat: { value: number } } {
  const time = { value: 0 }
  const beat = { value: 9 }
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15, side: DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uBeat = beat
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSway;\nattribute float aPhase;\nuniform float uTime;\nuniform float uBeat;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swaySq = aSway * aSway;
        float wave = sin(uTime * uBeat - position.x * 7.0 + aPhase);
        transformed.z += wave * 0.12 * swaySq;
        transformed.x -= abs(wave) * 0.02 * swaySq;`,
      )
  }
  // Todos os cardumes usam o mesmo programa: só mudam os valores.
  material.customProgramCacheKey = () => 'peixe-v1'
  return { material, time, beat }
}

// --- cardume -------------------------------------------------------------------------

interface Fish {
  pos: Vector3
  vel: Vector3
  target: Vector3
  retarget: number
  size: number
  cruise: number
  rot: Quaternion
}

/** O volume de água em que os peixes nadam, em coordenadas do tanque. */
export interface Waters {
  /** mg/L, ou `null` para manter o ritmo de antes. */
  oxygen: number | null
  bottom: number
  top: number
  halfW: number
  halfD: number
}

const m = new Matrix4()
const s = new Vector3()
const v = new Vector3()
const desired = new Vector3()
const look = new Quaternion()
const euler = { yaw: 0, pitch: 0 }
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)
const qYaw = new Quaternion()
const qPitch = new Quaternion()

export class FishSchool {
  readonly mesh: InstancedMesh
  private readonly fish: Fish[]
  private readonly time: { value: number }
  private readonly beat: { value: number }
  private readonly tall: number
  private pace = 1
  private gasping = false

  constructor(style: FishStyle, palette: Palette, count: number) {
    const geometry = buildFishGeometry(style)
    const phases = new Float32Array(count).map(() => Math.random() * Math.PI * 2)
    geometry.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
    const { material, time, beat } = swimMaterial()
    this.time = time
    this.beat = beat
    this.tall = style === 'ornamental' ? 1.18 : 1
    this.mesh = new InstancedMesh(geometry, material, count)
    // A sombra não acompanharia o rabo dobrando; e poupa uma passada de desenho.
    this.mesh.castShadow = false
    this.mesh.frustumCulled = false

    const colors: Color[] =
      style === 'tilapia'
        ? [palette['--fish-tilapia'], palette['--fish-tilapia'], palette['--fish-tilapia-2'], palette['--fish-tilapia-3']]
        : [palette['--brand-fish'], palette['--fish-2'], palette['--fish-3'], palette['--fish-4']]
    const [minSize, maxSize] = style === 'tilapia' ? [0.32, 0.44] : [0.18, 0.27]

    this.fish = Array.from({ length: count }, (_, i) => {
      this.mesh.setColorAt(i, colors[i % colors.length])
      return {
        pos: new Vector3((Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 1.2),
        vel: new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.3),
        target: new Vector3(),
        retarget: 0,
        size: MathUtils.lerp(minSize, maxSize, Math.random()),
        cruise: 0.3 + Math.random() * 0.25,
        rot: new Quaternion(),
      }
    })
  }

  update(dt: number, time: number, w: Waters): void {
    if (w.oxygen !== null) {
      // 6 mg/L ou mais: ritmo normal; 3 ou menos: quase parados. Abaixo de 4, sobem para a superfície.
      const target = Math.min(1, Math.max(0.15, (w.oxygen - 2.4) / 3.6))
      this.pace += (target - this.pace) * Math.min(1, dt)
      this.gasping = w.oxygen < 4
    }
    this.time.value = time
    this.beat.value = 4 + 10 * this.pace

    const minX = -w.halfW + 0.3
    const maxX = w.halfW - 0.3
    const minZ = -w.halfD + 0.22
    const maxZ = w.halfD - 0.22
    const shallow = w.top - w.bottom < 0.35
    const minY = w.bottom + 0.12
    const maxY = Math.max(minY, w.top - 0.1)

    this.fish.forEach((fish, i) => {
      fish.retarget -= dt
      if (fish.retarget <= 0 || fish.pos.distanceToSquared(fish.target) < 0.06) {
        fish.retarget = 2 + Math.random() * 4
        const low = this.gasping ? MathUtils.lerp(minY, maxY, 0.85) : minY
        fish.target.set(MathUtils.lerp(minX, maxX, Math.random()), MathUtils.lerp(low, maxY, Math.random()), MathUtils.lerp(minZ, maxZ, Math.random()))
      }
      if (shallow) fish.target.y = minY

      // Vai para o alvo, sem encostar nos vizinhos.
      const speed = fish.cruise * this.pace
      desired.copy(fish.target).sub(fish.pos).setLength(speed)
      for (let j = 0; j < this.fish.length; j += 1) {
        if (j === i) continue
        v.copy(fish.pos).sub(this.fish[j].pos)
        const d2 = v.lengthSq()
        if (d2 < 0.09 && d2 > 1e-6) desired.addScaledVector(v, (0.09 - d2) * 4)
      }
      fish.vel.lerp(desired, Math.min(1, dt * 1.4))
      fish.pos.addScaledVector(fish.vel, dt)
      fish.pos.set(
        MathUtils.clamp(fish.pos.x, minX, maxX),
        MathUtils.clamp(fish.pos.y, minY, maxY),
        MathUtils.clamp(fish.pos.z, minZ, maxZ),
      )

      // Aponta para onde nada, com pouca inclinação, e vira devagar.
      const horizontal = Math.hypot(fish.vel.x, fish.vel.z)
      if (horizontal > 1e-4) {
        euler.yaw = Math.atan2(-fish.vel.z, fish.vel.x)
        euler.pitch = MathUtils.clamp(Math.atan2(fish.vel.y, horizontal), -0.35, 0.35)
        qYaw.setFromAxisAngle(Y, euler.yaw)
        qPitch.setFromAxisAngle(Z, euler.pitch)
        look.copy(qYaw).multiply(qPitch)
        fish.rot.slerp(look, Math.min(1, dt * 4))
      }

      const bob = Math.sin(time * 1.3 + i) * 0.015
      v.copy(fish.pos)
      v.y += bob
      m.compose(v, fish.rot, s.set(fish.size, fish.size * this.tall, fish.size))
      this.mesh.setMatrixAt(i, m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
  }
}
