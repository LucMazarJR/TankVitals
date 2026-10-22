import { computed, onUnmounted, ref, watch } from 'vue'
import { sendCommand } from '../api/devices'
import { ApiError } from '../api/http'
import { useLiveValues } from './useLiveValues'

/**
 * Liga e desliga um dispositivo pelo fluxo Web → IoT (IOT-04). A API só diz
 * que mandou; o comando só conta como feito quando a telemetria do próprio
 * dispositivo mostra o estado novo. Até lá, fica "aguardando confirmação".
 */
const CONFIRM_TIMEOUT_MS = 15_000

export function useActuatorCommand(deviceId: string, stateField: string) {
  const { state } = useLiveValues()
  const target = ref<boolean | null>(null)
  const error = ref<string | null>(null)
  let timeout: number | undefined

  const current = computed(() => state(deviceId, stateField))
  const pending = computed(() => target.value !== null)

  function settle() {
    target.value = null
    window.clearTimeout(timeout)
  }

  watch(current, (value) => {
    if (target.value !== null && value === target.value) settle()
  })

  async function set(on: boolean): Promise<void> {
    error.value = null
    target.value = on
    try {
      await sendCommand(deviceId, { command: 'on', value: on })
    } catch (err) {
      settle()
      error.value = commandErrorMessage(err)
      return
    }
    if (current.value === on) {
      settle()
      return
    }
    window.clearTimeout(timeout)
    timeout = window.setTimeout(() => {
      if (target.value === null) return
      target.value = null
      error.value = 'O dispositivo não confirmou o comando. Confira se o simulador está no ar.'
    }, CONFIRM_TIMEOUT_MS)
  }

  onUnmounted(() => window.clearTimeout(timeout))

  return { current, pending, target, error, set }
}

function commandErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Seu papel não pode comandar dispositivos.'
    if (err.status === 401) return 'Sua sessão acabou. Entre de novo para comandar.'
    return err.message
  }
  // O fetch lança TypeError quando nem chega ao servidor.
  if (err instanceof TypeError) return 'Não foi possível falar com o servidor.'
  return 'Não foi possível enviar o comando.'
}
