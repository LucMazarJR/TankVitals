import { requestWsTicket } from '../api/auth'
import { ApiError, wsUrl } from '../api/http'
import { isEnvelope, type Envelope } from './envelope'

export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting' | 'simulated'

export const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  off: 'Desligado',
  connecting: 'Conectando…',
  live: 'Ao vivo',
  reconnecting: 'Reconectando…',
  simulated: 'Dados simulados',
}

interface LiveSocketHandlers {
  onEnvelope: (msg: Envelope) => void
  onStatus: (status: LiveStatus) => void
}

const MAX_RETRY_DELAY_MS = 30_000

/**
 * Abre o `/ws/live` com ticket (BACK-04) e reconecta sozinho, esperando um
 * pouco mais a cada falha (1 s, 2 s, 4 s... até 30 s).
 *
 * Devolve a função que fecha a conexão de vez.
 */
export function openLiveSocket(handlers: LiveSocketHandlers): () => void {
  let socket: WebSocket | null = null
  let retryTimer: number | null = null
  let attempt = 0
  let stopped = false

  async function connect(): Promise<void> {
    if (stopped) return
    handlers.onStatus(attempt === 0 ? 'connecting' : 'reconnecting')

    let ticket: string
    try {
      // Um ticket novo a cada tentativa: ele só vale uma vez.
      ticket = (await requestWsTicket()).ticket
    } catch (err) {
      // 401 é sessão encerrada; o store de login já leva ao login, então não adianta insistir.
      if (err instanceof ApiError && err.status === 401) stop()
      else scheduleRetry()
      return
    }
    if (stopped) return

    socket = new WebSocket(wsUrl('/ws/live', { ticket }))

    socket.onopen = () => {
      attempt = 0
      handlers.onStatus('live')
    }

    socket.onmessage = (event: MessageEvent<string>) => {
      let message: unknown
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (isEnvelope(message)) handlers.onEnvelope(message)
    }

    // Erro de conexão também dispara o `close`, então a reconexão fica só aqui.
    socket.onclose = () => {
      socket = null
      scheduleRetry()
    }
  }

  function scheduleRetry(): void {
    if (stopped || retryTimer !== null) return
    const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS)
    attempt += 1
    handlers.onStatus('reconnecting')
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      void connect()
    }, delay)
  }

  function stop(): void {
    stopped = true
    if (retryTimer !== null) window.clearTimeout(retryTimer)
    retryTimer = null
    socket?.close()
    socket = null
    handlers.onStatus('off')
  }

  void connect()
  return stop
}
