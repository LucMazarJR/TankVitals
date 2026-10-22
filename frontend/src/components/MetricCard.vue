<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { MetricThreshold, MetricValue } from '../types'
import { LEVEL_TEXT, safeRangeLabel } from '../alerts'
import { LEVEL_ICON, UI_ICON } from '../icons'

const props = defineProps<{
  icon: Component
  label: string
  metric: MetricValue | undefined
  threshold?: MetricThreshold
}>()

const valueLabel = computed(() => {
  if (!props.metric || props.metric.value === null || Number.isNaN(props.metric.value)) return '—'
  const decimals = props.metric.unit === 'pH' ? 2 : 1
  return props.metric.value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
})

// A unidade vem da leitura; se ela ainda nao chegou, o card mostra so o valor.
const safeRange = computed(() => safeRangeLabel(props.threshold, props.metric?.unit ?? ''))

/**
 * Régua da faixa: a trilha vai um pouco além dos limites críticos, a banda
 * verde é a faixa ideal e o traço é a leitura atual. Em % a régua vai sempre
 * de 0 a 100. Sem os dois limites não há como montar a escala, e a régua some.
 */
const scale = computed(() => {
  const t = props.threshold
  const value = props.metric?.value
  if (!t || value === undefined || value === null || Number.isNaN(value)) return null

  let min: number
  let max: number
  const lo = t.crit_min ?? t.ok_min
  const hi = t.crit_max ?? t.ok_max
  if (props.metric?.unit === '%') {
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
  const from = pos(t.ok_min ?? min)
  const to = pos(t.ok_max ?? max)
  return { left: `${from}%`, width: `${to - from}%`, at: `${pos(value)}%` }
})
</script>

<template>
  <article :class="['metric-card', `level-${metric?.level ?? 'ok'}`]">
    <div class="metric-head">
      <span class="metric-icon"><component :is="icon" :size="19" aria-hidden="true" /></span>
      <span class="metric-label">{{ label }}</span>
      <span v-if="metric" :class="['level-badge', `badge-${metric.level}`]">
        <component :is="LEVEL_ICON[metric.level]" :size="13" aria-hidden="true" />
        {{ LEVEL_TEXT[metric.level] }}
      </span>
      <span v-else class="level-badge badge-vazio">
        <component :is="UI_ICON.semDado" :size="13" aria-hidden="true" />
        Sem dado
      </span>
    </div>

    <div class="metric-value">
      {{ valueLabel }}
      <span v-if="metric" class="metric-unit">{{ metric.unit }}</span>
    </div>

    <div v-if="scale" class="metric-scale" aria-hidden="true">
      <span class="metric-scale-ideal" :style="{ left: scale.left, width: scale.width }" />
      <span class="metric-scale-mark" :style="{ left: scale.at }" />
    </div>

    <div class="metric-footer">{{ safeRange }}</div>
  </article>
</template>
