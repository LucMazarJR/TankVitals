import type { Device } from '../domain/devices'
import {
  AUTO_SLOTS,
  FIXTURES,
  FLOW_FULL_L_MIN,
  PIPE_TEMPLATE,
  ROLE_LAYOUT,
  SCENE_LAYOUT,
  TANK,
  TANK_3D,
  type Placement,
  type Vec3,
} from './layout'
import { ROLE_FIELD, ROLE_MODEL, resolveRole, type Role } from './roles'

/**
 * Os tanques da planta, montados a partir do cadastro: cada zona é um tanque
 * (`tanque-01`, `tanque-02`...). É a mesma conta para a cena 3D, para os
 * painéis e para a tela de Dispositivos, então eles nunca discordam sobre o
 * que está em cada tanque.
 *
 * Nada aqui depende do three.js: é só o cadastro virando posições e vínculos.
 */

export interface Binding {
  device: string
  field: string
}

/** Com `full`, corre pela leitura (vazão sobre a cheia); sem ele, pelo estado ligado. */
export interface FlowBinding extends Binding {
  full?: number
}

/** O que mexe no ambiente de um tanque: as mesmas chaves do `TANK` do dashboard. */
export interface TankBindings {
  temperature: Binding | null
  ph: Binding | null
  level: Binding | null
  turbidity: Binding | null
  oxygen: Binding | null
  light: Binding | null
  vibration: Binding | null
  flow: FlowBinding | null
  recirculation: Binding | null
  aerator: Binding | null
  refill: Binding | null
}

export interface TankMember {
  device: Device
  role: Role
  placement: Placement
  /** O dono do papel no tanque (o que segue o molde e mexe no ambiente). */
  primary: boolean
}

export interface ResolvedPipe {
  id: string
  /** `<id do dispositivo>.<bocal>`, `tank.<bocal>` ou `filter.<bocal>`. */
  from: string
  to: string
  via: Vec3[]
  radius: number
  medium: 'water' | 'air'
  flow: FlowBinding | null
}

/** O retângulo que o tanque e os equipamentos dele ocupam no chão, em metros. */
export interface Footprint {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface TankSpec {
  /** A zona do cadastro, que é o id do tanque. */
  id: string
  label: string
  members: TankMember[]
  bindings: TankBindings
  pipes: ResolvedPipe[]
  /** O filtro só existe onde há bomba de recirculação para empurrar água nele. */
  hasFilter: boolean
  footprint: Footprint
  /** Muda só quando entra, sai ou muda de lugar algum item: aí o tanque é refeito. */
  signature: string
}

const byId = (a: Device, b: Device) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true })

/** "tanque-01" → "Tanque 01"; "viveiro-norte" → "Viveiro norte". */
export function tankLabel(zone: string): string {
  const words = zone.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Os dispositivos de cada zona, com as zonas em ordem natural (tanque-2 antes de tanque-10). */
export function groupByZone(devices: Device[]): Array<{ zone: string; devices: Device[] }> {
  const zones = new Map<string, Device[]>()
  for (const device of devices) {
    const list = zones.get(device.zone) ?? []
    list.push(device)
    zones.set(device.zone, list)
  }
  return [...zones.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map(([zone, list]) => ({ zone, devices: [...list].sort(byId) }))
}

export function planTanks(devices: Device[]): TankSpec[] {
  return groupByZone(devices).map(({ zone, devices: list }) => planTank(zone, list))
}

function planTank(zone: string, devices: Device[]): TankSpec {
  const roles = new Map(devices.map((device) => [device.id, SCENE_LAYOUT[device.id]?.role ?? resolveRole(device)]))

  // O dono de cada papel: primeiro quem tem lugar marcado pelo id, depois o
  // primeiro na ordem dos ids. Assim um `nivel-00` novo não cai em cima do
  // `nivel-01` que já está no layout.
  const owners = new Map<Role, Device>()
  for (const device of devices) {
    const role = roles.get(device.id)!
    if (SCENE_LAYOUT[device.id] && !owners.has(role)) owners.set(role, device)
  }
  for (const device of devices) {
    const role = roles.get(device.id)!
    if (!owners.has(role) && ROLE_LAYOUT[role]) owners.set(role, device)
  }

  const used = { rim: 0, floor: 0 }
  const members: TankMember[] = devices.map((device) => {
    const role = roles.get(device.id)!
    const primary = owners.get(role) === device
    const placement =
      SCENE_LAYOUT[device.id] ?? (primary ? ROLE_LAYOUT[role] : undefined) ?? autoPlacement(ROLE_MODEL[role], used)
    return { device, role, placement, primary }
  })

  const bindings = bindingsOf(owners)
  const hasFilter = owners.has('recirculation')
  const pipes = resolvePipes(owners, bindings, hasFilter)

  return {
    id: zone,
    label: tankLabel(zone),
    members,
    bindings,
    pipes,
    hasFilter,
    footprint: footprintOf(members, hasFilter),
    signature: [
      zone,
      ...members.map((m) => `${m.device.id}:${m.role}:${m.placement.model}:${m.placement.position.join(',')}`),
    ].join('|'),
  }
}

/** Sonda nova vai para a borda da frente, virada para dentro; o resto, para a fila no chão. */
function autoPlacement(model: Placement['model'], used: { rim: number; floor: number }): Placement {
  const onRim = model === 'probe' || model === 'level-sensor'
  const slot = onRim ? AUTO_SLOTS.rim : AUTO_SLOTS.floor
  const index = onRim ? used.rim++ : used.floor++
  const column = index % slot.perRow
  const row = Math.floor(index / slot.perRow)
  const position = slot.start.map((v, axis) => v + slot.step[axis] * column + slot.rowStep[axis] * row) as Vec3
  return { model, position, rotationY: onRim ? 180 : 0 }
}

function fieldOf(device: Device | undefined, preferred: string | undefined): Binding | null {
  if (!device) return null
  const field = device.fields.find((f) => f.key === preferred) ?? device.fields[0]
  return field ? { device: device.id, field: field.key } : null
}

function stateOf(device: Device | undefined): Binding | null {
  return device?.state_field ? { device: device.id, field: device.state_field } : null
}

function bindingsOf(owners: Map<Role, Device>): TankBindings {
  const pump = owners.get('recirculation')
  const pumpField = (key: string) => (pump?.fields.some((f) => f.key === key) ? { device: pump.id, field: key } : null)
  const flow = pumpField('flow_l_min')
  return {
    temperature: fieldOf(owners.get('temperature'), ROLE_FIELD.temperature),
    ph: fieldOf(owners.get('ph'), ROLE_FIELD.ph),
    level: fieldOf(owners.get('level'), ROLE_FIELD.level),
    turbidity: fieldOf(owners.get('turbidity'), ROLE_FIELD.turbidity),
    oxygen: fieldOf(owners.get('oxygen'), ROLE_FIELD.oxygen),
    light: fieldOf(owners.get('light'), ROLE_FIELD.light),
    vibration: pumpField('vibration_mm_s'),
    flow: flow ? { ...flow, full: FLOW_FULL_L_MIN } : null,
    recirculation: stateOf(pump),
    aerator: stateOf(owners.get('aerator')),
    refill: stateOf(owners.get('refill')),
  }
}

function resolvePipes(owners: Map<Role, Device>, bindings: TankBindings, hasFilter: boolean): ResolvedPipe[] {
  const port = (end: string): string | null => {
    const [owner, nozzle] = end.split('.')
    if (owner === 'tank') return end
    if (owner === 'filter') return hasFilter ? end : null
    const device = owners.get(owner as Role)
    return device ? `${device.id}.${nozzle}` : null
  }
  const pipes: ResolvedPipe[] = []
  for (const pipe of PIPE_TEMPLATE) {
    const from = port(pipe.from)
    const to = port(pipe.to)
    if (!from || !to) continue
    pipes.push({ ...pipe, from, to, flow: bindings[pipe.flow] })
  }
  return pipes
}

function footprintOf(members: TankMember[], hasFilter: boolean): Footprint {
  const box: Footprint = {
    minX: -TANK_3D.width / 2,
    maxX: TANK_3D.width / 2,
    minZ: -TANK_3D.depth / 2,
    maxZ: TANK_3D.depth / 2,
  }
  const grow = ([x, , z]: Vec3, r: number) => {
    box.minX = Math.min(box.minX, x - r)
    box.maxX = Math.max(box.maxX, x + r)
    box.minZ = Math.min(box.minZ, z - r)
    box.maxZ = Math.max(box.maxZ, z + r)
  }
  for (const member of members) grow(member.placement.position, member.placement.model === 'pump' ? 0.8 : 0.5)
  if (hasFilter) grow(FIXTURES.filter.position, 0.4)
  const margin = 0.4
  return { minX: box.minX - margin, maxX: box.maxX + margin, minZ: box.minZ - margin, maxZ: box.maxZ + margin }
}

/**
 * Em desenvolvimento: o `TANK` do dashboard e o tanque-01 montado pelo
 * cadastro têm que apontar para os mesmos dispositivos.
 */
export function checkDashboardBindings(specs: TankSpec[]): void {
  const spec = specs.find((s) => s.id === TANK.id)
  if (!spec) return
  for (const key of ['level', 'aerator', 'recirculation', 'refill', 'flow', 'vibration', 'turbidity', 'light', 'oxygen'] as const) {
    const a = TANK[key]
    const b = spec.bindings[key]
    if (!b || a.device !== b.device || a.field !== b.field) {
      console.warn(`[tanks] O TANK.${key} do dashboard não bate com o tanque montado pelo cadastro.`, a, b)
    }
  }
}
