<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '../composables/useNow'
import { STALE_AFTER_MS } from '../live/freshness'
import type { LiveStatus } from '../live/socket'

const props = defineProps<{
  tankId: string
  /** De onde vêm as leituras: "Simulador" ou "Modo simulado". */
  source: string
  /** Instante (ms) da última mensagem ao vivo, ou `null` se nada chegou. */
  lastMessageAt: number | null
  liveStatus: LiveStatus
}>()

const now = useNow()

const ageSeconds = computed(() =>
  props.lastMessageAt === null ? null : Math.max(0, Math.round((now.value - props.lastMessageAt) / 1000)),
)

const online = computed(() => props.lastMessageAt !== null && now.value - props.lastMessageAt <= STALE_AFTER_MS)

const ageLabel = computed(() => {
  if (ageSeconds.value === null) return 'aguardando'
  if (ageSeconds.value < 1) return 'agora'
  if (ageSeconds.value < 120) return `há ${ageSeconds.value} s`
  return `há ${Math.round(ageSeconds.value / 60)} min`
})

const statusText = computed(() => (online.value ? 'Recebendo' : 'Sem dados'))

// Mapeia o estado da conexão nas três aparências do selo.
const connection = computed(() => {
  if (props.liveStatus === 'live' || props.liveStatus === 'simulated') return 'websocket'
  if (props.liveStatus === 'connecting' || props.liveStatus === 'reconnecting') return 'polling'
  return 'disconnected'
})

const connectionText = computed(() => {
  if (props.liveStatus === 'live') return 'Tempo real'
  if (props.liveStatus === 'simulated') return 'Simulado'
  if (props.liveStatus === 'connecting') return 'Conectando'
  if (props.liveStatus === 'reconnecting') return 'Reconectando'
  return 'Desconectado'
})
</script>

<template>
  <section class="status-bar">
    <!-- A marca TankVitals fica no menu lateral; aqui só o título da tela. -->
    <div class="status-title">
      <h1>Monitoramento do tanque</h1>
    </div>

    <div class="status-items">
      <div class="status-item">
        <span class="label">Tanque</span>
        <strong>{{ tankId }}</strong>
      </div>

      <div class="status-item">
        <span class="label">Fonte</span>
        <strong>{{ source }}</strong>
      </div>

      <div class="status-item">
        <span class="label">Leituras</span>
        <strong :class="['status-pill', online ? 'is-online' : 'is-offline']">
          <span class="dot" /> {{ statusText }}
        </strong>
      </div>

      <div class="status-item">
        <span class="label">Última leitura</span>
        <strong>{{ ageLabel }}</strong>
      </div>

      <div class="live-badge" :class="`mode-${connection}`">
        <span class="live-dot" />
        {{ connectionText }}
      </div>
    </div>
  </section>
</template>
