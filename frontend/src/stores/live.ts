import { defineStore } from 'pinia'
import { ref, shallowReactive } from 'vue'
import { MOCK } from '../config'
import type { Envelope } from '../live/envelope'
import { openLiveSocket, type LiveStatus } from '../live/socket'
import { startMockFeed } from '../mock/feed'

/** Quantas mensagens recentes ficam por dispositivo, para os mini gráficos. */
const RECENT_SIZE = 120

/**
 * Leituras ao vivo, alimentadas pelo WebSocket (ou pelo mock).
 *
 * É a fonte única do "agora" para o dashboard e para o 3D. O 3D não deve
 * reagir a cada mensagem: ele lê este store de dentro do loop de animação
 * (WEB-05). Por isso as coleções são `shallowReactive`: trocar a entrada de um
 * dispositivo avisa quem depende dela, sem o Vue vigiar cada campo de cada
 * leitura.
 */
export const useLiveStore = defineStore('live', () => {
  const status = ref<LiveStatus>('off')
  const lastMessageAt = ref<number | null>(null)
  /**
   * Última telemetria de qualquer dispositivo. É ela que diz se o simulador
   * está vivo: alerta e previsão podem continuar chegando com ele parado.
   */
  const lastTelemetryAt = ref<number | null>(null)
  /** Última telemetria de cada dispositivo, pelo id do cadastro. */
  const latest = shallowReactive<Record<string, Envelope>>({})
  /** Telemetrias recentes de cada dispositivo, da mais velha para a mais nova. */
  const recent = shallowReactive<Record<string, Envelope[]>>({})
  /** Última previsão da IA de cada equipamento. */
  const insights = shallowReactive<Record<string, Envelope>>({})

  const listeners = new Set<(msg: Envelope) => void>()
  let stopFeed: (() => void) | null = null

  function ingest(msg: Envelope): void {
    lastMessageAt.value = Date.now()
    if (msg.type === 'telemetry') {
      lastTelemetryAt.value = Date.now()
      latest[msg.device] = msg
      const list = recent[msg.device] ?? []
      recent[msg.device] = [...list.slice(-(RECENT_SIZE - 1)), msg]
    } else if (msg.type === 'insight') {
      insights[msg.device] = msg
    }
    listeners.forEach((listener) => listener(msg))
  }

  /**
   * Para as telas que precisam dos outros tipos de mensagem (progresso de job,
   * alerta, modelo novo). Devolve a função que cancela a inscrição.
   */
  function subscribe(listener: (msg: Envelope) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function connect(): void {
    if (stopFeed) return
    const setStatus = (next: LiveStatus) => {
      status.value = next
    }
    stopFeed = MOCK
      ? startMockFeed(ingest, setStatus)
      : openLiveSocket({ onEnvelope: ingest, onStatus: setStatus })
  }

  function disconnect(): void {
    stopFeed?.()
    stopFeed = null
    status.value = 'off'
    lastMessageAt.value = null
    for (const collection of [latest, recent, insights]) {
      for (const key of Object.keys(collection)) delete collection[key]
    }
  }

  /** Segundos desde a última mensagem, ou `null` se nada chegou. O 3D usa para o aviso de "sem dados". */
  function secondsSinceLastMessage(): number | null {
    return lastMessageAt.value === null ? null : (Date.now() - lastMessageAt.value) / 1000
  }

  return {
    status,
    lastMessageAt,
    lastTelemetryAt,
    latest,
    recent,
    insights,
    ingest,
    subscribe,
    connect,
    disconnect,
    secondsSinceLastMessage,
  }
})
