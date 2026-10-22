<script setup lang="ts">
import { computed } from 'vue'
import RoleGate from './RoleGate.vue'
import { useActuatorCommand } from '../composables/useActuatorCommand'
import type { Device } from '../domain/devices'

/**
 * Uma linha de atuador (IOT-05): estado ao vivo, quem manda nele e o botão de
 * liga/desliga. Serve no dashboard e no painel do 3D (WEB-08).
 */
const props = defineProps<{
  device: Device
  /** Quantas vezes ligou no período, do histórico; `undefined` esconde. */
  turnOns?: number
  /** "na última hora", "nas últimas 6 horas"... */
  periodLabel?: string
}>()

const stateField = props.device.state_field ?? 'on'
const { current, pending, error, set } = useActuatorCommand(props.device.id, stateField)

// Atuador da regra não ganha botão: o comando manual brigaria com a regra.
const commandable = computed(() => props.device.commands.includes('on') && props.device.control !== 'rule')

const stateKey = computed(() => (current.value === null ? 'unknown' : current.value ? 'on' : 'off'))
const stateText = computed(() => ({ on: 'Ligado', off: 'Desligado', unknown: 'Sem dados' })[stateKey.value])

const controlText = computed(() => (props.device.control === 'rule' ? 'Automático, pela regra' : 'Manual'))

const turnOnsText = computed(() => {
  if (props.turnOns === undefined) return ''
  const times = props.turnOns === 1 ? 'vez' : 'vezes'
  return `ligou ${props.turnOns.toLocaleString('pt-BR')} ${times}${props.periodLabel ? ` ${props.periodLabel}` : ''}`
})

const actionLabel = computed(() => (current.value ? 'Desligar' : 'Ligar'))
</script>

<template>
  <li class="actuator">
    <div class="actuator-info">
      <strong>{{ device.name }}</strong>
      <span class="actuator-meta">
        {{ controlText }}<template v-if="turnOnsText"> · {{ turnOnsText }}</template>
      </span>
      <span v-if="pending" class="actuator-pending" role="status">Aguardando confirmação do dispositivo…</span>
      <span v-else-if="error" class="actuator-error" role="alert">{{ error }}</span>
    </div>

    <span :class="['actuator-state', `is-${stateKey}`]">
      <span class="actuator-dot" aria-hidden="true" />
      {{ stateText }}
    </span>

    <RoleGate v-if="commandable" permission="command">
      <button
        type="button"
        :class="['actuator-button', { 'is-secondary': current }]"
        :disabled="pending || current === null"
        :aria-label="`${actionLabel} ${device.name}`"
        @click="set(!current)"
      >
        <span v-if="pending" class="spinner actuator-spinner" aria-hidden="true" />
        {{ actionLabel }}
      </button>
    </RoleGate>
  </li>
</template>

<style scoped>
.actuator {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 11px 0;
  border-top: var(--bw) solid var(--line-soft);
}

.actuator-info {
  display: flex;
  min-width: 0;
  flex: 1 1 180px;
  flex-direction: column;
  gap: 1px;
}

.actuator-info strong {
  font-weight: var(--fw-heavy);
}

.actuator-meta {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.actuator-pending {
  color: var(--accent);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.actuator-error {
  color: var(--critico-ink);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.actuator-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 11px;
  border: var(--bw) solid transparent;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
}

.actuator-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.actuator-state.is-on {
  color: #ffffff;
  background: var(--accent);
}

.actuator-state.is-on .actuator-dot {
  background: #ffffff;
}

.actuator-state.is-off {
  color: var(--ink);
  border-color: var(--field);
  background: var(--surface);
}

.actuator-state.is-off .actuator-dot {
  border: 2px solid var(--ink);
}

.actuator-state.is-unknown {
  color: var(--muted);
  border-color: var(--line);
  border-style: dashed;
  background: var(--surface);
}

.actuator-state.is-unknown .actuator-dot {
  border: 2px dashed var(--muted);
}

.actuator-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 100px;
  min-height: 40px;
  padding: 0 14px;
  border: var(--bw) solid var(--night);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
  background: var(--night);
}

.actuator-button:hover:not(:disabled) {
  background: var(--night-2);
}

.actuator-button.is-secondary {
  color: var(--ink);
  border-color: var(--field);
  background: var(--surface);
}

.actuator-button.is-secondary:hover:not(:disabled) {
  background: var(--surface-2);
}

.actuator-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.actuator-spinner {
  width: 14px;
  height: 14px;
  border-width: 2px;
}
</style>
