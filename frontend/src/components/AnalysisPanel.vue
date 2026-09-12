<script setup lang="ts">
import { computed } from 'vue'
import Sparkline from './Sparkline.vue'
import { classifyMetric, LEVEL_TEXT } from '../alerts'
import { METRIC_ICON, LEVEL_ICON } from '../icons'
import {
  METRIC_META,
  type AlertLevel,
  type HistoryRange,
  type HistorySeries,
  type LatestReading,
  type MetricKey,
  type Stats,
  type Thresholds,
} from '../types'

/**
 * Análise do período: responde "como a água se comportou", não só "como está
 * agora" — que é o trabalho dos cards.
 *
 * Tudo aqui vem de endpoint que já existia (`/api/stats` devolve as quatro
 * grandezas, `/api/readings/history` devolve as séries); o que faltava era
 * mostrar.
 */

const props = defineProps<{
  history: HistorySeries | null
  stats: Stats | null
  thresholds: Thresholds
  reading: LatestReading | null
  range: HistoryRange
}>()

const RANGE_TEXTO: Record<HistoryRange, string> = {
  '1h': 'última hora',
  '6h': 'últimas 6 horas',
  '24h': 'últimas 24 horas',
  '7d': 'últimos 7 dias',
}

const metricKeys: MetricKey[] = ['temperature_c', 'ph', 'level_pct', 'turbidity_ntu']

// Quantos pontos o sparkline desenha. Mais que isso vira ruído nesse tamanho.
const MAX_PONTOS = 60

function amostrar(valores: number[]): number[] {
  if (valores.length <= MAX_PONTOS) return valores
  const passo = valores.length / MAX_PONTOS
  return Array.from({ length: MAX_PONTOS }, (_, i) => valores[Math.floor(i * passo)])
}

interface LinhaAnalise {
  key: MetricKey
  label: string
  unit: string
  decimals: number
  atual?: number
  nivelAtual?: AlertLevel
  min?: number
  avg?: number
  max?: number
  pontos: number[]
  foraPct: number
  piorNivel: AlertLevel
  amostras: number
  okMin?: number | null
  okMax?: number | null
}

const linhas = computed<LinhaAnalise[]>(() =>
  metricKeys.map((key) => {
    const meta = METRIC_META[key]
    const serie = props.history?.series.find((s) => s.metric === key)
    const valores = serie?.points.map((p) => p.v) ?? []
    const limite = props.thresholds[key]
    const st = props.stats?.metrics[key]
    const vivo = props.reading?.metrics[key]

    const niveis = valores.map((v) => classifyMetric(key, v, limite))
    const fora = niveis.filter((n) => n !== 'ok').length
    const pior = niveis.reduce<AlertLevel>(
      (a, b) => (({ ok: 0, atencao: 1, critico: 2 })[b] > ({ ok: 0, atencao: 1, critico: 2 })[a] ? b : a),
      'ok',
    )

    return {
      key,
      label: meta.shortLabel,
      unit: meta.unit,
      decimals: meta.decimals,
      atual: vivo?.value,
      nivelAtual: vivo?.level,
      min: st?.min,
      avg: st?.avg,
      max: st?.max,
      pontos: amostrar(valores),
      foraPct: valores.length ? (fora * 100) / valores.length : 0,
      piorNivel: pior,
      amostras: valores.length,
      okMin: limite?.ok_min,
      okMax: limite?.ok_max,
    }
  }),
)

// Intervalo médio entre leituras: expõe a cadência real da coleta, que no
// Wokwi é bem diferente dos 5 s nominais porque a simulação roda mais devagar.
const RANGE_SEG: Record<HistoryRange, number> = {
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
  '7d': 604800,
}

const intervaloMedio = computed(() => {
  const n = props.stats?.count
  if (!n || n < 2) return null
  return RANGE_SEG[props.range] / n
})

const semDados = computed(() => linhas.value.every((l) => l.amostras === 0))

function fmt(valor: number | undefined, casas: number): string {
  if (valor === undefined || Number.isNaN(valor)) return '—'
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

function fmtIntervalo(seg: number): string {
  if (seg < 60) return `${seg.toFixed(0)} s`
  if (seg < 3600) return `${(seg / 60).toFixed(1)} min`
  return `${(seg / 3600).toFixed(1)} h`
}
</script>

<template>
  <section class="analise">
    <div class="analise-resumo">
      <div class="analise-resumo-item">
        <span>Leituras coletadas</span>
        <strong>{{ stats?.count?.toLocaleString('pt-BR') ?? '—' }}</strong>
        <small>nas {{ RANGE_TEXTO[range] }}</small>
      </div>
      <div class="analise-resumo-item">
        <span>Cadência média</span>
        <strong>{{ intervaloMedio ? fmtIntervalo(intervaloMedio) : '—' }}</strong>
        <small>entre leituras</small>
      </div>
      <div class="analise-resumo-item">
        <span>Grandezas fora da faixa</span>
        <strong>{{ linhas.filter((l) => l.foraPct > 0).length }} de 4</strong>
        <small>em algum momento</small>
      </div>
    </div>

    <div v-if="semDados" class="analise-vazio">
      <component :is="LEVEL_ICON.ok" :size="18" aria-hidden="true" />
      <span>Sem leituras no período selecionado.</span>
    </div>

    <table v-else class="analise-tabela">
      <thead>
        <tr>
          <th scope="col">Grandeza</th>
          <th scope="col">Agora</th>
          <th scope="col" class="num">Mín</th>
          <th scope="col" class="num">Média</th>
          <th scope="col" class="num">Máx</th>
          <th scope="col">Fora da faixa</th>
          <th scope="col">Tendência</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in linhas" :key="l.key">
          <th scope="row" class="analise-grandeza">
            <component :is="METRIC_ICON[l.key]" :size="16" aria-hidden="true" />
            <span>{{ l.label }}</span>
            <small>{{ l.unit }}</small>
          </th>

          <td>
            <span class="analise-agora">
              <component
                v-if="l.nivelAtual"
                :is="LEVEL_ICON[l.nivelAtual]"
                :size="15"
                :class="`ink-${l.nivelAtual}`"
                aria-hidden="true"
              />
              <strong>{{ fmt(l.atual, l.decimals) }}</strong>
              <small v-if="l.nivelAtual">{{ LEVEL_TEXT[l.nivelAtual] }}</small>
            </span>
          </td>

          <td class="num">{{ fmt(l.min, l.decimals) }}</td>
          <td class="num destaque">{{ fmt(l.avg, l.decimals) }}</td>
          <td class="num">{{ fmt(l.max, l.decimals) }}</td>

          <td>
            <div class="medidor" :title="`${l.foraPct.toFixed(1)}% das ${l.amostras} leituras`">
              <div class="medidor-trilha">
                <div
                  :class="['medidor-preenchido', `nivel-${l.piorNivel}`]"
                  :style="{ width: `${Math.min(100, Math.max(l.foraPct, l.foraPct > 0 ? 2 : 0))}%` }"
                />
              </div>
              <span class="medidor-valor">{{ l.foraPct.toFixed(0) }}%</span>
            </div>
          </td>

          <td class="analise-spark">
            <Sparkline :points="l.pontos" :ok-min="l.okMin" :ok-max="l.okMax" :width="200" :height="40" />
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="!semDados" class="analise-nota">
      A banda clara no gráfico é a faixa segura da grandeza. "Fora da faixa" é a
      proporção de leituras agregadas do período que saíram dela.
    </p>
  </section>
</template>
