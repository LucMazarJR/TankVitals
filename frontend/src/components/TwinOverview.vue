<script setup lang="ts">
import { computed } from 'vue'
import { healthLevel } from '../alerts'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import type { TankSummary } from '../composables/useTwinTanks'
import { fieldIcon, LEVEL_ICON, UI_ICON } from '../icons'
import type { Binding } from '../plant/tanks'

/**
 * A visão geral do 3D: um cartão por tanque, com o estado, quantos itens
 * publicam e as leituras que mais importam, e a lista do que está fora do
 * normal em qualquer tanque. Clicar abre o tanque (e a câmera voa até ele).
 */
const props = defineProps<{
  tanks: TankSummary[]
  insight: (deviceId: string) => { health: number; rul_h: number | null } | null
}>()

const emit = defineEmits<{ tank: [zone: string]; item: [zone: string, deviceId: string] }>()

const { value } = useLiveValues()

const KEY_READINGS = [
  ['temperature', 'Temp.'],
  ['oxygen', 'OD'],
  ['level', 'Nível'],
  ['ph', 'pH'],
] as const

function reading(tank: TankSummary, binding: Binding | null) {
  if (!binding) return null
  const field = tank.spec.members.find((m) => m.device.id === binding.device)?.device.fields.find((f) => f.key === binding.field)
  if (!field) return null
  const current = value(binding.device, binding.field)
  const text =
    current === null
      ? '—'
      : current.toLocaleString('pt-BR', { minimumFractionDigits: field.decimals, maximumFractionDigits: field.decimals })
  return { icon: fieldIcon(field.key), text, unit: field.unit === field.short ? '' : field.unit }
}

const cards = computed(() =>
  props.tanks.map((tank) => {
    const prediction = tank.pump ? props.insight(tank.pump.id) : null
    return {
      tank,
      readings: KEY_READINGS.map(([key, label]) => ({ key, label, value: reading(tank, tank.spec.bindings[key]) })).filter(
        (r) => r.value !== null,
      ),
      health: prediction ? { value: Math.round(prediction.health), level: healthLevel(prediction.health, prediction.rul_h) } : null,
    }
  }),
)

const problems = computed(() =>
  props.tanks.flatMap((tank) => tank.notOk.map((item) => ({ zone: tank.spec.id, label: tank.spec.label, ...item }))),
)

const items = computed(() => props.tanks.reduce((sum, tank) => sum + tank.total, 0))

function icon(level: ItemLevel) {
  return level === 'vazio' ? UI_ICON.semDado : LEVEL_ICON[level]
}
</script>

<template>
  <section class="overview" aria-labelledby="visao-geral">
    <header class="overview-head">
      <h3 id="visao-geral">Visão geral</h3>
      <p>
        {{ tanks.length }} {{ tanks.length === 1 ? 'tanque' : 'tanques' }} · {{ items }} itens ·
        {{ problems.length ? `${problems.length} fora do normal` : 'tudo normal' }}
      </p>
    </header>

    <ul class="overview-tanks">
      <li v-for="card in cards" :key="card.tank.spec.id">
        <button type="button" class="overview-tank" @click="emit('tank', card.tank.spec.id)">
          <span class="overview-tank-head">
            <component :is="UI_ICON.tanque" :size="18" aria-hidden="true" />
            <strong>{{ card.tank.spec.label }}</strong>
            <span :class="['table-level', `badge-${card.tank.level}`]">
              <component :is="icon(card.tank.level)" :size="12" aria-hidden="true" />
              {{ ITEM_LEVEL_TEXT[card.tank.level] }}
            </span>
          </span>
          <span v-if="card.readings.length" class="overview-readings">
            <span v-for="r in card.readings" :key="r.key">
              <small><component :is="r.value!.icon" :size="12" aria-hidden="true" /> {{ r.label }}</small>
              <b>{{ r.value!.text }}<i v-if="r.value!.unit && r.value!.text !== '—'"> {{ r.value!.unit }}</i></b>
            </span>
          </span>
          <span class="overview-tank-foot">
            <span>{{ card.tank.online }} de {{ card.tank.total }} publicando</span>
            <span v-if="card.health">bomba <b :class="`text-${card.health.level}`">{{ card.health.value }} %</b></span>
            <span class="overview-open">Ver tanque <component :is="UI_ICON.abrir" :size="14" aria-hidden="true" /></span>
          </span>
        </button>
      </li>
    </ul>

    <section v-if="problems.length" class="overview-problems">
      <h4>Fora do normal</h4>
      <ul>
        <li v-for="p in problems" :key="p.device.id">
          <button type="button" @click="emit('item', p.zone, p.device.id)">
            <component :is="icon(p.level)" :size="15" aria-hidden="true" />
            <span>{{ p.device.name }} <small>{{ p.label }}</small></span>
            <span :class="['table-level', `badge-${p.level}`]">{{ ITEM_LEVEL_TEXT[p.level] }}</span>
          </button>
        </li>
      </ul>
    </section>

    <p class="small-note">Clique num tanque, na cena ou aqui, para ver as estatísticas do aquário.</p>
  </section>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.overview-head h3 {
  font-size: 1.1875rem;
  font-weight: var(--fw-heavy);
}

.overview-head p {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.overview-tanks,
.overview-problems ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.overview-tank {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: var(--bw-strong) solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  text-align: left;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s;
}

.overview-tank:hover {
  border-color: var(--accent);
}

.overview-tank-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.overview-tank-head > svg {
  color: var(--brand-fish);
}

.overview-tank-head strong {
  flex: 1;
  font-size: 1rem;
  font-weight: var(--fw-heavy);
}

.overview-tank-head .table-level {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.overview-readings {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.overview-readings > span {
  display: flex;
  flex-direction: column;
  padding: 6px 7px;
  border-radius: 8px;
  background: var(--surface-2);
}

.overview-readings small {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--muted);
  font-size: 0.6875rem;
  font-weight: var(--fw-bold);
}

.overview-readings b {
  font-size: 0.9375rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
}

.overview-readings i {
  color: var(--muted);
  font-size: 0.6875rem;
  font-style: normal;
}

.overview-tank-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.overview-tank-foot b {
  color: var(--ink);
}

.overview-tank-foot .text-critico {
  color: var(--critico-ink);
}

.overview-tank-foot .text-atencao {
  color: var(--atencao-text);
}

.overview-open {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  color: var(--accent);
  font-weight: var(--fw-heavy);
}

.overview-problems h4 {
  margin: 0 0 8px;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
}

.overview-problems button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: var(--bw) solid var(--line-soft);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
  text-align: left;
  background: var(--surface);
  cursor: pointer;
}

.overview-problems button:hover {
  border-color: var(--accent);
}

.overview-problems button > span:first-of-type {
  flex: 1;
  min-width: 0;
}

.overview-problems small {
  color: var(--muted);
  font-weight: 600;
}
</style>
