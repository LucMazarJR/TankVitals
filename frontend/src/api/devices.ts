import { MOCK } from '../config'
import type { Alert, CommandAck, CommandRequest, Device, HistoryResponse } from '../domain/devices'
import { mockGetAlerts, mockGetDevices, mockGetHistory, mockSendCommand } from '../mock/api'
import type { HistoryRange } from '../types'
import { request } from './http'

/**
 * Rotas de cadastro, histórico, alertas e comando (BACK-05 e IOT-04). No modo
 * simulado, as mesmas funções respondem pela planta simulada do navegador.
 */

export function getDevices(): Promise<Device[]> {
  if (MOCK) return mockGetDevices()
  return request<Device[]>('/api/devices')
}

/**
 * Histórico agregado de todas as variáveis (ou só das dos dispositivos
 * pedidos), com as estatísticas de cada uma no período.
 */
export function getHistory(range: HistoryRange, devices?: string[]): Promise<HistoryResponse> {
  if (MOCK) return mockGetHistory(range, devices)
  const params = new URLSearchParams({ range })
  devices?.forEach((device) => params.append('device', device))
  return request<HistoryResponse>(`/api/history?${params.toString()}`)
}

export function getAlerts(status: 'open' | 'all' = 'all'): Promise<Alert[]> {
  if (MOCK) return mockGetAlerts(status)
  return request<Alert[]>(`/api/alerts?status=${status}`)
}

/** Manda um comando ao dispositivo; o novo estado chega pela telemetria. */
export function sendCommand(deviceId: string, command: CommandRequest): Promise<CommandAck> {
  if (MOCK) return mockSendCommand(deviceId, command)
  return request<CommandAck>(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
}
