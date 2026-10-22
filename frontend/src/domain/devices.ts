import type { AlertLevel, HistoryPoint, HistoryRange, MetricThreshold } from '../types'

/**
 * O cadastro de dispositivos (`GET /api/devices`, BACK-05), de onde as telas
 * se montam: nenhuma tela tem lista fixa de grandezas. Um sensor cadastrado
 * pela tela Dispositivos (WEB-03) aparece no dashboard sem mudar código.
 */
export type DeviceKind = 'sensor' | 'equipment' | 'actuator'

/** Quem manda no atuador: a pessoa, pela tela, ou uma regra de negócio. */
export type DeviceControl = 'manual' | 'rule'

/** Uma variável numérica que o dispositivo publica na telemetria. */
export interface DeviceField {
  key: string
  /** Nome completo, para títulos: "Oxigênio dissolvido". */
  label: string
  /** Nome curto, para tabela e seletor: "Oxigênio". */
  short: string
  unit: string
  decimals: number
  /** Faixa normal e crítica; `null` quando a variável não tem alerta. */
  range: MetricThreshold | null
}

export interface Device {
  id: string
  name: string
  kind: DeviceKind
  zone: string
  active: boolean
  fields: DeviceField[]
  /** Campo booleano de estado: "on" num atuador, "running" numa bomba. */
  state_field: string | null
  /** Comandos aceitos em `POST /api/devices/{id}/command`. */
  commands: string[]
  control: DeviceControl | null
}

/** Uma grandeza: um campo de um dispositivo. O id é "od-01.oxygen_mg_l". */
export interface Variable {
  id: string
  device: Device
  field: DeviceField
}

export function variableId(deviceId: string, fieldKey: string): string {
  return `${deviceId}.${fieldKey}`
}

export function variablesOf(devices: Device[]): Variable[] {
  return devices.flatMap((device) =>
    device.fields.map((field) => ({ id: variableId(device.id, field.key), device, field })),
  )
}

/** Dispositivos com estado de liga/desliga: atuadores e equipamentos. */
export function controllables(devices: Device[]): Device[] {
  return devices.filter((device) => device.state_field !== null)
}

// --- Histórico (`GET /api/history`) ----------------------------------------

export interface SeriesStats {
  /** Leituras cruas no período (não os pontos agregados do gráfico). */
  count: number
  min?: number
  max?: number
  avg?: number
  last?: number
  /** Segundos fora da faixa normal no período, nas variáveis com faixa. */
  out_of_range_s?: number
  /** Nos campos de estado: segundos ligado e quantas vezes ligou. */
  on_s?: number
  turn_ons?: number
}

export interface Series {
  device: string
  field: string
  points: HistoryPoint[]
  stats: SeriesStats
}

export interface HistoryResponse {
  range: HistoryRange
  from: string
  to: string
  /** Largura de cada ponto agregado, em segundos. */
  step_s: number
  series: Series[]
}

// --- Alertas (`GET /api/alerts`) -------------------------------------------

export interface Alert {
  id: string
  device: string
  field: string | null
  level: Exclude<AlertLevel, 'ok'>
  message: string
  value: number | null
  opened_at: string
  /** `null` enquanto o alerta está aberto. */
  closed_at: string | null
}

// --- Comandos (`POST /api/devices/{id}/command`) ----------------------------

export interface CommandRequest {
  command: string
  value?: boolean | string
}

/** A API só confirma que mandou; quem confirma o novo estado é a telemetria. */
export interface CommandAck {
  id: string
  status: 'sent'
}
