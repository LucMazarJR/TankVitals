<script setup lang="ts">
// Gêmeo digital 3D (WEB-05 a WEB-08). A cena (src/scene/TwinScene.ts) lê o
// store ao vivo de dentro do próprio loop; esta tela cria a cena, entrega o
// cadastro, guarda o foco (visão geral, tanque ou item) e mostra os painéis.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TankPanel from '../components/TankPanel.vue'
import TwinBreadcrumb from '../components/TwinBreadcrumb.vue'
import TwinOverview from '../components/TwinOverview.vue'
import TwinPanel from '../components/TwinPanel.vue'
import { useAlerts } from '../composables/useAlerts'
import { formatAge, useDeviceState } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, useItemLevel, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useNow } from '../composables/useNow'
import { usePreferences } from '../composables/usePreferences'
import { useTwinTanks } from '../composables/useTwinTanks'
import { LEVEL_ICON, UI_ICON } from '../icons'
import { STALE_AFTER_MS } from '../live/freshness'
import { SCENERIES, SCENERY_LABEL, type Scenery } from '../scene/environments/types'
import { nextFocus, OVERVIEW, sameFocus, upFocus, type TwinFocus } from '../scene/focus'
import { TwinScene } from '../scene/TwinScene'
import { useDevicesStore } from '../stores/devices'
import { useLiveStore } from '../stores/live'

const devicesStore = useDevicesStore()
const live = useLiveStore()
const now = useNow()
const route = useRoute()
const router = useRouter()
const preferences = usePreferences()
const { value, state } = useLiveValues()
const { alerts } = useAlerts()
const { level, insight } = useItemLevel(() => alerts.value)
const { connection } = useDeviceState()
const { tanks } = useTwinTanks(level)

/** A cena congela se nada chegar por 10 s, de nenhum dispositivo (WEB-06). */
function isFrozen(at: number): boolean {
  return live.lastMessageAt === null || at - live.lastMessageAt > STALE_AFTER_MS
}
const frozen = computed(() => isFrozen(now.value))
const silentFor = computed(() =>
  live.lastMessageAt === null ? null : Math.max(0, Math.round((now.value - live.lastMessageAt) / 1000)),
)

const LEGEND: ItemLevel[] = ['ok', 'atencao', 'critico', 'vazio']

// --- foco: visão geral, tanque ou item (fica na URL) ------------------------------

function focusFromRoute(): TwinFocus {
  const tank = typeof route.query.tanque === 'string' ? route.query.tanque : null
  const item = typeof route.query.item === 'string' ? route.query.item : null
  if (tank && item) return { level: 'item', tank, device: item }
  if (tank) return { level: 'tank', tank }
  return OVERVIEW
}

const focus = ref<TwinFocus>(focusFromRoute())
const tankById = computed(() => new Map(tanks.value.map((tank) => [tank.spec.id, tank])))

/** Um tanque ou item que saiu do cadastro sobe o foco um nível. */
const current = computed<TwinFocus>(() => {
  const f = focus.value
  if (f.level === 'overview' || !devicesStore.devices.length) return f
  const tank = tankById.value.get(f.tank)
  if (!tank) return OVERVIEW
  if (f.level === 'item' && !tank.spec.members.some((m) => m.device.id === f.device)) return { level: 'tank', tank: f.tank }
  return f
})

function go(next: TwinFocus) {
  if (!sameFocus(next, focus.value)) focus.value = next
}

const up = () => go(upFocus(current.value))
const currentTank = computed(() => (current.value.level === 'overview' ? null : (tankById.value.get(current.value.tank) ?? null)))
const currentItem = computed(() => (current.value.level === 'item' ? (devicesStore.byId.get(current.value.device) ?? null) : null))

const sheetBody = ref<HTMLElement | null>(null)

watch(current, (f) => {
  scene.value?.focus(f)
  // Painel novo começa do topo, não da rolagem do painel anterior.
  sheetBody.value?.scrollTo({ top: 0 })
  const query = { ...route.query }
  delete query.tanque
  delete query.item
  if (f.level !== 'overview') query.tanque = f.tank
  if (f.level === 'item') query.item = f.device
  void router.replace({ query })
})
// Voltar e avançar do navegador.
watch(
  () => route.query,
  () => go(focusFromRoute()),
)

/** Esc sobe um nível, a não ser que a pessoa esteja num campo, num menu ou num diálogo. */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || current.value.level === 'overview') return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, select, textarea, dialog, .user-menu')) return
  up()
}

const tankLabel = (zone: string) => tankById.value.get(zone)?.spec.label ?? zone
const deviceName = (id: string) => devicesStore.byId.get(id)?.name ?? id

// --- cena ------------------------------------------------------------------------------

const host = ref<HTMLElement | null>(null)
const sheet = ref<HTMLElement | null>(null)
const scene = shallowRef<TwinScene | null>(null)
const failed = ref(false)
const panelOpen = ref(true)
let sheetObserver: ResizeObserver | null = null
const narrow = window.matchMedia('(max-width: 700px)')

/** No desktop o cartão cobre a direita da cena: a câmera centraliza na parte visível. */
function updateInsets() {
  const el = sheet.value
  const right = !narrow.matches && el ? el.offsetWidth + 24 : 0
  scene.value?.setInsets({ right, bottom: 0 })
}

onMounted(() => {
  void devicesStore.load()
  document.addEventListener('keydown', onKeydown)
  if (!host.value) return
  try {
    scene.value = new TwinScene(
      host.value,
      { value, state, level, fresh: (id) => connection(id) === 'online', frozen: () => isFrozen(Date.now()) },
      { onPick: (target) => go(nextFocus(current.value, target)) },
      { scenery: preferences.scenery },
    )
  } catch {
    // Sem WebGL (driver, máquina virtual, navegador antigo) não há cena.
    failed.value = true
    return
  }
  scene.value.setDevices(devicesStore.active)
  scene.value.focus(current.value)
  if (sheet.value) {
    sheetObserver = new ResizeObserver(updateInsets)
    sheetObserver.observe(sheet.value)
  }
  narrow.addEventListener('change', updateInsets)
  updateInsets()
  // Em desenvolvimento: `__twin.stats()` no console mostra chamadas de desenho e memória.
  if (import.meta.env.DEV) (window as unknown as { __twin: TwinScene }).__twin = scene.value
})

// O cadastro mudou (dispositivo novo, desativado): só então a cena remonta os tanques.
watch(
  () => devicesStore.active,
  (devices) => scene.value?.setDevices(devices),
)
watch(
  () => preferences.scenery,
  (id) => scene.value?.setScenery(id),
)
// Contraste novo: a cena pega as cores dos tokens de novo.
watch(
  () => preferences.contrast,
  () => scene.value?.refreshPalette(),
)

function setScenery(id: Scenery) {
  preferences.scenery = id
}

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  narrow.removeEventListener('change', updateInsets)
  sheetObserver?.disconnect()
  scene.value?.dispose()
  scene.value = null
})
</script>

<template>
  <main class="twin-page" :class="{ 'panel-closed': !panelOpen }">
    <h2 class="sr-only">Gêmeo 3D</h2>

    <div class="twin-viewport">
      <div
        ref="host"
        class="twin-host"
        role="img"
        aria-label="Cena 3D dos tanques com os sensores, a bomba e os atuadores, movida pelos dados ao vivo"
      />

      <div class="twin-toolbar">
        <div class="twin-float twin-nav">
          <button v-if="current.level !== 'overview'" type="button" class="twin-back" @click="up">
            <component :is="UI_ICON.voltar" :size="16" aria-hidden="true" />
            Voltar
          </button>
          <TwinBreadcrumb :focus="current" :tank-label="tankLabel" :device-name="deviceName" @go="go" />
        </div>

        <div class="twin-float twin-scenery" role="group" aria-label="Cenário">
          <component :is="UI_ICON.cenario" :size="16" aria-hidden="true" />
          <div class="segmented-control">
            <button
              v-for="id in SCENERIES"
              :key="id"
              type="button"
              :class="{ active: preferences.scenery === id }"
              :aria-pressed="preferences.scenery === id"
              @click="setScenery(id)"
            >
              {{ SCENERY_LABEL[id] }}
            </button>
          </div>
          <label class="twin-scenery-select">
            <span class="sr-only">Cenário</span>
            <select :value="preferences.scenery" @change="setScenery(($event.target as HTMLSelectElement).value as Scenery)">
              <option v-for="id in SCENERIES" :key="id" :value="id">{{ SCENERY_LABEL[id] }}</option>
            </select>
          </label>
        </div>
      </div>

      <div class="twin-float twin-legend">
        <ul aria-label="Legenda das cores">
          <li v-for="item in LEGEND" :key="item">
            <span :class="['twin-swatch', `swatch-${item}`]" aria-hidden="true" />
            {{ ITEM_LEVEL_TEXT[item] }}
          </li>
        </ul>
        <p>Arraste para girar · roda ou dois dedos para aproximar · Esc volta</p>
      </div>

      <div v-if="frozen && !failed" class="twin-frozen" role="status">
        <component :is="UI_ICON.offline" :size="22" aria-hidden="true" />
        <div>
          <strong>{{ silentFor === null ? 'Aguardando os primeiros dados' : `Sem dados ${formatAge(silentFor)}` }}</strong>
          <span>
            A cena só anda com o que chega ao vivo pelo WebSocket. Ela ficou parada e volta sozinha quando as leituras
            voltarem.
          </span>
        </div>
      </div>

      <div v-if="failed" class="error-state twin-failed">
        <component :is="LEVEL_ICON.critico" :size="22" aria-hidden="true" />
        <strong>Este navegador não abriu o 3D</strong>
        <span>A cena precisa de WebGL. Tente outro navegador ou ative a aceleração de hardware.</span>
      </div>
    </div>

    <aside ref="sheet" class="twin-sheet" :class="{ 'is-closed': !panelOpen }">
      <button
        type="button"
        class="twin-sheet-toggle"
        :aria-expanded="panelOpen"
        :aria-label="panelOpen ? 'Recolher o painel' : 'Abrir o painel'"
        @click="panelOpen = !panelOpen"
      >
        <component :is="panelOpen ? UI_ICON.abrir : UI_ICON.voltar" :size="18" aria-hidden="true" />
      </button>

      <div v-show="panelOpen" ref="sheetBody" class="twin-sheet-body">
        <TwinPanel
          v-if="currentItem"
          :key="currentItem.id"
          :device="currentItem"
          :level="level(currentItem)"
          :insight="insight(currentItem.id)"
          @close="up"
        />
        <TankPanel
          v-else-if="currentTank"
          :key="currentTank.spec.id"
          :tank="currentTank"
          :insight="insight"
          :alerts="alerts"
          :level="level"
          @select="(id) => go({ level: 'item', tank: currentTank!.spec.id, device: id })"
          @close="up"
        />
        <TwinOverview
          v-else
          :tanks="tanks"
          :insight="insight"
          @tank="(zone) => go({ level: 'tank', tank: zone })"
          @item="(zone, id) => go({ level: 'item', tank: zone, device: id })"
        />
      </div>
    </aside>
  </main>
</template>

<style scoped>
/* A cena ocupa a área toda; os controles e o cartão flutuam por cima dela. */
.twin-page {
  position: relative;
  height: calc(100dvh - var(--app-top-offset, 0px));
  min-height: 520px;
  overflow: hidden;
  background: var(--night);
}

.twin-viewport {
  position: absolute;
  inset: 0;
}

.twin-host {
  position: absolute;
  inset: 0;
}

.twin-float {
  border: var(--bw-strong) solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 6px 20px rgba(10, 35, 55, 0.18);
}

.twin-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  right: calc(var(--sheet-space, 400px) + 16px);
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  pointer-events: none;
}

.twin-toolbar > * {
  pointer-events: auto;
}

.twin-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 4px;
}

.twin-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 12px 0 8px;
  border: 0;
  border-radius: 10px;
  color: var(--surface);
  font: inherit;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
  background: var(--night);
  cursor: pointer;
}

.twin-back:hover {
  background: var(--night-active);
}

.twin-scenery {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 4px 12px;
  color: var(--muted);
}

.twin-scenery .segmented-control {
  border: 0;
  padding: 0;
}

.twin-scenery-select {
  display: none;
}

.twin-legend {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 14px;
}

.twin-legend ul {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
  list-style: none;
}

.twin-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.twin-legend p {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.twin-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.swatch-ok {
  background: var(--nivel-ok);
}

.swatch-atencao {
  background: var(--nivel-atencao);
}

.swatch-critico {
  background: var(--nivel-critico);
}

.swatch-vazio {
  border: 2px dashed var(--muted);
  background: var(--scene-nodata);
}

/* Aviso de "sem dados": no meio da parte visível da cena, impossível de não ver. */
.twin-frozen {
  position: absolute;
  top: 50%;
  left: calc((100% - var(--sheet-space, 400px)) / 2);
  z-index: 3;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: min(440px, calc(100% - 32px));
  padding: 14px 16px;
  border: var(--bw-alert) solid var(--atencao-line);
  border-radius: var(--radius);
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(10, 35, 55, 0.3);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.twin-frozen svg {
  flex: 0 0 auto;
  color: var(--atencao-mark);
}

.twin-frozen strong {
  display: block;
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.twin-frozen span {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.twin-failed {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: var(--surface);
}

/* O cartão flutuante: visão geral, aquário ou item. */
.twin-page {
  --sheet-space: 400px;
}

.twin-page.panel-closed {
  --sheet-space: 64px;
}

.twin-sheet {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 4;
  display: flex;
  width: 370px;
  border: var(--bw-strong) solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 10px 34px rgba(10, 35, 55, 0.28);
}

.twin-sheet.is-closed {
  width: auto;
  bottom: auto;
}

.twin-sheet-toggle {
  position: absolute;
  top: 14px;
  left: -18px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: var(--bw-strong) solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 3px 10px rgba(10, 35, 55, 0.2);
  cursor: pointer;
}

.twin-sheet.is-closed .twin-sheet-toggle {
  position: static;
  margin: 8px;
}

.twin-sheet-body {
  flex: 1;
  min-width: 0;
  padding: 18px 18px 22px 22px;
  overflow-y: auto;
}

@media (max-width: 1100px) {
  .twin-sheet {
    width: 330px;
  }

  .twin-page {
    --sheet-space: 360px;
  }
}

/* Celular: a cena em cima, o painel embaixo, sem cobrir nada. */
@media (max-width: 700px) {
  .twin-page,
  .twin-page.panel-closed {
    --sheet-space: 0px;
    height: auto;
    min-height: 0;
    overflow: visible;
    background: var(--background);
  }

  .twin-viewport {
    position: relative;
    height: 58vh;
    min-height: 340px;
    background: var(--night);
  }

  .twin-toolbar {
    top: 10px;
    left: 10px;
    right: 10px;
    gap: 6px;
  }

  .twin-scenery .segmented-control {
    display: none;
  }

  .twin-scenery-select {
    display: block;
  }

  .twin-scenery-select select {
    min-height: 34px;
    padding: 0 8px;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: 0.875rem;
    font-weight: var(--fw-bold);
    background: transparent;
  }

  .twin-legend {
    bottom: 10px;
    left: 10px;
    right: 10px;
    padding: 6px 10px;
  }

  .twin-legend p {
    display: none;
  }

  .twin-sheet,
  .twin-sheet.is-closed {
    position: static;
    width: auto;
    margin: 12px;
    box-shadow: none;
  }

  .twin-sheet-toggle {
    display: none;
  }

  .twin-sheet-body {
    display: block !important;
    padding: 16px;
    overflow: visible;
  }
}
</style>

<style>
/* Selos, pinos e a dica: criados pelo Three.js fora do Vue, por isso sem `scoped`. */
.twin-host canvas {
  display: block;
  touch-action: none;
}

/* O CSS2DRenderer dá z-index a cada marcador; o z-index aqui prende todos eles
   abaixo dos controles, do aviso de "sem dados" e do cartão. */
.twin-labels {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  pointer-events: none;
}

.twin-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 11px 4px 4px;
  border: var(--bw-strong) solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  font-family: var(--font);
  font-size: 0.8125rem;
  white-space: nowrap;
  background: var(--surface);
  box-shadow: 0 4px 14px rgba(10, 35, 55, 0.25);
  cursor: pointer;
  pointer-events: auto;
}

.twin-badge:hover {
  border-color: var(--accent);
}

.twin-badge strong {
  font-weight: var(--fw-heavy);
}

.twin-badge-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: var(--surface);
  background: var(--nivel-ok);
}

.twin-badge-icon svg,
.twin-pin svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.twin-badge-level {
  color: var(--muted);
  font-weight: var(--fw-bold);
}

.twin-badge-extra {
  padding-left: 7px;
  border-left: var(--bw) solid var(--line);
  color: var(--critico-ink);
  font-weight: var(--fw-heavy);
}

.twin-badge.level-atencao .twin-badge-icon {
  color: var(--atencao-ink);
  background: var(--nivel-atencao);
}

.twin-badge.level-critico {
  border-color: var(--nivel-critico);
}

.twin-badge.level-critico .twin-badge-icon {
  background: var(--nivel-critico);
}

.twin-badge.level-vazio .twin-badge-icon {
  color: var(--muted);
  border: var(--bw-strong) dashed var(--muted);
  background: var(--surface-2);
}

.twin-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 30px;
  min-height: 30px;
  margin-bottom: 8px;
  padding: 4px;
  border: 2px solid var(--surface);
  border-radius: 999px;
  font-family: var(--font);
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
  box-shadow: 0 3px 10px rgba(10, 35, 55, 0.35);
  cursor: pointer;
  pointer-events: auto;
}

.twin-pin.has-text {
  padding-right: 10px;
}

.twin-pin.level-atencao {
  color: var(--atencao-ink);
  background: var(--nivel-atencao);
}

.twin-pin.level-critico {
  color: var(--surface);
  background: var(--nivel-critico);
  animation: twin-pin-pulse 1.4s ease-in-out infinite;
}

.twin-pin.level-vazio {
  color: var(--muted);
  border: 2px dashed var(--muted);
  background: var(--surface);
}

/* O crítico pulsa pela sombra: a posição é do CSS2DRenderer. */
@keyframes twin-pin-pulse {
  50% {
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--nivel-critico) 35%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .twin-pin.level-critico {
    animation: none;
  }
}

@media (pointer: coarse) {
  .twin-pin {
    min-width: 40px;
    min-height: 40px;
  }
}

.twin-tooltip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  max-width: 340px;
  padding: 6px 11px;
  border-radius: 9px;
  overflow: hidden;
  color: var(--night-ink);
  font-family: var(--font);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--night);
  box-shadow: 0 6px 18px rgba(10, 35, 55, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
}

.twin-tooltip.is-visible {
  opacity: 1;
}

.twin-tooltip[data-level='atencao'] {
  box-shadow: inset 4px 0 0 var(--nivel-atencao), 0 6px 18px rgba(10, 35, 55, 0.35);
}

.twin-tooltip[data-level='critico'] {
  box-shadow: inset 4px 0 0 var(--nivel-critico), 0 6px 18px rgba(10, 35, 55, 0.35);
}
</style>
