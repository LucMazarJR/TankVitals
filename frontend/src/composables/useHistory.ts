import { onUnmounted, ref, watch, type Ref } from 'vue'
import { getHistory, getStats } from '../api/client'
import type { HistoryRange, HistorySeries, Stats } from '../types'

/**
 * Histórico e estatísticas do período, com recarga automática.
 *
 * Busca as **quatro** grandezas de uma vez (e não só a selecionada): o gráfico
 * grande usa uma, mas o painel de análise precisa das quatro, e uma requisição
 * serve os dois.
 *
 * A recarga é por período, não fixa: em `1h` a janela é de 10 s, então faz
 * sentido atualizar rápido; em `7d` a janela é de 1 h e recarregar de minuto em
 * minuto só gastaria consulta no InfluxDB sem mudar o desenho.
 */

const RECARGA_MS: Record<HistoryRange, number> = {
  '1h': 15000,
  '6h': 30000,
  '24h': 60000,
  '7d': 300000,
}

export function useHistory(tankId: Ref<string>, range: Ref<HistoryRange>) {
  const history = ref<HistorySeries | null>(null)
  const stats = ref<Stats | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const atualizadoEm = ref<Date | null>(null)

  let requestId = 0
  let timer: number | null = null

  const pararTimer = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  // `silencioso` evita piscar o estado de carregando na recarga automática: o
  // gráfico continua na tela e é trocado quando o dado novo chega.
  const load = async (silencioso = false) => {
    const currentRequest = ++requestId
    if (!silencioso) loading.value = true
    error.value = null

    try {
      const [historyData, statsData] = await Promise.all([
        getHistory(tankId.value, range.value),
        getStats(tankId.value, range.value),
      ])

      if (currentRequest !== requestId) return
      history.value = historyData
      stats.value = statsData
      atualizadoEm.value = new Date()
    } catch (err) {
      if (currentRequest !== requestId) return
      const msg = err instanceof Error ? err.message : 'Não foi possível carregar o histórico.'
      if (silencioso) {
        // Falha de recarga não apaga o que já está desenhado; só registra.
        error.value = msg
      } else {
        history.value = null
        stats.value = null
        error.value = msg
      }
    } finally {
      if (currentRequest === requestId && !silencioso) loading.value = false
    }
  }

  const reagendar = () => {
    pararTimer()
    timer = window.setInterval(() => void load(true), RECARGA_MS[range.value])
  }

  watch(
    [tankId, range],
    () => {
      void load()
      reagendar()
    },
    { immediate: true },
  )

  onUnmounted(pararTimer)

  return {
    history,
    stats,
    loading,
    error,
    atualizadoEm,
    reload: () => load(),
  }
}
