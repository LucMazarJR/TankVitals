import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError } from '../api/http'
import { getDevices } from '../api/devices'
import { variablesOf, type Device } from '../domain/devices'

/**
 * O cadastro de dispositivos, carregado uma vez e dividido por todas as telas.
 * A tela Dispositivos (WEB-03) chama `load(true)` depois de editar.
 */
export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Device[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let pending: Promise<void> | null = null

  async function load(force = false): Promise<void> {
    if (!force && devices.value.length) return
    if (pending) return pending
    loading.value = true
    error.value = null
    pending = getDevices()
      .then((list) => {
        devices.value = list
      })
      .catch((err: unknown) => {
        error.value = err instanceof ApiError || err instanceof Error ? err.message : 'Não foi possível carregar o cadastro.'
      })
      .finally(() => {
        loading.value = false
        pending = null
      })
    return pending
  }

  /** Só os ativos aparecem nas telas de operação. */
  const active = computed(() => devices.value.filter((device) => device.active))
  const byId = computed(() => new Map(active.value.map((device) => [device.id, device])))
  const variables = computed(() => variablesOf(active.value))

  return { devices, active, byId, variables, loading, error, load }
})
