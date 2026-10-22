export type AlertLevel = 'ok' | 'atencao' | 'critico'

export type HistoryRange = '1h' | '6h' | '24h' | '7d'

/** Valor atual de uma variável, já classificado pela faixa do cadastro. */
export interface MetricValue {
  value: number
  level: AlertLevel
  unit: string
}

export interface HistoryPoint {
  t: string
  v: number
}

/**
 * Faixa de uma variável, como vem no cadastro (`GET /api/devices`). `null`
 * significa "não existe esse limite": o nível da água não tem alerta por valor
 * alto, por exemplo.
 */
export interface MetricThreshold {
  ok_min: number | null
  ok_max: number | null
  crit_min: number | null
  crit_max: number | null
}
