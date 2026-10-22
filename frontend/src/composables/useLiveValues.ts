import type { Envelope } from '../live/envelope'
import { isFresh } from '../live/freshness'
import { useLiveStore } from '../stores/live'
import { useNow } from './useNow'

/**
 * O "agora" de cada dispositivo, lido do store ao vivo. Mensagem velha conta
 * como sem dados (`null`), para a tela nunca mostrar valor parado como atual.
 */
export function useLiveValues() {
  const live = useLiveStore()
  const now = useNow()

  function envelope(deviceId: string): Envelope | null {
    const msg = live.latest[deviceId]
    return msg && isFresh(msg.ts, now.value) ? msg : null
  }

  function value(deviceId: string, field: string): number | null {
    const raw = envelope(deviceId)?.payload[field]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  }

  function state(deviceId: string, field: string): boolean | null {
    const raw = envelope(deviceId)?.payload[field]
    return typeof raw === 'boolean' ? raw : null
  }

  return { envelope, value, state }
}
