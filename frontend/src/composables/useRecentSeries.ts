import { useLiveStore } from '../stores/live'

/**
 * As leituras que chegaram ao vivo para um dispositivo (as últimas 120
 * mensagens do store), prontas para um mini gráfico. Estado ligado/desligado
 * vira 1 e 0. É só o que veio pelo WebSocket, como o resto da cena.
 */
export function useRecentSeries() {
  const live = useLiveStore()

  function recentSeries(deviceId: string, key: string, isState = false): number[] {
    const out: number[] = []
    for (const msg of live.recent[deviceId] ?? []) {
      const raw = msg.payload[key]
      if (isState && typeof raw === 'boolean') out.push(raw ? 1 : 0)
      else if (typeof raw === 'number') out.push(raw)
    }
    return out
  }

  return { recentSeries }
}
