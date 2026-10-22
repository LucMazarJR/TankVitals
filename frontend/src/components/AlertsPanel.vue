<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { Alert } from '../domain/devices'
import { LEVEL_TEXT } from '../alerts'
import { LEVEL_ICON } from '../icons'
import { useNow } from '../composables/useNow'

/**
 * Alertas de `GET /api/alerts`: os abertos primeiro, depois os fechados mais
 * recentes. O nome e o ícone de cada variável vêm do cadastro, por quem chama.
 */
const props = defineProps<{
  alerts: Alert[]
  describe: (alert: Alert) => { label: string; unit: string; decimals: number; icon: Component }
}>()

const now = useNow()

const MAX_CLOSED = 20

const items = computed(() => {
  const open = props.alerts.filter((a) => a.closed_at === null)
  const closed = props.alerts.filter((a) => a.closed_at !== null).slice(0, MAX_CLOSED)
  return [...open, ...closed].map((alert) => ({ alert, info: props.describe(alert), open: alert.closed_at === null }))
})

function since(iso: string): string {
  const seconds = Math.max(0, Math.round((now.value - Date.parse(iso)) / 1000))
  if (seconds < 60) return `há ${seconds} s`
  if (seconds < 3600) return `há ${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `há ${Math.round(seconds / 3600)} h`
  return `há ${Math.round(seconds / 86400)} d`
}

function formatValue(value: number | null, decimals: number, unit: string): string {
  if (value === null) return ''
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${unit}`
}
</script>

<template>
  <section class="alerts-panel">
    <div v-if="items.length === 0" class="alerts-empty">
      <span class="check-icon"><component :is="LEVEL_ICON.ok" :size="20" aria-hidden="true" /></span>
      <div>
        <strong>Nenhum alerta</strong>
        <span>Todas as leituras ficaram dentro da faixa.</span>
      </div>
    </div>

    <div v-else class="alert-list">
      <div v-for="{ alert, info, open } in items" :key="alert.id" :class="['alert-row', { 'is-closed': !open }]">
        <div :class="['alert-symbol', `badge-${alert.level}`]">
          <component :is="LEVEL_ICON[alert.level]" :size="17" aria-hidden="true" />
        </div>
        <div class="alert-info">
          <strong>
            <component :is="info.icon" :size="14" aria-hidden="true" />
            {{ info.label }}
          </strong>
          <span>
            {{ open ? `aberto ${since(alert.opened_at)}` : `fechado ${since(alert.closed_at as string)}` }}
          </span>
        </div>
        <div class="alert-value">{{ formatValue(alert.value, info.decimals, info.unit) }}</div>
        <span v-if="open" :class="['table-level', `badge-${alert.level}`]">{{ LEVEL_TEXT[alert.level] }}</span>
        <span v-else class="table-level badge-vazio">Fechado</span>
      </div>
    </div>
  </section>
</template>
