import type { Envelope, MessageType } from '../live/envelope'
import type { LiveStatus } from '../live/socket'

/**
 * Telemetria simulada do modo mock, no mesmo formato que o simulador de
 * verdade (IOT-01) vai publicar: uma mensagem por dispositivo a cada passo,
 * com os ids do cadastro inicial.
 *
 * Segue o relógio combinado: 1 s real = 1 min simulado. Um dia dura 24 min,
 * então dá para ver a luz e o oxigênio mudando. Não é física de verdade (essa
 * é a IA-01); é só para as telas e o 3D terem o que mostrar antes do backend.
 */
export function startMockFeed(
  onEnvelope: (msg: Envelope) => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  let minute = 7 * 60 // começa às 7h simuladas
  let seq = 0
  let oxygen = 6.2
  let level = 72
  let aeratorOn = false

  const send = (device: string, payload: Record<string, unknown>, type: MessageType = 'telemetry') => {
    seq += 1
    onEnvelope({ id: `mock-${seq}`, ts: new Date().toISOString(), type, device, payload })
  }

  const step = () => {
    minute += 1
    const hour = (minute / 60) % 24
    // 0 à noite, 1 ao meio-dia.
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12))

    // Oxigênio sobe com a fotossíntese de dia, cai à noite, e o aerador empurra para cima.
    oxygen += 0.035 * daylight - 0.02 + (aeratorOn ? 0.05 : 0) - Math.max(0, oxygen - 8) * 0.1
    // Imitação local da regra da IOT-07 (o serviço rules), só para o aerador ter vida no mock.
    if (oxygen < 5) aeratorOn = true
    else if (oxygen >= 6.5) aeratorOn = false
    level = Math.max(60, level - 0.004)

    send('temp-agua-01', {
      temperature_c: round(26 + 1.4 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + noise(0.05), 2),
    })
    send('ph-01', { ph: round(7.2 + 0.12 * Math.sin(minute / 90) + noise(0.02), 2) })
    send('nivel-01', { level_pct: round(level + noise(0.2), 1) })
    send('turbidez-01', { turbidity_ntu: round(18 + 4 * Math.sin(minute / 200) + noise(0.6), 1) })
    send('od-01', { oxygen_mg_l: round(oxygen + noise(0.05), 2) })
    send('luz-01', { light_lux: Math.max(0, Math.round(20 + 32000 * daylight + noise(150))) })
    send('bomba-rec-01', {
      vibration_mm_s: round(1.1 + noise(0.12), 2),
      current_a: round(2.6 + noise(0.04), 2),
      motor_temp_c: round(47 + 5 * daylight + noise(0.3), 1),
      flow_l_min: round(49 + noise(0.8), 1),
      running: true,
    })
    send('aerador-01', { on: aeratorOn })
    send('bomba-repo-01', { on: false })

    if (minute % 5 === 0) {
      send('bomba-rec-01', { health: round(93 + noise(1.5), 1), rul_h: 168, model_version: 'mock' }, 'insight')
    }
  }

  onStatus('simulated')
  step()
  const timer = window.setInterval(step, 1000)

  return () => {
    window.clearInterval(timer)
    onStatus('off')
  }
}

function noise(amplitude: number): number {
  return (Math.random() * 2 - 1) * amplitude
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
