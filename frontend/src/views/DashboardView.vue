<script setup lang="ts">
// Dashboard ao vivo (WEB-02). Tudo aqui sai do cadastro de dispositivos: os
// cartões, o seletor do gráfico, a análise e os controles. Um sensor novo
// cadastrado aparece sem mudar esta tela.
import { computed, onMounted, ref } from 'vue'
import ActuatorControl from '../components/ActuatorControl.vue'
import AlertsPanel from '../components/AlertsPanel.vue'
import AnalysisPanel, { type AnalysisRow } from '../components/AnalysisPanel.vue'
import BrandMark from '../components/BrandMark.vue'
import HistoryChart from '../components/HistoryChart.vue'
import HistoryTable from '../components/HistoryTable.vue'
import MetricCard from '../components/MetricCard.vue'
import RangeSelector from '../components/RangeSelector.vue'
import StatusBar from '../components/StatusBar.vue'
import TankDiagram from '../components/TankDiagram.vue'
import { useAlerts } from '../composables/useAlerts'
import { useHistoryData } from '../composables/useHistoryData'
import { useLiveValues } from '../composables/useLiveValues'
import { useNow } from '../composables/useNow'
import { MOCK } from '../config'
import { classify, worstLevel } from '../alerts'
import { controllables, variablesOf, type Alert, type Device, type SeriesStats, type Variable } from '../domain/devices'
import { fieldIcon, LEVEL_ICON, UI_ICON } from '../icons'
import { TANK } from '../plant/layout'
import { useDevicesStore } from '../stores/devices'
import { useLiveStore } from '../stores/live'
import type { AlertLevel, HistoryPoint, HistoryRange, MetricValue } from '../types'

const devicesStore = useDevicesStore()
const live = useLiveStore()
const now = useNow()
const { value, state } = useLiveValues()

const range = ref<HistoryRange>('6h')
const history = useHistoryData(range)
const { alerts } = useAlerts()

onMounted(() => {
  void devicesStore.load()
})

const RANGE_LABEL: Record<HistoryRange, string> = {
  '1h': 'na última hora',
  '6h': 'nas últimas 6 horas',
  '24h': 'nas últimas 24 horas',
  '7d': 'nos últimos 7 dias',
}

// --- o que existe, pelo cadastro ---------------------------------------------

const sensors = computed(() => devicesStore.active.filter((device) => device.kind === 'sensor'))
const equipment = computed(() => devicesStore.active.filter((device) => device.kind === 'equipment'))
const waterVariables = computed(() => variablesOf(sensors.value))
const controls = computed(() => controllables(devicesStore.active))

/** Grupos do seletor do gráfico e da análise: a água e cada equipamento. */
const groups = computed(() => [
  { label: 'Água', variables: waterVariables.value },
  ...equipment.value.map((device) => ({ label: device.name, variables: variablesOf([device]) })),
])

// --- o agora ------------------------------------------------------------------

function liveMetric(variable: Variable): MetricValue | undefined {
  const current = value(variable.device.id, variable.field.key)
  if (current === null) return undefined
  return { value: current, level: classify(current, variable.field.range), unit: variable.field.unit }
}

const overall = computed(() => {
  const levels = devicesStore.variables
    .map((variable) => liveMetric(variable)?.level)
    .filter((level): level is AlertLevel => level !== undefined)
  if (!levels.length) return { cls: 'status-neutral', text: 'Sem dados' }
  const worst = worstLevel(levels)
  if (worst === 'critico') return { cls: 'status-critico', text: 'Situação crítica' }
  if (worst === 'atencao') return { cls: 'status-atencao', text: 'Atenção necessária' }
  return { cls: 'status-ok', text: 'Tudo normal' }
})

const tankLevel = computed(() => value(TANK.level.device, TANK.level.field))
const aerator = computed(() => state(TANK.aerator.device, TANK.aerator.field))
const recirculation = computed(() => state(TANK.recirculation.device, TANK.recirculation.field))
const refill = computed(() => state(TANK.refill.device, TANK.refill.field))

function stateStatsOf(device: Device): SeriesStats | undefined {
  if (!device.state_field) return undefined
  return history.series(device.id, device.state_field)?.stats
}

/** Previsão da IA do equipamento, se chegou há pouco (as previsões são mais espaçadas). */
function insightOf(device: Device): { health: number; rul_h: number } | null {
  const msg = live.insights[device.id]
  if (!msg || now.value - Date.parse(msg.ts) > 60_000) return null
  const { health, rul_h: rul } = msg.payload
  return typeof health === 'number' && typeof rul === 'number' ? { health, rul_h: rul } : null
}

function formatNumber(n: number | undefined, decimals: number): string {
  if (n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// --- gráfico ------------------------------------------------------------------

const selectedId = ref<string | null>(null)
const selected = computed<Variable | undefined>(
  () => devicesStore.variables.find((v) => v.id === selectedId.value) ?? devicesStore.variables[0],
)
const selectedSeries = computed(() =>
  selected.value ? history.series(selected.value.device.id, selected.value.field.key) : undefined,
)

/** As leituras cruas mais recentes da grandeza do gráfico, do store ao vivo. */
const recentReadings = computed<HistoryPoint[]>(() => {
  const variable = selected.value
  if (!variable) return []
  const list = live.recent[variable.device.id] ?? []
  const out: HistoryPoint[] = []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const v = list[i].payload[variable.field.key]
    if (typeof v === 'number') out.push({ t: list[i].ts, v })
  }
  return out
})

// --- análise ------------------------------------------------------------------

const analysisRows = computed<AnalysisRow[]>(() =>
  groups.value.flatMap((group) =>
    group.variables.map((variable) => {
      const series = history.series(variable.device.id, variable.field.key)
      const metric = liveMetric(variable)
      return {
        id: variable.id,
        group: group.label,
        device: variable.device.id,
        label: variable.field.short,
        unit: variable.field.unit,
        decimals: variable.field.decimals,
        icon: fieldIcon(variable.field.key),
        now: metric?.value ?? null,
        // Sem faixa não há "normal" a dizer: a linha fica sem selo.
        level: metric && variable.field.range ? metric.level : null,
        stats: series?.stats,
        points: series?.points.map((point) => point.v) ?? [],
        range: variable.field.range,
      }
    }),
  ),
)

const updatedLabel = computed(() =>
  history.updatedAt.value
    ? history.updatedAt.value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '',
)

// --- alertas ------------------------------------------------------------------

const openAlerts = computed(() => alerts.value.filter((alert) => alert.closed_at === null).length)

function describeAlert(alert: Alert) {
  const device = devicesStore.byId.get(alert.device)
  const field = device?.fields.find((f) => f.key === alert.field)
  return {
    label: field?.short ?? device?.name ?? alert.device,
    unit: field?.unit ?? '',
    decimals: field?.decimals ?? 1,
    icon: field ? fieldIcon(field.key) : UI_ICON.dispositivo,
  }
}

const booting = computed(() => devicesStore.loading && !devicesStore.devices.length)
</script>

<template>
  <div class="app-shell">
    <StatusBar
      :tank-id="TANK.id"
      :source="MOCK ? 'Modo simulado' : 'Simulador'"
      :last-message-at="live.lastMessageAt"
      :live-status="live.status"
    />

    <main class="dashboard">
      <div v-if="devicesStore.error" class="global-error">
        <component :is="LEVEL_ICON.critico" :size="20" aria-hidden="true" />
        <div>
          <strong>Não foi possível carregar o cadastro</strong>
          <small>{{ devicesStore.error }}</small>
        </div>
        <button type="button" @click="devicesStore.load(true)">Tentar de novo</button>
      </div>

      <section class="dashboard-toolbar">
        <h2>Qualidade da água</h2>

        <div class="toolbar-controls">
          <RangeSelector v-model="range" />

          <div :class="['overall-status', overall.cls]" role="status">
            <span class="overall-dot" />
            {{ overall.text }}
          </div>
        </div>
      </section>

      <section class="tank-overview" aria-label="O tanque agora">
        <div class="panel tank-panel">
          <div class="panel-header">
            <h3>{{ TANK.id }} em corte</h3>
            <span class="small-note">muda com cada leitura</span>
          </div>

          <TankDiagram :level="tankLevel" :aerator="aerator" :recirculation="recirculation" :refill="refill" />

          <ul class="actuator-list" aria-label="Atuadores e bomba">
            <ActuatorControl
              v-for="device in controls"
              :key="device.id"
              :device="device"
              :stats="stateStatsOf(device)"
              :period-label="RANGE_LABEL[range]"
            />
          </ul>
        </div>

        <div class="metrics-grid" aria-label="Leituras da água">
          <MetricCard
            v-for="variable in waterVariables"
            :key="variable.id"
            :icon="fieldIcon(variable.field.key)"
            :label="variable.field.label"
            :metric="liveMetric(variable)"
            :threshold="variable.field.range"
            :decimals="variable.field.decimals"
            :unit="variable.field.unit"
          />
        </div>
      </section>

      <section
        v-for="device in equipment"
        :key="device.id"
        class="panel equipment-panel"
        :aria-labelledby="`equipamento-${device.id}`"
      >
        <div class="panel-header">
          <h3 :id="`equipamento-${device.id}`">{{ device.name }}</h3>
          <span v-if="insightOf(device)" class="equipment-health">
            Saúde prevista <strong>{{ formatNumber(insightOf(device)?.health, 0) }} %</strong>
            · vida útil <strong>{{ formatNumber(insightOf(device)?.rul_h, 0) }} h</strong>
          </span>
          <span v-else class="small-note">sem previsão da IA ainda</span>
        </div>

        <div class="metrics-grid equipment-grid">
          <MetricCard
            v-for="variable in variablesOf([device])"
            :key="variable.id"
            :icon="fieldIcon(variable.field.key)"
            :label="variable.field.label"
            :metric="liveMetric(variable)"
            :threshold="variable.field.range"
            :decimals="variable.field.decimals"
            :unit="variable.field.unit"
          />
        </div>
      </section>

      <section class="panel chart-panel">
        <div class="panel-header">
          <h3>Evolução das leituras</h3>

          <div class="chart-controls">
            <label class="select-field metric-select">
              <span>Grandeza</span>
              <select
                :value="selected?.id"
                @change="selectedId = ($event.target as HTMLSelectElement).value"
              >
                <optgroup v-for="group in groups" :key="group.label" :label="group.label">
                  <option v-for="variable in group.variables" :key="variable.id" :value="variable.id">
                    {{ variable.field.short }}
                  </option>
                </optgroup>
              </select>
            </label>
          </div>
        </div>

        <div v-if="history.loading.value && !selectedSeries" class="loading-state">
          <span class="spinner" />
          Carregando o histórico…
        </div>

        <div v-else-if="history.error.value && !selectedSeries" class="error-state">
          <component :is="LEVEL_ICON.critico" :size="22" aria-hidden="true" />
          <strong>Não foi possível carregar o histórico</strong>
          <span>{{ history.error.value }}</span>
        </div>

        <HistoryChart
          v-else-if="selected"
          :points="selectedSeries?.points ?? []"
          :label="selected.field.label"
          :unit="selected.field.unit"
          :threshold="selected.field.range"
          :range="range"
        />

        <div v-if="selected && selectedSeries" class="stats-strip">
          <div>
            <span>Mínimo</span>
            <strong>{{ formatNumber(selectedSeries.stats.min, selected.field.decimals) }}</strong>
          </div>
          <div>
            <span>Média</span>
            <strong>{{ formatNumber(selectedSeries.stats.avg, selected.field.decimals) }}</strong>
          </div>
          <div>
            <span>Máximo</span>
            <strong>{{ formatNumber(selectedSeries.stats.max, selected.field.decimals) }}</strong>
          </div>
          <div>
            <span>Último</span>
            <strong>{{ formatNumber(selectedSeries.stats.last, selected.field.decimals) }}</strong>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header compact">
          <h3>Comportamento no período</h3>
          <span v-if="updatedLabel" class="small-note live-note">
            <component :is="UI_ICON.atualizando" :size="13" aria-hidden="true" />
            atualizado às {{ updatedLabel }}
          </span>
        </div>
        <AnalysisPanel :rows="analysisRows" :range="range" />
      </section>

      <section class="lower-grid">
        <div class="panel">
          <div class="panel-header compact">
            <h3>Últimas leituras{{ selected ? ` · ${selected.field.short}` : '' }}</h3>
            <span class="small-note">as 50 mais recentes</span>
          </div>
          <HistoryTable
            v-if="selected"
            :readings="recentReadings"
            :label="selected.field.label"
            :unit="selected.field.unit"
            :decimals="selected.field.decimals"
            :threshold="selected.field.range"
          />
        </div>

        <div class="panel">
          <div class="panel-header compact">
            <h3>Alertas</h3>
            <span class="alert-count">{{ openAlerts ? `${openAlerts} aberto${openAlerts > 1 ? 's' : ''}` : 'nenhum aberto' }}</span>
          </div>
          <AlertsPanel :alerts="alerts" :describe="describeAlert" />
        </div>
      </section>

      <footer class="footer">
        <span>TankVitals · monitoramento de aquicultura</span>
        <span>{{ TANK.id }}</span>
      </footer>
    </main>

    <div v-if="booting" class="startup-overlay">
      <div class="startup-card">
        <BrandMark :size="48" />
        <strong>TankVitals</strong>
        <span>Carregando o cadastro…</span>
        <span class="spinner" />
      </div>
    </div>
  </div>
</template>
