import type {
  HealthResponse,
  HistoryRange,
  HistorySeries,
  LatestReading,
  Stats,
  Thresholds,
  TankInfo,
} from '../types'
import { request, wsUrl } from './http'

// Rotas do 1º bimestre, que o dashboard ainda usa até a WEB-02.

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health')
}

export function getThresholds(): Promise<Thresholds> {
  return request<Thresholds>('/api/thresholds')
}

export function getTanks(): Promise<TankInfo[]> {
  return request<TankInfo[]>('/api/tanks')
}

export function getLatest(tankId: string): Promise<LatestReading> {
  return request<LatestReading>(
    `/api/readings/latest?tank_id=${encodeURIComponent(tankId)}`,
  )
}

export function getHistory(
  tankId: string,
  range: HistoryRange,
  metric?: string,
): Promise<HistorySeries> {
  const params = new URLSearchParams({
    tank_id: tankId,
    range,
  })
  if (metric) params.set('metrics', metric)
  return request<HistorySeries>(`/api/readings/history?${params.toString()}`)
}

export function getStats(tankId: string, range: HistoryRange): Promise<Stats> {
  const params = new URLSearchParams({
    tank_id: tankId,
    range,
  })
  return request<Stats>(`/api/stats?${params.toString()}`)
}

export function getWebSocketUrl(tankId: string): string {
  return wsUrl('/ws/live', { tank_id: tankId })
}
