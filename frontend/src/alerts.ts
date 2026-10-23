import type { AlertLevel, MetricThreshold } from './types'

export const LEVEL_TEXT: Record<AlertLevel, string> = {
  ok: 'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
}

/** Texto da faixa ideal mostrado no card, a partir dos limites da API. */
export function safeRangeLabel(threshold: MetricThreshold | null | undefined, unit: string): string {
  if (!threshold) return 'sem faixa definida'

  const { ok_min, ok_max } = threshold
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  // Faixa só com teto (como a turbidez): um mínimo nulo ou 0 não informa nada.
  if (ok_max !== null && ok_min !== null && ok_min > 0) return `ideal: ${n(ok_min)}–${n(ok_max)} ${unit}`
  if (ok_max !== null) return `ideal: < ${n(ok_max)} ${unit}`
  if (ok_min !== null) return `ideal: ≥ ${n(ok_min)} ${unit}`

  return 'faixa segura não disponível'
}

/**
 * Classifica um valor pela faixa do cadastro (`DeviceField.range`). É a mesma
 * regra para qualquer variável: fora da crítica é crítico, fora da normal é
 * atenção. Sem faixa, tudo é normal.
 */
export function classify(value: number, range: MetricThreshold | null | undefined): AlertLevel {
  if (!range) return 'ok'
  const { ok_min, ok_max, crit_min, crit_max } = range
  if ((crit_min !== null && value < crit_min) || (crit_max !== null && value > crit_max)) return 'critico'
  if ((ok_min !== null && value < ok_min) || (ok_max !== null && value > ok_max)) return 'atencao'
  return 'ok'
}

const LEVEL_WEIGHT: Record<AlertLevel, number> = { ok: 0, atencao: 1, critico: 2 }

/** O pior nível de uma lista: um crítico qualquer manda na situação geral. */
export function worstLevel(levels: Iterable<AlertLevel>): AlertLevel {
  let worst: AlertLevel = 'ok'
  for (const level of levels) if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[worst]) worst = level
  return worst
}

/**
 * Semáforo da saúde prevista pela IA (IA-07, IA-09): vermelho com saúde abaixo
 * de 40 ou vida útil abaixo de 24 h (os limites do alerta da IA-08), amarelo
 * abaixo de 70. É o "alerta da IA" que entra na cor do 3D.
 */
export function healthLevel(health: number, rulHours: number | null): AlertLevel {
  if (health < 40 || (rulHours !== null && rulHours < 24)) return 'critico'
  if (health < 70) return 'atencao'
  return 'ok'
}

/**
 * Régua da faixa: a trilha vai um pouco além dos limites críticos, a banda
 * verde é a faixa ideal e o traço é a leitura atual, em % da largura. Em % a
 * régua vai sempre de 0 a 100. Sem os dois limites não há como montar a
 * escala, e a régua some (`null`).
 */
export function rangeScale(
  threshold: MetricThreshold | null | undefined,
  value: number | null | undefined,
  unit: string,
): { left: string; width: string; at: string } | null {
  if (!threshold || value === undefined || value === null || Number.isNaN(value)) return null

  let min: number
  let max: number
  const lo = threshold.crit_min ?? threshold.ok_min
  const hi = threshold.crit_max ?? threshold.ok_max
  if (unit === '%') {
    min = 0
    max = 100
  } else if (lo !== null && hi !== null && hi > lo) {
    const pad = (hi - lo) * 0.25
    // Grandeza física que não fica negativa (turbidez) não ganha trilha abaixo de 0.
    min = lo >= 0 ? Math.max(0, lo - pad) : lo - pad
    max = hi + pad
  } else {
    return null
  }

  const pos = (x: number) => ((Math.min(max, Math.max(min, x)) - min) / (max - min)) * 100
  const from = pos(threshold.ok_min ?? min)
  const to = pos(threshold.ok_max ?? max)
  return { left: `${from}%`, width: `${to - from}%`, at: `${pos(value)}%` }
}
