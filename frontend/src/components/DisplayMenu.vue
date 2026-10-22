<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { useContrast } from '../composables/useContrast'

// Menu pequeno de exibição, no rodapé do menu lateral. Por enquanto só tem o
// contraste; o alto é para o projetor da apresentação.
const { contrast } = useContrast()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panelId = `display-menu-${useId()}`

function close() {
  open.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) close()
}

function onKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="display-menu">
    <button
      type="button"
      class="display-toggle"
      aria-label="Opções de exibição"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <SlidersHorizontal :size="16" aria-hidden="true" />
    </button>

    <div v-if="open" :id="panelId" class="display-panel">
      <fieldset>
        <legend>Contraste</legend>
        <label>
          <input v-model="contrast" type="radio" name="contrast" value="natural" />
          Natural
        </label>
        <label>
          <input v-model="contrast" type="radio" name="contrast" value="alto" />
          Alto, para projetor
        </label>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
/* Sem posição própria: o painel se ancora na linha do usuário, que é larga. */
.display-menu {
  position: static;
}

.display-toggle {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: var(--bw) solid var(--night-line);
  border-radius: var(--radius-sm);
  color: var(--night-ink);
  background: transparent;
}

.display-toggle:hover,
.display-toggle[aria-expanded='true'] {
  background: var(--night-2);
}

/* Abre para cima: o botão fica no rodapé do menu. */
.display-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  padding: 12px 14px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(15, 53, 80, 0.25);
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 4px;
  padding: 0;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--night);
}
</style>
