/**
 * Formato único das mensagens ao vivo (docs/TAREFAS-2BIM.md, PLAT-01).
 *
 * É o mesmo envelope que circula no MQTT e no RabbitMQ, e o mesmo que chega
 * pelo WebSocket. O `payload` muda conforme o `type` e o dispositivo:
 * sensor → `{ "oxygen_mg_l": 6.8 }`, atuador → `{ "on": true }`,
 * insight → `{ "health": 72.5, "rul_h": 41, "model_version": "v3" }`.
 */
export type MessageType =
  | 'telemetry'
  | 'command'
  | 'insight'
  | 'alert'
  | 'job_progress'
  | 'model_updated'
  | 'status'

export interface Envelope<P = Record<string, unknown>> {
  id: string
  ts: string
  type: MessageType
  device: string
  payload: P
}

const MESSAGE_TYPES: readonly string[] = [
  'telemetry',
  'command',
  'insight',
  'alert',
  'job_progress',
  'model_updated',
  'status',
]

/** Confere a forma antes de a mensagem entrar no store: dado do socket não é confiável. */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false
  const msg = value as Record<string, unknown>
  return (
    typeof msg.id === 'string' &&
    typeof msg.ts === 'string' &&
    typeof msg.type === 'string' &&
    MESSAGE_TYPES.includes(msg.type) &&
    typeof msg.device === 'string' &&
    typeof msg.payload === 'object' &&
    msg.payload !== null
  )
}
