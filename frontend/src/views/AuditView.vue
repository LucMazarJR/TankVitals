<script setup lang="ts">
// Tela Auditoria (WEB-04), só para o admin: logins, comandos, mudanças no
// cadastro, jobs e perguntas ao assistente, do PostgreSQL. A página 1 se
// renova sozinha, para um comando dado agora aparecer sem recarregar.
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { Bot, ChevronLeft, ChevronRight, ClipboardPen, LogIn, RefreshCw, Send, Workflow } from 'lucide-vue-next'
import { getAudit } from '../api/audit'
import { ApiError } from '../api/http'
import { formatAge } from '../composables/useDeviceState'
import { useNow } from '../composables/useNow'
import { AUDIT_TYPE_LABEL, auditActionLabel, type AuditEntry, type AuditType } from '../domain/audit'
import { LEVEL_ICON } from '../icons'
import { MOCK_USERNAMES } from '../mock/auth'

const PAGE_SIZE = 25
const REFRESH_MS = 10_000

const TYPE_ICON: Record<AuditType, Component> = {
  login: LogIn,
  command: Send,
  registry: ClipboardPen,
  job: Workflow,
  assistant: Bot,
}

const TYPES = Object.keys(AUDIT_TYPE_LABEL) as AuditType[]

const now = useNow()
const type = ref<AuditType | null>(null)
const userText = ref('')
const user = ref('')
const page = ref(1)

const items = ref<AuditEntry[]>([])
const total = ref(0)
/** Hora da última busca boa, para o aviso de que a lista se renova sozinha. */
const loadedAt = ref<Date | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
let request = 0

async function load(): Promise<void> {
  const current = ++request
  try {
    const result = await getAudit({
      page: page.value,
      page_size: PAGE_SIZE,
      type: type.value ?? undefined,
      user: user.value || undefined,
    })
    // Uma resposta atrasada de outro filtro não sobrescreve a atual.
    if (current !== request) return
    items.value = result.items
    total.value = result.total
    loadedAt.value = new Date()
    error.value = null
  } catch (err) {
    if (current !== request) return
    if (err instanceof ApiError && err.status === 403) error.value = 'Só o administrador vê a auditoria.'
    else error.value = err instanceof Error ? err.message : 'Não foi possível carregar a auditoria.'
  } finally {
    if (current === request) loading.value = false
  }
}

// Trocar o filtro volta para a página 1.
watch([type, user], () => {
  page.value = 1
  loading.value = true
  void load()
})
watch(page, () => {
  loading.value = true
  void load()
})

// O usuário filtra depois de uma pausa na digitação, não a cada letra.
let typing: number | undefined
watch(userText, (text) => {
  window.clearTimeout(typing)
  typing = window.setTimeout(() => {
    user.value = text.trim().toLowerCase()
  }, 350)
})

let timer: number | undefined
onMounted(() => {
  void load()
  timer = window.setInterval(() => {
    if (page.value === 1) void load()
  }, REFRESH_MS)
})
onUnmounted(() => {
  window.clearInterval(timer)
  window.clearTimeout(typing)
})

/** Sugestões do filtro: os usuários de demonstração e quem aparece na página. */
const knownUsers = computed(() => [...new Set([...MOCK_USERNAMES, ...items.value.map((entry) => entry.user)])].sort())

const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const rangeText = computed(() => {
  if (!total.value) return 'nenhum registro'
  const first = (page.value - 1) * PAGE_SIZE + 1
  const last = Math.min(total.value, page.value * PAGE_SIZE)
  return `${first}–${last} de ${total.value.toLocaleString('pt-BR')}`
})

function when(entry: AuditEntry): { time: string; ago: string } {
  const at = new Date(entry.ts)
  return {
    time: at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ago: formatAge(Math.max(0, Math.round((now.value - at.getTime()) / 1000))),
  }
}

/** "Hoje", "Ontem" ou "21/10, terça": o cabeçalho de cada dia na tabela. */
function dayLabel(at: Date): string {
  const today = new Date(now.value)
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(today) - start(at)) / 86_400_000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' })
}

/** As linhas da página agrupadas por dia, na ordem em que vieram (mais novas primeiro). */
const days = computed(() => {
  const groups: Array<{ label: string; entries: AuditEntry[] }> = []
  for (const entry of items.value) {
    const label = dayLabel(new Date(entry.ts))
    const last = groups[groups.length - 1]
    if (last?.label === label) last.entries.push(entry)
    else groups.push({ label, entries: [entry] })
  }
  return groups
})

/** "operador" → "OP"; "joao.silva" → "JS". */
function initials(name: string): string {
  const parts = name.split(/[.\s_-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}

const loadedText = computed(() =>
  loadedAt.value ? loadedAt.value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null,
)
</script>

<template>
  <main class="dashboard">
    <header class="page-header">
      <div>
        <h2>Auditoria</h2>
        <p>
          Quem fez o quê e quando: logins (certos e errados), comandos aos dispositivos, mudanças no cadastro, jobs
          da IA e perguntas ao assistente. Fica gravado no PostgreSQL.
        </p>
      </div>
    </header>

    <section class="panel">
      <div class="panel-header audit-filters">
        <div class="type-filter" role="group" aria-label="Filtrar por tipo">
          <button type="button" :aria-pressed="type === null" :class="{ active: type === null }" @click="type = null">
            Todos
          </button>
          <button
            v-for="item in TYPES"
            :key="item"
            type="button"
            :aria-pressed="type === item"
            :class="{ active: type === item }"
            @click="type = item"
          >
            <component :is="TYPE_ICON[item]" :size="15" aria-hidden="true" />
            {{ AUDIT_TYPE_LABEL[item] }}
          </button>
        </div>

        <div class="audit-tools">
          <label class="form-field user-filter">
            Usuário
            <input v-model="userText" list="audit-users" autocomplete="off" spellcheck="false" placeholder="todos" />
          </label>
          <datalist id="audit-users">
            <option v-for="name in knownUsers" :key="name" :value="name" />
          </datalist>
          <button type="button" class="button refresh" :disabled="loading" @click="load">
            <RefreshCw :size="16" aria-hidden="true" />
            Atualizar
          </button>
        </div>
      </div>

      <p v-if="loadedText" class="small-note audit-live">
        <span class="audit-live-dot" aria-hidden="true" />
        {{ page === 1 ? 'A primeira página se atualiza sozinha a cada 10 s' : 'Volte à primeira página para ver o que acabou de acontecer' }}
        · atualizado às {{ loadedText }}
      </p>

      <div v-if="error" class="error-state">
        <component :is="LEVEL_ICON.critico" :size="22" aria-hidden="true" />
        <strong>Não foi possível carregar a auditoria</strong>
        <span>{{ error }}</span>
      </div>

      <div v-else-if="loading && !items.length" class="loading-state">
        <span class="spinner" />
        Carregando a auditoria…
      </div>

      <div v-else-if="!items.length" class="chart-empty">
        <strong>Nenhum registro</strong>
        <span>Nada com esse filtro. Tente outro tipo ou apague o usuário.</span>
      </div>

      <div v-else class="audit-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Usuário</th>
              <th scope="col">Tipo</th>
              <th scope="col">O que aconteceu</th>
              <th scope="col">Resultado</th>
            </tr>
          </thead>
          <tbody v-for="day in days" :key="day.label">
            <tr class="audit-day">
              <th colspan="5" scope="rowgroup">{{ day.label }}</th>
            </tr>
            <tr v-for="entry in day.entries" :key="entry.id" :class="{ 'is-refused': !entry.ok }">
              <td class="audit-when">
                <strong>{{ when(entry).time }}</strong>
                <small>{{ when(entry).ago }}</small>
              </td>
              <td>
                <button type="button" class="user-link" :title="`Só os registros de ${entry.user}`" @click="userText = entry.user">
                  <span class="avatar" aria-hidden="true">{{ initials(entry.user) }}</span>
                  {{ entry.user }}
                </button>
              </td>
              <td>
                <span :class="['audit-type', `type-${entry.type}`]">
                  <span class="audit-type-icon"><component :is="TYPE_ICON[entry.type]" :size="14" aria-hidden="true" /></span>
                  {{ AUDIT_TYPE_LABEL[entry.type] }}
                </span>
              </td>
              <td class="audit-what">
                <strong>{{ auditActionLabel(entry.action) }}</strong>
                <code v-if="entry.target">{{ entry.target }}</code>
                <small v-if="entry.detail">{{ entry.detail }}</small>
              </td>
              <td>
                <span v-if="entry.ok" class="table-level badge-ok">
                  <component :is="LEVEL_ICON.ok" :size="12" aria-hidden="true" />
                  Certo
                </span>
                <span v-else class="table-level badge-critico">
                  <component :is="LEVEL_ICON.critico" :size="12" aria-hidden="true" />
                  Recusado
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav v-if="total > PAGE_SIZE" class="audit-pages" aria-label="Páginas da auditoria">
        <span class="small-note">{{ rangeText }}</span>
        <div>
          <button type="button" class="button" :disabled="page <= 1" @click="page -= 1">
            <ChevronLeft :size="16" aria-hidden="true" />
            Anterior
          </button>
          <button type="button" class="button" :disabled="page >= pages" @click="page += 1">
            Próxima
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </div>
      </nav>
      <p v-else-if="total" class="small-note audit-count">{{ rangeText }}</p>
    </section>
  </main>
</template>

<style scoped>
.audit-filters {
  align-items: flex-end;
  padding-top: 12px;
  padding-bottom: 12px;
}

.type-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.type-filter button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: var(--bw) solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
  background: var(--surface);
}

.type-filter button:hover {
  color: var(--ink);
  border-color: var(--field);
}

.type-filter button.active {
  color: var(--surface);
  border-color: var(--night);
  font-weight: var(--fw-heavy);
  background: var(--night);
}

.audit-tools {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.user-filter {
  width: 170px;
}

.audit-wrap {
  overflow-x: auto;
}

.audit-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.audit-table th,
.audit-table td {
  padding: 10px;
  border-bottom: 1px solid var(--line-soft);
  text-align: left;
  vertical-align: top;
}

.audit-table thead th {
  border-bottom: var(--bw-strong) solid var(--line);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

.audit-table td {
  font-weight: 600;
}

.audit-when strong,
.audit-when small {
  display: block;
  white-space: nowrap;
}

.audit-when strong {
  font-weight: var(--fw-bold);
}

.audit-when small,
.audit-what small {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.user-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  color: var(--accent);
  font-weight: var(--fw-heavy);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: transparent;
}

.avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--night-ink);
  font-size: 0.6875rem;
  font-weight: var(--fw-heavy);
  text-decoration: none;
  background: var(--night);
}

.audit-type {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.audit-type-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: var(--accent);
  background: var(--surface-2);
}

.type-login .audit-type-icon {
  color: var(--accent);
}

.type-command .audit-type-icon {
  color: var(--brand-fish);
}

.type-registry .audit-type-icon {
  color: var(--plant);
}

.type-job .audit-type-icon {
  color: var(--night);
}

.type-assistant .audit-type-icon {
  color: var(--fish-3);
}

/* Cabeçalho de cada dia: separa a tabela sem repetir a data em toda linha. */
.audit-day th {
  padding: 14px 10px 6px;
  border-bottom: var(--bw) solid var(--line);
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  text-transform: capitalize;
  background: var(--surface);
}

.audit-live {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -6px 0 6px;
}

.audit-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--nivel-ok);
}

.audit-what strong {
  margin-right: 8px;
  font-weight: var(--fw-heavy);
}

.audit-what code {
  color: var(--muted);
  font-size: 0.8125rem;
}

.audit-what small {
  display: block;
  margin-top: 2px;
}

/* Recusado: a linha ganha uma faixa na borda, além do selo escrito. */
.is-refused td:first-child {
  box-shadow: inset 4px 0 0 var(--nivel-critico);
}

.audit-pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
}

.audit-pages div {
  display: flex;
  gap: 8px;
}

.audit-count {
  margin-top: 12px;
}

@media (max-width: 700px) {
  .audit-tools {
    width: 100%;
  }

  .user-filter {
    flex: 1;
  }
}
</style>
