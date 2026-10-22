<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { LIVE_STATUS_LABEL } from '../live/socket'
import { useLiveStore } from '../stores/live'

/**
 * Tabela simples com a última leitura de cada dispositivo no store ao vivo.
 * Serve para quem está construindo uma tela ver o que já chega, e com quais
 * nomes de campo, antes de desenhar qualquer coisa.
 */
const live = useLiveStore()
const now = ref(Date.now())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => window.clearInterval(timer))

const rows = computed(() =>
  Object.values(live.latest)
    .sort((a, b) => a.device.localeCompare(b.device))
    .map((msg) => ({
      device: msg.device,
      values: Object.entries(msg.payload)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join(' · '),
      age: Math.max(0, Math.round((now.value - Date.parse(msg.ts)) / 1000)),
    })),
)

function formatValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  return String(value)
}
</script>

<template>
  <p v-if="!rows.length" class="small-note">
    Nada chegou ainda. Conexão: {{ LIVE_STATUS_LABEL[live.status].toLowerCase() }}.
  </p>

  <div v-else class="table-scroll">
    <table class="history-table">
      <thead>
        <tr>
          <th>Dispositivo</th>
          <th>Última leitura</th>
          <th>Há</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.device">
          <td><code>{{ row.device }}</code></td>
          <td>{{ row.values }}</td>
          <td>{{ row.age }} s</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
