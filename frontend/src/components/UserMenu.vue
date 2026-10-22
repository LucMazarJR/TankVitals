<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { ChevronUp, LogOut } from 'lucide-vue-next'
import { usePreferences, type Contrast } from '../composables/usePreferences'
import { ROLE_LABEL, useAuthStore } from '../stores/auth'

/**
 * Menu do usuário, no rodapé do menu lateral: quem está logado, as
 * preferências de exibição e o "Sair". Opção nova de conta ou de exibição
 * entra aqui, numa seção, sem mexer no resto do layout.
 */
const auth = useAuthStore()
const preferences = usePreferences()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panelId = `user-menu-${useId()}`

const roleLabel = computed(() => (auth.role ? ROLE_LABEL[auth.role] : ''))
const initials = computed(() => (auth.username ?? '?').slice(0, 2).toUpperCase())

const CONTRAST_OPTIONS: Array<{ value: Contrast; label: string }> = [
  { value: 'padrao', label: 'Padrão' },
  { value: 'alto', label: 'Alto' },
]

function close(returnFocus = false) {
  open.value = false
  if (returnFocus) void nextTick(() => trigger.value?.focus())
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) close()
}

function onKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') close(true)
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
  <div ref="root" class="user-menu">
    <button
      ref="trigger"
      type="button"
      class="user-trigger"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="avatar" aria-hidden="true">{{ initials }}</span>
      <span class="user-text">
        <strong>{{ auth.username }}</strong>
        <span>{{ roleLabel }}</span>
      </span>
      <ChevronUp :size="16" :class="['chevron', { 'is-open': open }]" aria-hidden="true" />
    </button>

    <div v-if="open" :id="panelId" class="user-panel">
      <section class="panel-section" aria-labelledby="user-menu-aparencia">
        <h2 id="user-menu-aparencia">Aparência</h2>
        <fieldset class="setting">
          <legend>Contraste</legend>
          <div class="segmented">
            <label v-for="option in CONTRAST_OPTIONS" :key="option.value">
              <input v-model="preferences.contrast" type="radio" name="contrast" :value="option.value" />
              <span>{{ option.label }}</span>
            </label>
          </div>
          <p class="setting-help">O alto reforça bordas, cores e textos. Ajuda em telas com pouco brilho.</p>
        </fieldset>
      </section>

      <button type="button" class="logout" @click="auth.logout()">
        <LogOut :size="16" aria-hidden="true" />
        Sair
      </button>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 6px 8px;
  border: var(--bw) solid transparent;
  border-radius: var(--radius-sm);
  color: var(--night-ink);
  text-align: left;
  background: transparent;
}

.user-trigger:hover,
.user-trigger[aria-expanded='true'] {
  border-color: var(--night-line);
  background: var(--night-2);
}

.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 50%;
  color: var(--night);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  background: var(--night-ink);
}

.user-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  line-height: 1.25;
}

.user-text strong {
  overflow: hidden;
  font-weight: var(--fw-heavy);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-text span {
  color: var(--night-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.chevron {
  flex: 0 0 auto;
  color: var(--night-muted);
  transition: transform 0.15s ease;
}

.chevron:not(.is-open) {
  transform: rotate(180deg);
}

/* Abre para cima, na largura do rodapé do menu. */
.user-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 10px 28px rgba(10, 35, 55, 0.28);
}

.panel-section {
  padding: 12px 14px 14px;
}

.panel-section h2 {
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
}

.setting {
  margin: 0;
  padding: 0;
  border: 0;
}

.setting legend {
  margin-bottom: 6px;
  padding: 0;
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
}

.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.segmented label {
  position: relative;
  flex: 1;
}

/* O rádio continua no lugar (teclado e leitor de tela); só o desenho muda. */
.segmented input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.segmented span {
  display: grid;
  place-items: center;
  min-height: 34px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
}

.segmented input:checked + span {
  color: #ffffff;
  background: var(--night);
}

.segmented input:focus-visible + span {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}

.setting-help {
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1.4;
}

.logout {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-top: var(--bw) solid var(--line-soft);
  color: var(--ink);
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
  text-align: left;
  background: transparent;
}

.logout:hover {
  background: var(--surface-2);
}
</style>
