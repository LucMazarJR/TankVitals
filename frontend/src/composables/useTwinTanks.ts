import { computed, watch } from 'vue'
import { worstLevel } from '../alerts'
import type { Device } from '../domain/devices'
import { checkDashboardBindings, planTanks, type TankSpec } from '../plant/tanks'
import { useDevicesStore } from '../stores/devices'
import type { AlertLevel } from '../types'
import { useDeviceState } from './useDeviceState'
import type { ItemLevel } from './useItemLevel'

/** O resumo de um tanque para os painéis do 3D e para a tela de Dispositivos. */
export interface TankSummary {
  spec: TankSpec
  level: ItemLevel
  online: number
  total: number
  /** Itens fora do normal (ou sem dados num tanque que está publicando). */
  notOk: Array<{ device: Device; level: ItemLevel }>
  /** A bomba de recirculação (o equipamento que a IA acompanha), se houver. */
  pump: Device | null
}

/**
 * Os tanques do cadastro, com a mesma conta da cena 3D (`planTanks`): a lista
 * ao lado e o desenho nunca discordam sobre o que está em cada tanque.
 */
export function useTwinTanks(level: (device: Device) => ItemLevel) {
  const devicesStore = useDevicesStore()
  const { connection } = useDeviceState()

  const specs = computed(() => planTanks(devicesStore.active))

  // Em desenvolvimento, avisa se o dashboard e o tanque-01 do cadastro se desencontrarem.
  if (import.meta.env.DEV) watch(specs, checkDashboardBindings, { immediate: true })

  const tanks = computed<TankSummary[]>(() =>
    specs.value.map((spec) => {
      const devices = spec.members.map((m) => m.device)
      const online = devices.filter((d) => connection(d.id) === 'online').length
      const live = online > 0
      const levels = devices.map((d) => ({ device: d, level: live ? level(d) : ('vazio' as ItemLevel) }))
      const known = levels.map((l) => l.level).filter((l): l is AlertLevel => l !== 'vazio')
      return {
        spec,
        level: live && known.length ? worstLevel(known) : 'vazio',
        online,
        total: devices.length,
        notOk: live ? levels.filter((l) => l.level !== 'ok') : [],
        pump: spec.members.find((m) => m.primary && m.role === 'recirculation')?.device ?? null,
      }
    }),
  )

  return { specs, tanks }
}
