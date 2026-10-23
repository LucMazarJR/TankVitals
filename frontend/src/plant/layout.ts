import type { Role } from './roles'

/**
 * Onde cada dispositivo do cadastro entra no desenho do tanque, pelo id.
 *
 * O cadastro diz o que existe; este arquivo diz onde cada coisa fica na
 * representação visual da planta.
 */

/**
 * O tanque do dashboard (WEB-02). A cena 3D não usa mais isto: ela monta os
 * mesmos vínculos para cada tanque com `planTanks` (src/plant/tanks.ts), e em
 * desenvolvimento confere que os dois não se desencontram.
 */
export const TANK = {
  id: 'tanque-01',
  level: { device: 'nivel-01', field: 'level_pct' },
  aerator: { device: 'aerador-01', field: 'on' },
  recirculation: { device: 'bomba-rec-01', field: 'running' },
  refill: { device: 'bomba-repo-01', field: 'on' },
  // As grandezas que mexem no ambiente do 3D (WEB-07).
  flow: { device: 'bomba-rec-01', field: 'flow_l_min', full: 50 },
  vibration: { device: 'bomba-rec-01', field: 'vibration_mm_s' },
  turbidity: { device: 'turbidez-01', field: 'turbidity_ntu' },
  light: { device: 'luz-01', field: 'light_lux' },
  oxygen: { device: 'od-01', field: 'oxygen_mg_l' },
} as const

// --- Cena 3D (WEB-05) ---------------------------------------------------------
//
// Tudo aqui é local de um tanque: medidas em metros, y para cima, o tanque
// centrado na origem com o fundo no chão e a frente para +z. Quem decide onde
// cada tanque fica no mundo é o cenário (src/scene/environments/).

export type Vec3 = [number, number, number]

/** Tanque: 4 m de largura, 2 de fundo e 2 de altura. */
export const TANK_3D = { width: 4, depth: 2, height: 2, sand: 0.12 } as const

/** Vazão que conta como "cheia" nos tubos da recirculação, em L/min. */
export const FLOW_FULL_L_MIN = 50

/** Que modelo desenhar para cada item. */
export type ModelKind = 'probe' | 'level-sensor' | 'light-sensor' | 'pump' | 'aerator' | 'refill' | 'generic'

export interface Placement {
  model: ModelKind
  /** Ponto de montagem: no chão para equipamentos, na borda do tanque para sondas. */
  position: Vec3
  /** Giro em torno do eixo vertical, em graus. */
  rotationY?: number
}

const RIM = TANK_3D.height
const BACK = -TANK_3D.depth / 2 + 0.15
const FRONT = TANK_3D.depth / 2 - 0.15

/**
 * Onde fica o primeiro dispositivo de cada papel num tanque. É o "molde" que
 * todo tanque novo segue: um segundo tanque com `ph-02`, `od-02`... ganha as
 * mesmas posições, no lugar dele.
 */
export const ROLE_LAYOUT: Partial<Record<Role, Placement>> = {
  temperature: { model: 'probe', position: [-1.05, RIM, BACK] },
  ph: { model: 'probe', position: [-0.5, RIM, BACK] },
  level: { model: 'level-sensor', position: [0.05, RIM, BACK] },
  turbidity: { model: 'probe', position: [0.55, RIM, BACK] },
  oxygen: { model: 'probe', position: [1.05, RIM, BACK] },
  light: { model: 'light-sensor', position: [-2.5, 0, -1.55] },
  recirculation: { model: 'pump', position: [3.3, 0, 0.35] },
  aerator: { model: 'aerator', position: [-3, 0, 0.5] },
  refill: { model: 'refill', position: [-3.2, 0, -0.6] },
}

/**
 * A posição de cada item do cadastro, pelo id, como o enunciado pede. Vale
 * antes do molde: é aqui que se acerta um item que precisa de outro lugar (e,
 * se for o caso, o papel dele).
 */
export const SCENE_LAYOUT: Record<string, Placement & { role?: Role }> = {
  'temp-agua-01': { model: 'probe', position: [-1.05, RIM, BACK] },
  'ph-01': { model: 'probe', position: [-0.5, RIM, BACK] },
  'nivel-01': { model: 'level-sensor', position: [0.05, RIM, BACK] },
  'turbidez-01': { model: 'probe', position: [0.55, RIM, BACK] },
  'od-01': { model: 'probe', position: [1.05, RIM, BACK] },
  'luz-01': { model: 'light-sensor', position: [-2.5, 0, -1.55] },
  'bomba-rec-01': { model: 'pump', position: [3.3, 0, 0.35] },
  'aerador-01': { model: 'aerator', position: [-3, 0, 0.5] },
  'bomba-repo-01': { model: 'refill', position: [-3.2, 0, -0.6] },
}

/**
 * Onde entra o que não tem lugar no molde (um segundo pH no mesmo tanque, um
 * sensor de tipo novo): sondas na borda da frente, viradas para dentro, e o
 * resto numa fila no chão, à frente do tanque.
 */
export const AUTO_SLOTS = {
  rim: { start: [-1.5, RIM, FRONT] as Vec3, step: [0.45, 0, 0] as Vec3, perRow: 8, rowStep: [0, 0, -0.32] as Vec3 },
  floor: { start: [-3, 0, 2.1] as Vec3, step: [1.1, 0, 0] as Vec3, perRow: 7, rowStep: [0, 0, 1.1] as Vec3 },
}

/** Peças fixas da planta que não são dispositivos do cadastro. */
export const FIXTURES = {
  filter: { position: [3.18, 0, -0.75] as Vec3 },
}

/**
 * Tubos do molde, sempre de um bocal a outro: `<porta>.<bocal>`, onde a
 * porta é `tank`, `filter` ou um papel (vira o id do dispositivo daquele
 * papel no tanque). Os pontos `via` dão as curvas; o tubo sai e chega no eixo
 * de cada bocal, então não sobra ponta solta. Um tubo só aparece se os dois
 * bocais existem: tanque sem bomba não tem os tubos da bomba.
 *
 * `flow` diz o que corre dentro: a vazão da bomba ou o estado de um atuador.
 */
export interface PipeTemplate {
  id: string
  from: string
  to: string
  via: Vec3[]
  radius: number
  /** Ar (mangueira do aerador) ou água. */
  medium: 'water' | 'air'
  flow: 'flow' | 'aerator' | 'refill'
}

export const PIPE_TEMPLATE: PipeTemplate[] = [
  {
    id: 'saida-tanque',
    from: 'tank.outlet',
    to: 'recirculation.inlet',
    via: [],
    radius: 0.06,
    medium: 'water',
    flow: 'flow',
  },
  {
    id: 'bomba-filtro',
    from: 'recirculation.outlet',
    to: 'filter.inlet',
    via: [
      [3.3, 1.6, 0.35],
      [3.3, 1.6, -0.75],
    ],
    radius: 0.06,
    medium: 'water',
    flow: 'flow',
  },
  {
    id: 'filtro-retorno',
    from: 'filter.outlet',
    to: 'tank.return',
    via: [
      [3.06, 2.65, -0.75],
      [1.55, 2.65, -0.75],
    ],
    radius: 0.06,
    medium: 'water',
    flow: 'flow',
  },
  {
    id: 'mangueira-ar',
    from: 'aerator.outlet',
    to: 'tank.airstone',
    via: [
      [-2.5, 2.45, 0.5],
      [-1.35, 2.45, 0.5],
    ],
    radius: 0.025,
    medium: 'air',
    flow: 'aerator',
  },
  {
    id: 'reposicao',
    from: 'refill.outlet',
    to: 'tank.refill',
    via: [
      [-3.2, 2.6, -0.6],
      [-1.5, 2.6, -0.6],
    ],
    radius: 0.05,
    medium: 'water',
    flow: 'refill',
  },
]
