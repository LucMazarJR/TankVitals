import { onUnmounted, ref, shallowRef } from 'vue'
import { getAlerts } from '../api/devices'
import type { Alert } from '../domain/devices'
import { useLiveStore } from '../stores/live'

/**
 * Alertas abertos e os recentes. Renova a cada 30 s e logo depois que um
 * alerta abre ou fecha (o aviso chega pelo WebSocket).
 */
const REFRESH_MS = 30_000

export function useAlerts() {
  const alerts = shallowRef<Alert[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const live = useLiveStore()
  let debounce: number | undefined

  async function load(): Promise<void> {
    try {
      alerts.value = await getAlerts('all')
      error.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Não foi possível carregar os alertas.'
    } finally {
      loading.value = false
    }
  }

  void load()
  const timer = window.setInterval(() => void load(), REFRESH_MS)
  const unsubscribe = live.subscribe((msg) => {
    if (msg.type !== 'alert') return
    // Vários alertas podem mudar no mesmo passo: busca uma vez só.
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => void load(), 300)
  })

  onUnmounted(() => {
    window.clearInterval(timer)
    window.clearTimeout(debounce)
    unsubscribe()
  })

  return { alerts, loading, error, reload: load }
}
