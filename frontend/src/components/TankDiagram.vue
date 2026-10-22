<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Sinótico do tanque: o desenho em corte que as salas de controle usam para
 * mostrar o processo. Nada aqui é enfeite: a água fica na altura do nível
 * lido, as bolhas só aparecem com o aerador ligado, o rotor da bomba gira com
 * a recirculação funcionando e a água entra pelo cano quando a reposição liga.
 * `null` é "sem dados": a parte fica parada e o selo avisa.
 */
const props = defineProps<{
  tankId: string
  /** Nível da água, em %. */
  level: number | null
  aerator: boolean | null
  recirculation: boolean | null
  refill: boolean | null
}>()

// Altura útil do tanque no desenho: de y = 30 (100 %) a y = 262 (0 %).
const TOP = 30
const DEPTH = 232

const uid = useId()
const tankClip = `tank-inside-${uid}`
const waterClip = `tank-water-${uid}`

const levelPct = computed(() =>
  props.level === null || Number.isNaN(props.level) ? null : Math.min(100, Math.max(0, props.level)),
)

// A água é desenhada cheia e desce: transform anima suave entre leituras.
const waterOffset = computed(() => (1 - (levelPct.value ?? 0) / 100) * DEPTH)
const waterTop = computed(() => TOP + waterOffset.value)

const levelLabel = computed(() =>
  levelPct.value === null
    ? 'sem leitura'
    : `${levelPct.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
)

type ActuatorState = 'on' | 'off' | 'unknown'

function stateOf(value: boolean | null): ActuatorState {
  if (value === null) return 'unknown'
  return value ? 'on' : 'off'
}

const actuators = computed(() =>
  [
    { key: 'aerador', label: 'Aerador', feminine: false, value: props.aerator },
    { key: 'recirculacao', label: 'Recirculação', feminine: true, value: props.recirculation },
    { key: 'reposicao', label: 'Reposição', feminine: true, value: props.refill },
  ].map((item) => {
    const state = stateOf(item.value)
    const text =
      state === 'unknown'
        ? 'sem dados'
        : `${state === 'off' ? 'des' : ''}${item.feminine ? 'ligada' : 'ligado'}`
    return { ...item, state, text }
  }),
)

const description = computed(
  () =>
    `Tanque em corte: água em ${levelLabel.value}; ` +
    actuators.value.map((a) => `${a.label.toLowerCase()} ${a.text}`).join('; ') +
    '.',
)

// Bolhas do aerador: posição de saída e atraso de cada uma.
const BUBBLES = [
  { x: 306, r: 4, delay: 0 },
  { x: 318, r: 3, delay: 0.6 },
  { x: 309, r: 5, delay: 1.2 },
  { x: 320, r: 3.5, delay: 1.8 },
  { x: 310, r: 4, delay: 2.4 },
]
</script>

<template>
  <figure class="panel tank-panel">
    <div class="tank-head">
      <strong>{{ tankId }} em corte</strong>
      <span>muda com cada leitura</span>
    </div>

    <svg class="tank-svg" viewBox="-12 0 432 290" role="img" :aria-label="description">
      <defs>
        <clipPath :id="tankClip">
          <rect x="40" :y="TOP" width="315" :height="DEPTH" />
        </clipPath>
        <clipPath :id="waterClip">
          <rect x="40" :y="waterTop" width="315" :height="TOP + DEPTH - waterTop" />
        </clipPath>
      </defs>

      <!-- Água: desenhada cheia e deslocada para baixo conforme o nível. -->
      <g :clip-path="`url(#${tankClip})`">
        <g v-if="levelPct !== null" class="tank-water-group" :style="{ transform: `translateY(${waterOffset}px)` }">
          <path
            class="tank-water"
            d="M40 30 C 75 22, 110 38, 145 30 S 215 22, 250 30 S 320 38, 355 30 V 262 H 40 Z"
          />
          <g class="fish-swim fish-swim-a">
            <g transform="translate(176 72) scale(1.7)">
              <path class="tank-fish" d="M3 12 C7 4.5 17 4.5 22 12 C17 19.5 7 19.5 3 12 Z" />
              <path class="tank-fish" d="M22 12 L29 6.5 L27.5 12 L29 17.5 Z" />
              <circle class="tank-fish-eye" cx="8" cy="10.8" r="1.2" />
            </g>
          </g>
          <g class="fish-swim fish-swim-b">
            <g transform="translate(262 120) scale(-1.1 1.1)">
              <path class="tank-fish tank-fish-2" d="M3 12 C7 4.5 17 4.5 22 12 C17 19.5 7 19.5 3 12 Z" />
              <path class="tank-fish tank-fish-2" d="M22 12 L29 6.5 L27.5 12 L29 17.5 Z" />
              <circle class="tank-fish-eye" cx="8" cy="10.8" r="1.2" />
            </g>
          </g>
          <path class="tank-surface" d="M40 30 C 75 22, 110 38, 145 30 S 215 22, 250 30 S 320 38, 355 30" />
        </g>
      </g>

      <text v-if="levelPct === null" class="tank-empty" x="197" y="150" text-anchor="middle">
        Sem leitura de nível
      </text>

      <!-- Plantas e areia do fundo. -->
      <path class="tank-plant" d="M80 238 C 72 210, 90 190, 80 158" />
      <path class="tank-plant tank-plant-2" d="M92 238 C 100 214, 88 196, 102 170" />
      <path class="tank-plant tank-plant-2" d="M70 240 C 60 222, 66 208, 58 192" />
      <path class="tank-plant" d="M84 196 C 92 190, 98 192, 100 186" />
      <path class="tank-sand" d="M40 238 C 90 230, 150 244, 210 236 S 310 230, 355 238 V 262 H 40 Z" />
      <g class="tank-sand-dots">
        <circle cx="60" cy="252" r="2.2" />
        <circle cx="86" cy="247" r="1.8" />
        <circle cx="122" cy="254" r="2.2" />
        <circle cx="160" cy="248" r="1.7" />
        <circle cx="200" cy="253" r="2.2" />
        <circle cx="240" cy="246" r="1.8" />
        <circle cx="276" cy="252" r="2.2" />
        <circle cx="336" cy="253" r="2" />
      </g>

      <!-- Aerador: mangueira, pedra porosa e as bolhas, só quando ligado. -->
      <path class="tank-metal-line" d="M313 16 V 230" />
      <rect class="tank-metal" x="300" y="230" width="26" height="9" rx="4.5" />
      <g v-if="aerator" :clip-path="`url(#${waterClip})`">
        <circle
          v-for="bubble in BUBBLES"
          :key="bubble.x + '-' + bubble.delay"
          class="tank-bubble"
          :cx="bubble.x"
          cy="222"
          :r="bubble.r"
          :style="{ animationDelay: `${bubble.delay}s` }"
        />
      </g>

      <!-- Reposição: cano que entra por cima; com ela ligada, a água cai. -->
      <path :class="['tank-pipe', { 'is-active': refill }]" d="M4 16 H 70 V 40" />
      <path
        :class="['tank-valve', { 'is-open': refill }]"
        d="M22 9 L 34 16 L 22 23 Z M46 9 L 34 16 L 46 23 Z"
      />
      <line v-if="refill && levelPct !== null" class="tank-stream" x1="70" y1="40" x2="70" :y2="waterTop" />

      <!-- Vidro do tanque. -->
      <rect class="tank-glass" x="38" y="30" width="319" height="234" rx="6" />

      <!-- Recirculação: sai pelo fundo, passa pela bomba e volta por cima. -->
      <path :class="['tank-pipe', { 'is-active': recirculation }]" d="M357 238 H 392 V 196" />
      <path
        :class="['tank-pipe', { 'is-active': recirculation }]"
        d="M392 168 V 44 Q 392 26 376 26 H 352 Q 342 26 342 36 V 62"
      />
      <circle :class="['tank-pump', { 'is-active': recirculation }]" cx="392" cy="182" r="14" />
      <g :class="['tank-rotor', { 'is-spinning': recirculation }]">
        <path d="M392 173 L 392 191 M 383 182 L 401 182" />
      </g>

      <!-- Régua de nível e o marcador da leitura. -->
      <path class="tank-ticks" d="M20 30 H 34 M26 88 H 34 M26 146 H 34 M26 204 H 34 M20 262 H 34" />
      <text class="tank-tick-label" x="16" y="34" text-anchor="end">100</text>
      <text class="tank-tick-label" x="16" y="150" text-anchor="end">50</text>
      <text class="tank-tick-label" x="16" y="266" text-anchor="end">0</text>
      <g v-if="levelPct !== null" class="tank-water-group" :style="{ transform: `translateY(${waterOffset}px)` }">
        <path class="tank-marker" d="M27 23 L 38 30 L 27 37 Z" />
        <rect class="tank-level-pill" x="48" y="39" width="110" height="26" rx="13" />
        <text class="tank-level-text" x="103" y="56.5" text-anchor="middle">nível {{ levelLabel }}</text>
      </g>
    </svg>

    <ul class="tank-states" aria-label="Atuadores">
      <li v-for="item in actuators" :key="item.key" :class="['tank-state', `is-${item.state}`]">
        <span class="tank-state-dot" aria-hidden="true" />
        {{ item.label }} {{ item.text }}
      </li>
    </ul>
  </figure>
</template>

<style scoped>
.tank-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
}

.tank-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 8px;
}

.tank-head strong {
  font-size: 1rem;
  font-weight: 800;
}

.tank-head span {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.tank-svg {
  display: block;
  width: 100%;
  max-height: 280px;
}

.tank-water-group {
  transition: transform 0.8s ease;
}

.tank-water {
  fill: var(--water);
}

.tank-surface {
  fill: none;
  stroke: var(--water-line);
  stroke-width: 2.4;
}

.tank-fish {
  fill: var(--brand-fish);
}

.tank-fish-2 {
  fill: var(--fish-2);
}

.tank-fish-eye {
  fill: var(--ink);
}

.fish-swim {
  animation: swim 7s ease-in-out infinite alternate;
}

.fish-swim-b {
  animation-duration: 9s;
  animation-direction: alternate-reverse;
}

.tank-empty {
  fill: var(--muted);
  font-size: 15px;
  font-weight: 800;
}

.tank-plant {
  fill: none;
  stroke: var(--plant);
  stroke-width: 3.6;
  stroke-linecap: round;
}

.tank-plant-2 {
  stroke: var(--plant-2);
  stroke-width: 3.4;
}

.tank-sand {
  fill: var(--sand);
}

.tank-sand-dots {
  fill: var(--sand-dot);
}

.tank-metal-line {
  fill: none;
  stroke: var(--metal);
  stroke-width: 2.4;
}

.tank-metal {
  fill: var(--metal);
}

.tank-bubble {
  fill: #ffffff;
  stroke: var(--water-line);
  stroke-width: 1.8;
  animation: rise 3s linear infinite;
}

.tank-glass {
  fill: none;
  stroke: var(--ink);
  stroke-width: 3;
}

/* Cano parado é cinza; com a bomba funcionando, fica azul e a água corre. */
.tank-pipe {
  fill: none;
  stroke: var(--metal);
  stroke-width: 2.8;
}

.tank-pipe.is-active {
  stroke: var(--accent);
  stroke-width: 3.2;
  stroke-dasharray: 10 6;
  animation: flow 1s linear infinite;
}

.tank-valve {
  fill: var(--surface);
  stroke: var(--ink);
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.tank-valve.is-open {
  fill: var(--accent);
}

.tank-stream {
  stroke: var(--water-line);
  stroke-width: 4;
  stroke-dasharray: 8 6;
  animation: flow 0.6s linear infinite;
}

.tank-pump {
  fill: var(--surface);
  stroke: var(--metal);
  stroke-width: 2.8;
}

.tank-pump.is-active {
  stroke: var(--ink);
}

.tank-rotor path {
  fill: none;
  stroke: var(--metal);
  stroke-width: 2.6;
  stroke-linecap: round;
}

.tank-rotor.is-spinning {
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 1.2s linear infinite;
}

.tank-rotor.is-spinning path {
  stroke: var(--accent);
}

.tank-ticks {
  stroke: var(--muted);
  stroke-width: 1.8;
}

.tank-tick-label {
  fill: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.tank-marker {
  fill: var(--accent);
}

.tank-level-pill {
  fill: var(--surface);
  stroke: var(--ink);
  stroke-width: 1.5;
}

.tank-level-text {
  fill: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.tank-states {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tank-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 11px;
  border: 1.5px solid transparent;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 800;
}

.tank-state-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.tank-state.is-on {
  color: #ffffff;
  background: var(--accent);
}

.tank-state.is-on .tank-state-dot {
  background: #ffffff;
}

.tank-state.is-off {
  color: var(--ink);
  border-color: var(--field);
  background: var(--surface);
}

.tank-state.is-off .tank-state-dot {
  border: 2px solid var(--ink);
}

.tank-state.is-unknown {
  color: var(--muted);
  border-color: var(--line);
  border-style: dashed;
  background: var(--surface);
}

.tank-state.is-unknown .tank-state-dot {
  border: 2px dashed var(--muted);
}

@keyframes rise {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-120px);
  }
}

@keyframes flow {
  to {
    stroke-dashoffset: -16;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes swim {
  from {
    transform: translateX(-10px);
  }
  to {
    transform: translateX(10px);
  }
}

/* Sem animação, o estado continua visível: bolhas, cano azul e rotor azul. */
@media (prefers-reduced-motion: reduce) {
  .fish-swim,
  .tank-bubble,
  .tank-pipe.is-active,
  .tank-stream,
  .tank-rotor.is-spinning {
    animation: none;
  }
}
</style>
