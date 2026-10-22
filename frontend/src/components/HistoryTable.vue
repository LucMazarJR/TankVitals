<script setup lang="ts">
import { computed } from 'vue'
import type { HistoryPoint, MetricThreshold } from '../types'
import { classify, LEVEL_TEXT } from '../alerts'

// As leituras cruas mais recentes de uma variável (do store ao vivo), da mais
// nova para a mais velha.
const props = defineProps<{
  readings: HistoryPoint[]
  label: string
  unit: string
  decimals: number
  threshold?: MetricThreshold | null
}>()

const rows = computed(() =>
  props.readings.slice(0, 50).map((point) => ({
    key: point.t,
    time: new Date(point.t),
    value: point.v,
    level: classify(point.v, props.threshold),
  })),
)

function formatDate(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatValue(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
  })
}
</script>

<template>
  <div class="table-scroll">
    <table class="history-table">
      <thead>
        <tr>
          <th>Data e hora</th>
          <th>{{ label }}</th>
          <th>Unidade</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <td>{{ formatDate(row.time) }}</td>
          <td class="value-cell">{{ formatValue(row.value) }}</td>
          <td>{{ unit }}</td>
          <td>
            <span :class="['table-level', `badge-${row.level}`]">{{ LEVEL_TEXT[row.level] }}</span>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="4" class="table-empty">Nenhuma leitura chegou ainda.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
