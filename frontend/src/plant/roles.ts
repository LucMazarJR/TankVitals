import type { Device } from '../domain/devices'
import type { ModelKind } from './layout'

/**
 * O papel de cada dispositivo dentro do tanque: é por ele que a cena sabe onde
 * pôr o item, que modelo desenhar e o que ele mexe no ambiente (a sonda de
 * nível sobe a água, a de turbidez turva, a bomba faz correr os tubos...).
 *
 * O papel sai do próprio id do cadastro, pela convenção da PLAT-01
 * (`od-01`, `bomba-rec-01`, `aerador-02`...): um tanque novo com os mesmos
 * tipos de dispositivo entra na cena sem mudar código. Sem prefixo conhecido,
 * vale a chave da variável; sem ela, o item entra como sonda ou genérico.
 */
export type Role =
  | 'temperature'
  | 'ph'
  | 'level'
  | 'turbidity'
  | 'oxygen'
  | 'light'
  | 'recirculation'
  | 'aerator'
  | 'refill'
  | 'probe'
  | 'generic'

/** Do mais longo para o mais curto: `bomba-repo` antes de `bomba-rec`, `od` por último. */
const BY_PREFIX: Array<[string, Role]> = [
  ['bomba-repo', 'refill'],
  ['bomba-rec', 'recirculation'],
  ['temp-agua', 'temperature'],
  ['turbidez', 'turbidity'],
  ['aerador', 'aerator'],
  ['nivel', 'level'],
  ['luz', 'light'],
  ['ph', 'ph'],
  ['od', 'oxygen'],
]

/** A variável que cada papel de sensor lê. */
export const ROLE_FIELD: Partial<Record<Role, string>> = {
  temperature: 'temperature_c',
  ph: 'ph',
  level: 'level_pct',
  turbidity: 'turbidity_ntu',
  oxygen: 'oxygen_mg_l',
  light: 'light_lux',
}

const BY_FIELD = new Map(Object.entries(ROLE_FIELD).map(([role, key]) => [key, role as Role]))

/** Que modelo desenhar para cada papel. */
export const ROLE_MODEL: Record<Role, ModelKind> = {
  temperature: 'probe',
  ph: 'probe',
  turbidity: 'probe',
  oxygen: 'probe',
  probe: 'probe',
  level: 'level-sensor',
  light: 'light-sensor',
  recirculation: 'pump',
  aerator: 'aerator',
  refill: 'refill',
  generic: 'generic',
}

export function resolveRole(device: Device): Role {
  // "od" não pode pegar "odometro-01": o prefixo tem que fechar num hífen.
  for (const [prefix, role] of BY_PREFIX) {
    if (device.id === prefix || device.id.startsWith(`${prefix}-`)) return role
  }
  for (const field of device.fields) {
    const role = BY_FIELD.get(field.key)
    if (role) return role
  }
  // Vibração e vazão só fazem de algo a bomba se for um equipamento; a
  // temperatura do motor nunca vira a temperatura da água.
  if (device.kind === 'equipment' && device.fields.some((f) => f.key === 'vibration_mm_s' || f.key === 'flow_l_min')) {
    return 'recirculation'
  }
  return device.kind === 'sensor' ? 'probe' : 'generic'
}
