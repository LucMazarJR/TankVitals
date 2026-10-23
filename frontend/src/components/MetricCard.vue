<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { MetricThreshold, MetricValue } from '../types'
import { LEVEL_TEXT, rangeScale, safeRangeLabel } from '../alerts'
import { LEVEL_ICON, UI_ICON } from '../icons'

const props = defineProps<{
  icon: Component
  label: string
  metric: MetricValue | undefined
  threshold?: MetricThreshold | null
  /** Casas decimais do cadastro; sem ela, 2 para pH e 1 para o resto. */
  decimals?: number
  /** Unidade do cadastro, para a faixa aparecer certa mesmo sem leitura. */
  unit?: string
}>()

const valueLabel = computed(() => {
  if (!props.metric || props.metric.value === null || Number.isNaN(props.metric.value)) return '—'
  const decimals = props.decimals ?? (props.metric.unit === 'pH' ? 2 : 1)
  return props.metric.value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
})

// A unidade vem da leitura; se ela ainda nao chegou, o card mostra so o valor.
const safeRange = computed(() => safeRangeLabel(props.threshold, props.unit ?? props.metric?.unit ?? ''))

// Régua da faixa (a mesma conta dos cartões de Dispositivos e do painel do 3D).
const scale = computed(() => rangeScale(props.threshold, props.metric?.value, props.metric?.unit ?? props.unit ?? ''))
</script>

<template>
  <article :class="['metric-card', `level-${metric?.level ?? 'ok'}`]">
    <div class="metric-head">
      <span class="metric-icon"><component :is="icon" :size="19" aria-hidden="true" /></span>
      <span class="metric-label">{{ label }}</span>
      <span v-if="metric && threshold" :class="['level-badge', `badge-${metric.level}`]">
        <component :is="LEVEL_ICON[metric.level]" :size="13" aria-hidden="true" />
        {{ LEVEL_TEXT[metric.level] }}
      </span>
      <span v-else-if="!metric" class="level-badge badge-vazio">
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
