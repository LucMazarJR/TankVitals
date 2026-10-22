<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Line } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import type { HistorySeries, MetricKey, MetricThreshold } from '../types'
import { METRIC_META } from '../types'
import { UI_ICON } from '../icons'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
)

const props = defineProps<{
  history: HistorySeries | null
  metric: MetricKey
  threshold?: MetricThreshold
  range: string
}>()

// Lidos do CSS para não duplicar hex entre folha de estilo e componente.
const css = getComputedStyle(document.documentElement)
const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
const SERIE = token('--serie-1', '#1f6890')
const LIMITE = token('--ideal-line', '#3a8a5c')
const FAIXA = token('--ideal-wash', '#d9efe1')
const GRADE = token('--line-soft', '#ddd6c7')
const TEXTO = token('--muted', '#4a5f70')
const NOITE = token('--night', '#0f3550')
const FONTE = token('--font', 'sans-serif')

const meta = computed(() => METRIC_META[props.metric])

const currentSeries = computed(() =>
  props.history?.series.find((item) => item.metric === props.metric),
)

const labels = computed(() => currentSeries.value?.points.map((point) => new Date(point.t)) ?? [])

// Linhas tracejadas da faixa segura, com os limites vindos da API.
const safeMin = computed(() => props.threshold?.ok_min ?? undefined)
const safeMax = computed(() => props.threshold?.ok_max ?? undefined)

const chartData = computed<ChartData<'line', number[], Date>>(() => {
  const points = currentSeries.value?.points ?? []
  const datasets: ChartData<'line', number[], Date>['datasets'] = [
    {
      label: meta.value.label,
      data: points.map((point) => point.v),
      // Linha grossa e sem área embaixo: no projetor, área clara some e
      // linha fina falha.
      borderWidth: 2.8,
      borderColor: SERIE,
      backgroundColor: SERIE,
      pointRadius: points.length > 120 ? 0 : 2,
      pointHoverRadius: 5,
      tension: 0.25,
      fill: false,
    },
  ]

  if (safeMin.value !== undefined) {
    datasets.push({
      label: 'Limite mínimo',
      data: points.map(() => safeMin.value as number),
      borderWidth: 2,
      borderDash: [7, 6],
      borderColor: LIMITE,
      pointRadius: 0,
      fill: false,
    })
  }

  if (safeMax.value !== undefined) {
    // Com os dois limites, o espaço entre eles fica sombreado: é a faixa ideal.
    const temMinimo = safeMin.value !== undefined
    datasets.push({
      label: 'Limite máximo',
      data: points.map(() => safeMax.value as number),
      borderWidth: 2,
      borderDash: [7, 6],
      borderColor: LIMITE,
      backgroundColor: FAIXA,
      pointRadius: 0,
      fill: temMinimo ? '-1' : false,
    })
  }

  return {
    labels: labels.value,
    datasets,
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 250,
  },
  interaction: {
    intersect: false,
    mode: 'index',
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: NOITE,
      cornerRadius: 8,
      padding: 10,
      titleFont: { family: FONTE, weight: 800 },
      bodyFont: { family: FONTE, weight: 600 },
      callbacks: {
        label: (context) => {
          const value = context.parsed.y
          if (value === null) return ''
          return `${context.dataset.label}: ${value.toLocaleString('pt-BR')} ${meta.value.unit}`
        },
      },
    },
  },
  scales: {
    x: {
      type: 'time',
      time: {
        unit: props.range === '7d' ? 'day' : props.range === '24h' ? 'hour' : 'minute',
        displayFormats: {
          minute: 'HH:mm',
          hour: props.range === '7d' ? 'dd/MM' : 'HH:mm',
          day: 'dd/MM',
        },
      },
      grid: {
        display: false,
      },
      ticks: {
        maxTicksLimit: 8,
        color: TEXTO,
        font: { family: FONTE, size: 12, weight: 700 },
      },
    },
    y: {
      beginAtZero: false,
      grid: {
        color: GRADE,
      },
      ticks: {
        color: TEXTO,
        font: { family: FONTE, size: 12, weight: 700 },
        callback: (value) => `${Number(value).toLocaleString('pt-BR')} ${meta.value.unit}`,
      },
    },
  },
}))
</script>

<template>
  <div class="chart-wrap">
    <div v-if="!currentSeries || currentSeries.points.length === 0" class="chart-empty">
      <div class="empty-icon"><component :is="UI_ICON.semDado" :size="24" aria-hidden="true" /></div>
      <strong>Sem dados no período</strong>
      <span>Assim que houver leituras, elas aparecerão neste gráfico.</span>
    </div>

    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>
