import {
  BoxGeometry,
  type BufferGeometry,
  type Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { TANK_3D, type ModelKind, type Vec3 } from '../plant/layout'
import { seeded } from './rng'
import type { Palette } from './tokens'

/**
 * Os modelos da cena, de poucos polígonos e feitos em código (WEB-05). Cada
 * um diz onde ficam os seus bocais: os tubos saem e chegam exatamente neles.
 *
 * Um bocal é um `Object3D` na ponta, com o +Y local apontando para fora: é
 * por ali que o tubo sai.
 */

export interface ItemModel {
  root: Group
  /** Peças pintadas com a cor do estado: normal, atenção, crítico ou sem dados. */
  status: MeshStandardMaterial[]
  /** Lâmpada que acende com o atuador ligado. */
  lamp: MeshStandardMaterial | null
  nozzles: Record<string, Object3D>
  labelAnchor: Object3D
  /** Peças que a cena anima. */
  parts: {
    /** O que treme com a vibração (sem os bocais, que ficam presos nos tubos). */
    body?: Object3D
    /** Gira com o equipamento ligado. */
    fan?: Object3D
    /** Feixe do sensor de nível até a água. */
    beam?: Mesh
  }
}

export interface TankModel {
  root: Group
  water: Mesh
  waterMaterial: MeshStandardMaterial
  surface: Mesh
  nozzles: Record<string, Object3D>
  /** De onde saem as bolhas e os jatos, em coordenadas do tanque. */
  emitters: { airstone: Vector3; refill: Vector3; return: Vector3 }
  /** Fita de LED na borda: acende à noite. */
  led: MeshBasicMaterial
  /** Relógio das plantas, da superfície e das cáusticas: para junto com o tanque. */
  time: { value: number }
  /** Força das cáusticas na areia: 0 sem água. */
  caustics: { value: number }
}

const UP = new Vector3(0, 1, 0)

function material(color: Color, params: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: color.clone(), roughness: 0.65, metalness: 0.1, flatShading: true, ...params })
}

function add(parent: Object3D, geometry: BufferGeometry, mat: MeshStandardMaterial, position: Vec3): Mesh {
  const mesh = new Mesh(geometry, mat)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** Cilindro deitado no eixo x. */
function addAlongX(parent: Object3D, radius: number, length: number, mat: MeshStandardMaterial, position: Vec3): Mesh {
  const mesh = add(parent, new CylinderGeometry(radius, radius, length, 14), mat, position)
  mesh.rotation.z = Math.PI / 2
  return mesh
}

/**
 * Bocal: um toco de cano que entra no equipamento e um flange na ponta. A
 * ponta fica em `tip`; `stub` é quanto o toco entra para dentro, até encostar
 * no corpo.
 */
function addNozzle(
  parent: Object3D,
  nozzles: Record<string, Object3D>,
  name: string,
  tip: Vec3,
  direction: Vec3,
  radius: number,
  stub: number,
  mat: MeshStandardMaterial,
): void {
  const nozzle = new Object3D()
  nozzle.name = name
  nozzle.position.set(...tip)
  nozzle.quaternion.copy(new Quaternion().setFromUnitVectors(UP, new Vector3(...direction).normalize()))
  const pipe = new Mesh(new CylinderGeometry(radius * 1.15, radius * 1.15, stub, 12), mat)
  pipe.position.y = -stub / 2
  const flange = new Mesh(new CylinderGeometry(radius * 1.7, radius * 1.7, 0.03, 14), mat)
  flange.position.y = -0.015
  pipe.castShadow = flange.castShadow = true
  nozzle.add(pipe, flange)
  parent.add(nozzle)
  nozzles[name] = nozzle
}

function anchor(parent: Object3D, position: Vec3): Object3D {
  const point = new Object3D()
  point.position.set(...position)
  parent.add(point)
  return point
}

/** A cor do estado fica fora do mapeamento de tons: o vermelho do crítico é o mesmo da tela. */
function statusMaterial(palette: Palette): MeshStandardMaterial {
  return material(palette['--scene-nodata'], { roughness: 0.5, toneMapped: false })
}

function lampMaterial(palette: Palette): MeshStandardMaterial {
  return material(palette['--metal'], { roughness: 0.3, flatShading: false })
}

// --- tanque ----------------------------------------------------------------------

/** Lâmina de planta aquática: base em y = 0, afina e curva para a ponta (y = 1). */
function bladeGeometry(): PlaneGeometry {
  const blade = new PlaneGeometry(0.07, 1, 1, 8)
  blade.translate(0, 0.5, 0)
  const position = blade.getAttribute('position')
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i)
    position.setX(i, position.getX(i) * (1 - 0.8 * y))
    position.setZ(i, y * y * 0.16)
  }
  blade.computeVertexNormals()
  return blade
}

/** As plantas balançam no shader, cada uma no seu tempo (pela posição dela). */
function swayingPlants(material: MeshStandardMaterial, time: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 plantAt = instanceMatrix[3].xyz;
        #else
          vec3 plantAt = vec3(0.0);
        #endif
        float bend = clamp(position.y, 0.0, 1.0);
        bend *= bend;
        transformed.x += sin(uTime * 1.3 + plantAt.x * 2.7 + plantAt.z * 1.9) * 0.09 * bend;
        transformed.z += cos(uTime * 1.1 + plantAt.x * 1.7) * 0.05 * bend;`,
      )
  }
  material.customProgramCacheKey = () => 'planta-v1'
}

/** Ondinhas na superfície da água. O plano está deitado: o z dele é o "para cima". */
function ripplingSurface(material: MeshStandardMaterial, time: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += sin(position.x * 5.0 + uTime * 1.6) * 0.012 + sin(position.y * 8.0 - uTime * 1.2) * 0.008;`,
      )
  }
  material.customProgramCacheKey = () => 'superficie-v1'
}

/**
 * Cáusticas na areia: a rede de luz que a superfície ondulada projeta no
 * fundo. Calculadas no shader, sem textura; `strength` liga e desliga.
 */
function causticSand(material: MeshStandardMaterial, time: { value: number }, strength: { value: number }, tint: Color): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time
    shader.uniforms.uCaustics = strength
    shader.uniforms.uCausticTint = { value: tint }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSandPos;
        uniform float uTime;
        uniform float uCaustics;
        uniform vec3 uCausticTint;
        float caustic(vec2 p, float t) {
          vec2 q = p * 3.2;
          float c = sin(q.x * 1.7 + t * 0.9 + sin(q.y * 1.3 + t * 0.7));
          c += sin(q.y * 1.9 - t * 0.8 + sin(q.x * 1.1 - t * 0.6));
          return pow(1.0 - abs(c) * 0.5, 7.0);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uCausticTint * caustic(vSandPos.xy, uTime) * uCaustics;`,
      )
  }
  material.customProgramCacheKey = () => 'areia-v1'
}

export function buildTank(palette: Palette): TankModel {
  const { width: W, depth: D, height: H, sand: S } = TANK_3D
  const root = new Group()
  root.name = 'tank'
  const nozzles: Record<string, Object3D> = {}
  const time = { value: 0 }
  const random = seeded(7)

  // Vidro: quatro paredes transparentes, sem tampa, com um leve tom de água.
  const glass = material(palette['--surface'], {
    transparent: true,
    opacity: 0.12,
    roughness: 0.05,
    metalness: 0.1,
    side: DoubleSide,
    depthWrite: false,
    flatShading: false,
  })
  for (const z of [-D / 2, D / 2]) {
    const pane = new Mesh(new PlaneGeometry(W, H), glass)
    pane.position.set(0, H / 2, z)
    pane.renderOrder = 2
    root.add(pane)
  }
  for (const x of [-W / 2, W / 2]) {
    const pane = new Mesh(new PlaneGeometry(D, H), glass)
    pane.position.set(x, H / 2, 0)
    pane.rotation.y = Math.PI / 2
    pane.renderOrder = 2
    root.add(pane)
  }

  // Armação fina nas 12 arestas e um friso mais largo na borda de cima.
  const frame = material(palette['--night'], { metalness: 0.35, roughness: 0.35 })
  const f = 0.045
  for (const y of [f / 2, H]) {
    const t = y === H ? 0.07 : f
    for (const z of [-D / 2, D / 2]) add(root, new BoxGeometry(W + t, f, t), frame, [0, y, z])
    for (const x of [-W / 2, W / 2]) add(root, new BoxGeometry(t, f, D + t), frame, [x, y, 0])
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) add(root, new BoxGeometry(f, H, f), frame, [x, H / 2, z])

  // Luminária com a fita de LED, na borda de trás.
  add(root, new BoxGeometry(W - 0.12, 0.05, 0.12), frame, [0, H + 0.035, -D / 2 + 0.07])
  const led = new MeshBasicMaterial({ color: palette['--scene-led'].clone(), toneMapped: false })
  const strip = new Mesh(new BoxGeometry(W - 0.22, 0.012, 0.05), led)
  strip.position.set(0, H + 0.005, -D / 2 + 0.07)
  root.add(strip)

  // Areia: a caixa e, por cima, o fundo com dunas e cáusticas.
  add(root, new BoxGeometry(W - 0.02, S, D - 0.02), material(palette['--sand'], { roughness: 1 }), [0, S / 2, 0])
  const dunes = new PlaneGeometry(W - 0.03, D - 0.03, 36, 18)
  const dunePos = dunes.getAttribute('position')
  for (let i = 0; i < dunePos.count; i += 1) {
    const x = dunePos.getX(i)
    const y = dunePos.getY(i)
    dunePos.setZ(i, 0.03 * Math.sin(x * 2.1 + y * 1.3) + 0.018 * Math.sin(x * 5.3 - y * 3.7) + 0.02)
  }
  dunes.computeVertexNormals()
  const sandTop = material(palette['--sand'], { roughness: 0.95 })
  const caustics = { value: 0 }
  causticSand(sandTop, time, caustics, palette['--surface'].clone())
  const floor = add(root, dunes, sandTop, [0, S, 0])
  floor.rotation.x = -Math.PI / 2
  floor.castShadow = false

  // Água: um cubo de lado 1, esticado até o nível lido.
  const waterMaterial = material(palette['--water'], {
    transparent: true,
    opacity: 0.42,
    roughness: 0.1,
    metalness: 0,
    depthWrite: false,
    flatShading: false,
  })
  const water = new Mesh(new BoxGeometry(1, 1, 1), waterMaterial)
  water.scale.set(W - 0.04, 0.001, D - 0.04)
  water.position.y = S
  water.renderOrder = 1
  water.visible = false
  root.add(water)

  const surfaceMaterial = material(palette['--water-line'], {
    transparent: true,
    opacity: 0.32,
    roughness: 0.05,
    depthWrite: false,
    side: DoubleSide,
    flatShading: false,
  })
  ripplingSurface(surfaceMaterial, time)
  const surface = new Mesh(new PlaneGeometry(W - 0.04, D - 0.04, 24, 12), surfaceMaterial)
  surface.rotation.x = -Math.PI / 2
  surface.renderOrder = 1
  surface.visible = false
  root.add(surface)

  // Plantas em tufos de lâminas que balançam: repetição, então um InstancedMesh só.
  const tufts: Array<[number, number, number]> = [
    [-1.65, -0.6, 1.1],
    [-1.25, -0.72, 0.8],
    [-1.75, 0.15, 0.7],
    [1.6, -0.55, 1.15],
    [1.2, -0.7, 0.85],
    [1.75, 0.3, 0.75],
    [-0.15, -0.72, 0.6],
    [0.45, -0.65, 0.7],
  ]
  const perTuft = 7
  const plantMaterial = material(palette['--surface'], { roughness: 0.8, side: DoubleSide, flatShading: false })
  swayingPlants(plantMaterial, time)
  const plants = new InstancedMesh(bladeGeometry(), plantMaterial, tufts.length * perTuft)
  plants.castShadow = true
  const m = new Matrix4()
  const q = new Quaternion()
  tufts.forEach(([x, z, height], t) => {
    for (let i = 0; i < perTuft; i += 1) {
      const index = t * perTuft + i
      const spread = 0.12
      q.setFromAxisAngle(UP, random() * Math.PI * 2)
      m.compose(
        new Vector3(x + (random() - 0.5) * spread, S + 0.02, z + (random() - 0.5) * spread),
        q,
        new Vector3(1, height * (0.55 + random() * 0.5), 1),
      )
      plants.setMatrixAt(index, m)
      plants.setColorAt(index, (t + i) % 3 === 0 ? palette['--plant-2'] : palette['--plant'])
    }
  })
  root.add(plants)

  // Pedras de tamanhos e tons variados.
  const rocks = new InstancedMesh(new DodecahedronGeometry(0.12, 0), material(palette['--sand-dot']), 8)
  const rockSpots: Array<[number, number]> = [
    [-1.2, -0.15],
    [-0.85, 0.55],
    [0.7, -0.05],
    [1.15, 0.55],
    [1.5, -0.3],
    [-0.35, 0.35],
    [0.25, 0.6],
    [-1.55, 0.55],
  ]
  rockSpots.forEach(([x, z], i) => {
    const size = 0.6 + random() * 0.9
    q.setFromAxisAngle(UP, random() * Math.PI)
    m.compose(new Vector3(x, S + 0.03, z), q, new Vector3(1.3 * size, 0.6 * size, size))
    rocks.setMatrixAt(i, m)
    rocks.setColorAt(i, i % 3 === 0 ? palette['--metal'] : palette['--sand-dot'])
  })
  rocks.castShadow = true
  rocks.receiveShadow = true
  root.add(rocks)

  // Um tronco deitado, com um galho: o lugar onde os peixes se escondem.
  const wood = material(palette['--scene-wood-dark'], { roughness: 0.9 })
  const log = add(root, new CylinderGeometry(0.07, 0.1, 1.3, 7), wood, [0.15, S + 0.08, 0.15])
  log.rotation.set(0, 0.5, Math.PI / 2 - 0.12)
  const branch = add(root, new CylinderGeometry(0.035, 0.05, 0.55, 6), wood, [0.35, S + 0.28, 0.05])
  branch.rotation.set(0.2, 0.5, -0.6)

  // Bocais do tanque: saída no fundo, retorno e reposição por cima, pedra porosa.
  const metal = material(palette['--metal'], { metalness: 0.4, roughness: 0.4 })
  addNozzle(root, nozzles, 'outlet', [W / 2 + 0.12, 0.3, 0.35], [1, 0, 0], 0.06, 0.15, metal)
  addNozzle(root, nozzles, 'return', [1.55, 2.3, -0.75], [0, 1, 0], 0.06, 0.3, metal)
  addNozzle(root, nozzles, 'refill', [-1.5, 2.3, -0.6], [0, 1, 0], 0.05, 0.3, metal)
  add(root, new CylinderGeometry(0.13, 0.13, 0.07, 12), material(palette['--sand-dot']), [-1.35, S + 0.035, 0.5])
  addNozzle(root, nozzles, 'airstone', [-1.35, S + 0.1, 0.5], [0, 1, 0], 0.025, 0.03, metal)

  return {
    root,
    water,
    waterMaterial,
    surface,
    nozzles,
    emitters: {
      airstone: new Vector3(-1.35, S + 0.08, 0.5),
      refill: new Vector3(-1.5, 2.0, -0.6),
      return: new Vector3(1.55, 2.0, -0.75),
    },
    led,
    time,
    caustics,
  }
}

// --- filtro (peça fixa, não é dispositivo) -------------------------------------------

export function buildFilter(palette: Palette): { root: Group; nozzles: Record<string, Object3D>; labelAnchor: Object3D } {
  const root = new Group()
  root.name = 'filter'
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.4, roughness: 0.4 })
  add(root, new CylinderGeometry(0.3, 0.32, 0.1, 16), metal, [0, 0.05, 0])
  add(root, new CylinderGeometry(0.28, 0.28, 0.9, 16), material(palette['--surface'], { roughness: 0.4 }), [0, 0.55, 0])
  add(root, new CylinderGeometry(0.31, 0.31, 0.12, 16), metal, [0, 1.06, 0])
  addNozzle(root, nozzles, 'inlet', [0.12, 1.15, 0], [0, 1, 0], 0.06, 0.05, metal)
  addNozzle(root, nozzles, 'outlet', [-0.12, 1.15, 0], [0, 1, 0], 0.06, 0.05, metal)
  return { root, nozzles, labelAnchor: anchor(root, [0, 1.45, 0]) }
}

// --- itens do cadastro -------------------------------------------------------------------

export function buildItem(kind: ModelKind, palette: Palette): ItemModel {
  switch (kind) {
    case 'pump':
      return buildPump(palette)
    case 'aerator':
      return buildAerator(palette)
    case 'refill':
      return buildRefill(palette)
    case 'probe':
      return buildProbe(palette)
    case 'level-sensor':
      return buildLevelSensor(palette)
    case 'light-sensor':
      return buildLightSensor(palette)
    default:
      return buildGeneric(palette)
  }
}

/** Bomba de recirculação: voluta com a entrada de frente, motor e ventoinha atrás. */
function buildPump(palette: Palette): ItemModel {
  const root = new Group()
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)

  add(root, new BoxGeometry(1.05, 0.08, 0.5), metal, [0.3, 0.04, 0])

  const body = new Group()
  root.add(body)
  addAlongX(body, 0.24, 0.22, metal, [0, 0.3, 0])
  addAlongX(body, 0.19, 0.55, status, [0.385, 0.3, 0])
  add(body, new BoxGeometry(0.1, 0.12, 0.36), metal, [0.2, 0.12, 0])
  add(body, new BoxGeometry(0.1, 0.12, 0.36), metal, [0.55, 0.12, 0])
  addAlongX(body, 0.2, 0.06, metal, [0.69, 0.3, 0])
  add(body, new SphereGeometry(0.05, 12, 8), status, [0.385, 0.52, 0])

  // Ventoinha do motor: gira com a bomba ligada.
  const fan = new Group()
  fan.position.set(0.735, 0.3, 0)
  fan.userData.axis = 'x'
  for (let i = 0; i < 3; i += 1) {
    const blade = new Mesh(new BoxGeometry(0.012, 0.32, 0.06), metal)
    blade.rotation.x = (i * Math.PI) / 3
    fan.add(blade)
  }
  body.add(fan)

  addNozzle(root, nozzles, 'inlet', [-0.45, 0.3, 0], [-1, 0, 0], 0.06, 0.34, metal)
  addNozzle(root, nozzles, 'outlet', [0, 0.8, 0], [0, 1, 0], 0.06, 0.26, metal)

  return { root, status: [status], lamp: null, nozzles, labelAnchor: anchor(root, [-0.2, 1.05, 0]), parts: { body, fan } }
}

/** Aerador: o compressor de ar no chão, com a ventoinha de frente e a lâmpada. */
function buildAerator(palette: Palette): ItemModel {
  const root = new Group()
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  const lamp = lampMaterial(palette)

  const body = new Group()
  root.add(body)
  add(body, new BoxGeometry(0.5, 0.32, 0.4), status, [0, 0.2, 0])
  add(body, new BoxGeometry(0.32, 0.02, 0.26), metal, [0, 0.37, 0])
  add(body, new SphereGeometry(0.045, 12, 8), lamp, [-0.15, 0.39, 0.12])
  for (const x of [-0.18, 0.18]) add(body, new BoxGeometry(0.08, 0.04, 0.34), metal, [x, 0.02, 0])

  const fan = new Group()
  fan.position.set(0.06, 0.2, 0.205)
  fan.userData.axis = 'z'
  for (let i = 0; i < 3; i += 1) {
    const blade = new Mesh(new BoxGeometry(0.012, 0.22, 0.012), metal)
    blade.rotation.z = (i * Math.PI) / 3
    fan.add(blade)
  }
  body.add(fan)

  addNozzle(root, nozzles, 'outlet', [0.3, 0.3, 0], [1, 0, 0], 0.025, 0.05, metal)
  return { root, status: [status], lamp, nozzles, labelAnchor: anchor(root, [0, 0.7, 0]), parts: { body, fan } }
}

/** Reposição: o reservatório e a bombinha em cima dele. */
function buildRefill(palette: Palette): ItemModel {
  const root = new Group()
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  const lamp = lampMaterial(palette)

  add(root, new CylinderGeometry(0.4, 0.4, 1, 18), material(palette['--surface'], { roughness: 0.4 }), [0, 0.5, 0])
  add(root, new CylinderGeometry(0.41, 0.41, 0.06, 18), metal, [0, 0.03, 0])
  add(root, new CylinderGeometry(0.41, 0.41, 0.04, 18), metal, [0, 0.98, 0])
  add(root, new BoxGeometry(0.06, 0.6, 0.01), material(palette['--water']), [0, 0.45, 0.405])

  const body = new Group()
  root.add(body)
  add(body, new BoxGeometry(0.32, 0.12, 0.32), status, [0, 1.06, 0])
  add(body, new SphereGeometry(0.04, 12, 8), lamp, [0.12, 1.14, 0.12])

  addNozzle(root, nozzles, 'outlet', [0, 1.15, 0], [0, 1, 0], 0.05, 0.03, metal)
  return { root, status: [status], lamp, nozzles, labelAnchor: anchor(root, [0, 1.5, 0]), parts: { body } }
}

/** Sonda presa na borda: cabeça colorida pelo estado, haste e ponta dentro da água. */
function buildProbe(palette: Palette): ItemModel {
  const root = new Group()
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  add(root, new BoxGeometry(0.12, 0.1, 0.16), metal, [0, 0.02, 0])
  add(root, new CylinderGeometry(0.07, 0.07, 0.15, 12), status, [0, 0.15, 0])
  add(root, new CylinderGeometry(0.022, 0.022, 1.4, 8), metal, [0, -0.62, 0])
  add(root, new SphereGeometry(0.045, 10, 8), status, [0, -1.33, 0])
  return { root, status: [status], lamp: null, nozzles: {}, labelAnchor: anchor(root, [0, 0.42, 0]), parts: {} }
}

/** Sensor de nível ultrassônico: um braço sobre a água e o feixe até a superfície. */
function buildLevelSensor(palette: Palette): ItemModel {
  const root = new Group()
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  add(root, new BoxGeometry(0.12, 0.1, 0.16), metal, [0, 0.02, 0])
  add(root, new BoxGeometry(0.05, 0.05, 0.34), metal, [0, 0.12, 0.17])
  add(root, new CylinderGeometry(0.08, 0.08, 0.12, 14), status, [0, 0.08, 0.32])
  const beam = new Mesh(
    new CylinderGeometry(0.012, 0.012, 1, 6),
    material(palette['--accent'], { transparent: true, opacity: 0.5, depthWrite: false }),
  )
  beam.position.set(0, 0, 0.32)
  beam.visible = false
  root.add(beam)
  return { root, status: [status], lamp: null, nozzles: {}, labelAnchor: anchor(root, [0, 0.42, 0.17]), parts: { beam } }
}

/** Sensor de luz: um poste com a cúpula em cima. */
function buildLightSensor(palette: Palette): ItemModel {
  const root = new Group()
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  add(root, new CylinderGeometry(0.15, 0.18, 0.06, 12), metal, [0, 0.03, 0])
  add(root, new CylinderGeometry(0.035, 0.04, 2.45, 8), metal, [0, 1.25, 0])
  add(root, new CylinderGeometry(0.13, 0.13, 0.03, 14), metal, [0, 2.48, 0])
  add(root, new SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), status, [0, 2.49, 0])
  return { root, status: [status], lamp: null, nozzles: {}, labelAnchor: anchor(root, [0, 2.8, 0]), parts: {} }
}

/** Item cadastrado pela tela que ainda não tem modelo próprio: uma caixa com lâmpada. */
function buildGeneric(palette: Palette): ItemModel {
  const root = new Group()
  const status = statusMaterial(palette)
  const lamp = lampMaterial(palette)
  const body = new Group()
  root.add(body)
  add(body, new BoxGeometry(0.45, 0.45, 0.45), status, [0, 0.225, 0])
  add(body, new SphereGeometry(0.05, 12, 8), lamp, [0, 0.5, 0])
  return { root, status: [status], lamp, nozzles: {}, labelAnchor: anchor(root, [0, 0.8, 0]), parts: { body } }
}
