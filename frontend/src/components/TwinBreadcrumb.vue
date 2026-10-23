<script setup lang="ts">
import { computed } from 'vue'
import { UI_ICON } from '../icons'
import type { TwinFocus } from '../scene/focus'

/**
 * Onde a pessoa está no 3D: "Visão geral › Tanque 01 › Sonda de pH". Cada
 * nível acima é um botão que volta para ele.
 */
const props = defineProps<{
  focus: TwinFocus
  tankLabel: (zone: string) => string
  deviceName: (id: string) => string
}>()

const emit = defineEmits<{ go: [focus: TwinFocus] }>()

const steps = computed(() => {
  const list: Array<{ label: string; focus: TwinFocus }> = [{ label: 'Visão geral', focus: { level: 'overview' } }]
  const f = props.focus
  if (f.level !== 'overview') list.push({ label: props.tankLabel(f.tank), focus: { level: 'tank', tank: f.tank } })
  if (f.level === 'item') list.push({ label: props.deviceName(f.device), focus: f })
  return list
})
</script>

<template>
  <nav class="twin-crumbs" aria-label="Caminho no 3D">
    <ol>
      <li v-for="(step, i) in steps" :key="i">
        <component :is="UI_ICON.abrir" v-if="i > 0" :size="14" class="twin-crumb-sep" aria-hidden="true" />
        <span v-if="i === steps.length - 1" aria-current="location">
          <component :is="UI_ICON.visaoGeral" v-if="i === 0" :size="15" aria-hidden="true" />
          {{ step.label }}
        </span>
        <button v-else type="button" @click="emit('go', step.focus)">
          <component :is="UI_ICON.visaoGeral" v-if="i === 0" :size="15" aria-hidden="true" />
          {{ step.label }}
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.twin-crumbs ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.twin-crumbs li {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.twin-crumbs button,
.twin-crumbs span[aria-current] {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 220px;
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  overflow: hidden;
  color: var(--muted);
  font: inherit;
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
  white-space: nowrap;
  text-overflow: ellipsis;
  background: none;
}

.twin-crumbs button {
  cursor: pointer;
}

.twin-crumbs button:hover {
  color: var(--accent);
  background: var(--surface-2);
}

.twin-crumbs span[aria-current] {
  color: var(--ink);
  font-weight: var(--fw-heavy);
}

.twin-crumb-sep {
  color: var(--faint);
}
</style>
