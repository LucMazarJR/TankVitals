import {
  Thermometer,
  FlaskConical,
  Waves,
  Microscope,
  CircleCheck,
  TriangleAlert,
  OctagonAlert,
  CircleHelp,
  Activity,
  Wifi,
  WifiOff,
  RadioTower,
  ChartNoAxesColumn,
  RefreshCw,
} from 'lucide-vue-next'
import type { AlertLevel, MetricKey } from './types'

/**
 * Ícones em um lugar só, para os componentes não importarem do lucide direto.
 *
 * Os de nível existem por acessibilidade, não por enfeite: `atencao` e
 * `critico` ficam a ΔE 14,4 em visão normal (abaixo do piso de 15), ou seja,
 * âmbar e vermelho são difíceis de separar só pela cor. A forma do ícone, ao
 * lado do rótulo em texto, é o canal que não depende de enxergar cor.
 */

export const METRIC_ICON: Record<MetricKey, typeof Thermometer> = {
  temperature_c: Thermometer,
  ph: FlaskConical,
  level_pct: Waves,
  turbidity_ntu: Microscope,
}

export const LEVEL_ICON: Record<AlertLevel, typeof CircleCheck> = {
  ok: CircleCheck,
  atencao: TriangleAlert,
  critico: OctagonAlert,
}

export const UI_ICON = {
  semDado: CircleHelp,
  aoVivo: Activity,
  online: Wifi,
  offline: WifiOff,
  dispositivo: RadioTower,
  analise: ChartNoAxesColumn,
  atualizando: RefreshCw,
}
