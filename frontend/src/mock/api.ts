import { ApiError } from '../api/http'
import type { Alert, CommandAck, CommandRequest, Device, HistoryResponse } from '../domain/devices'
import type { HistoryRange } from '../types'
import { FAULT_MODES, getMockPlant } from './plant'
import { MOCK_DEVICES } from './registry'

/**
 * As rotas de leitura e de comando no modo simulado, com a mesma forma das de
 * verdade (BACK-05, IOT-04) e uma pequena espera, para a tela mostrar o
 * "carregando" como vai mostrar com a API.
 */

/** Tempo até o "simulador" aplicar o comando: o caminho API → RabbitMQ → MQTT. */
const COMMAND_DELAY_MS = 900

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function mockGetDevices(): Promise<Device[]> {
  await wait(120)
  return structuredClone(MOCK_DEVICES)
}

export async function mockGetHistory(range: HistoryRange, devices?: string[]): Promise<HistoryResponse> {
  await wait(150)
  const plant = getMockPlant()
  plant.catchUp()
  return plant.history(range, devices)
}

export async function mockGetAlerts(status: 'open' | 'all'): Promise<Alert[]> {
  await wait(100)
  return getMockPlant().alerts(status)
}

export async function mockSendCommand(deviceId: string, request: CommandRequest): Promise<CommandAck> {
  await wait(150)
  const device = MOCK_DEVICES.find((d) => d.id === deviceId)
  if (!device) throw new ApiError('Dispositivo não encontrado.', 404)
  if (!device.commands.includes(request.command)) {
    throw new ApiError(`O dispositivo não aceita o comando "${request.command}".`, 422)
  }
  if (request.command === 'on' && typeof request.value !== 'boolean') {
    throw new ApiError('O comando "on" precisa de um valor verdadeiro ou falso.', 422)
  }
  if (request.command === 'inject_fault' && !FAULT_MODES.some((mode) => mode === request.value)) {
    throw new ApiError('Modo de falha desconhecido.', 422)
  }
  window.setTimeout(() => getMockPlant().command(deviceId, request), COMMAND_DELAY_MS)
  return { id: `mock-cmd-${Date.now()}`, status: 'sent' }
}
