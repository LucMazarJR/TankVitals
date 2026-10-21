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
</script>

<template>
  <article :class="['metric-card', `level-${metric?.level ?? 'ok'}`]">
    <div class="metric-head">
      <div class="metric-icon"><component :is="icon" :size="18" aria-hidden="true" /></div>
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

    <div class="metric-footer">
      <span>{{ safeRange }}</span>
      <span v-if="metric" class="metric-indicator" aria-hidden="true" />
    </div>
  </article>
</template>
