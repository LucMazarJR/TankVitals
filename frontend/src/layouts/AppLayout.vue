<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { LogOut, Menu, X } from 'lucide-vue-next'
import BrandMark from '../components/BrandMark.vue'
import { MOCK } from '../config'
import { LIVE_STATUS_LABEL } from '../live/socket'
import { MENU_GROUPS, PAGES } from '../router/pages'
import { ROLE_LABEL, useAuthStore } from '../stores/auth'
import { useLiveStore } from '../stores/live'

const auth = useAuthStore()
const live = useLiveStore()
const route = useRoute()
const menuOpen = ref(false)

// O menu só mostra o que o papel da pessoa pode abrir.
const groups = computed(() =>
  MENU_GROUPS.map((group) => ({
    group,
    pages: PAGES.filter(
      (page) => page.group === group && (!page.permission || auth.can(page.permission)),
    ),
  })).filter((entry) => entry.pages.length > 0),
)

const roleLabel = computed(() => (auth.role ? ROLE_LABEL[auth.role] : ''))

// No celular o menu vira gaveta; trocar de tela fecha a gaveta.
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

// A conexão ao vivo dura enquanto a pessoa está logada, não por tela: trocar
// de página não derruba o WebSocket.
onMounted(() => live.connect())
onUnmounted(() => live.disconnect())
</script>

<template>
  <div class="layout" :class="{ 'menu-open': menuOpen }">
    <aside class="sidebar">
      <div class="sidebar-top">
        <RouterLink :to="{ name: 'dashboard' }" class="brand">
          <BrandMark :size="38" />
          <span>
            <strong>TankVitals</strong>
            <small>Tanque e bomba ao vivo</small>
          </span>
        </RouterLink>

        <button
          type="button"
          class="menu-toggle"
          :aria-expanded="menuOpen"
          :aria-label="menuOpen ? 'Fechar menu' : 'Abrir menu'"
          @click="menuOpen = !menuOpen"
        >
          <component :is="menuOpen ? X : Menu" :size="20" aria-hidden="true" />
        </button>
      </div>

      <nav class="nav" aria-label="Telas">
        <div v-for="entry in groups" :key="entry.group" class="nav-group">
          <span class="nav-group-title">{{ entry.group }}</span>
          <RouterLink
            v-for="page in entry.pages"
            :key="page.name"
            :to="{ name: page.name }"
            class="nav-link"
            active-class="active"
          >
            <component :is="page.icon" :size="17" aria-hidden="true" />
            {{ page.title }}
          </RouterLink>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="live-state" :class="`live-${live.status}`">
          <span class="live-state-dot" />
          {{ LIVE_STATUS_LABEL[live.status] }}
        </div>

        <div class="user">
          <div class="user-info">
            <strong>{{ auth.username }}</strong>
            <span class="role-chip">{{ roleLabel }}</span>
          </div>
          <button type="button" class="logout" @click="auth.logout()">
            <LogOut :size="16" aria-hidden="true" />
            Sair
          </button>
        </div>

        <p v-if="MOCK" class="mock-note">
          Modo simulado: o login e os dados ao vivo são gerados no navegador.
        </p>
      </div>
    </aside>

    <div class="content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100vh;
  padding: 20px 14px 16px;
  overflow-y: auto;
  background: var(--surface);
  border-right: 1px solid var(--line);
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 6px;
  color: inherit;
  text-decoration: none;
}

.brand strong,
.brand small {
  display: block;
}

.brand strong {
  font-size: 0.98rem;
  letter-spacing: -0.02em;
}

.brand small {
  color: var(--muted);
  font-size: 0.72rem;
}

.menu-toggle {
  display: none;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  background: var(--surface);
}

.nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group-title {
  padding: 0 10px 5px;
  color: var(--muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 9px;
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 550;
  text-decoration: none;
}

.nav-link svg {
  flex: 0 0 auto;
  color: var(--muted);
}

.nav-link:hover {
  background: var(--background);
}

.nav-link.active {
  color: var(--nivel-ok);
  font-weight: 700;
  background: rgba(21, 127, 120, 0.1);
}

.nav-link.active svg {
  color: currentColor;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.live-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 650;
}

.live-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9aa6af;
}

.live-live {
  color: var(--nivel-ok);
}

.live-live .live-state-dot {
  background: var(--nivel-ok);
}

.live-simulated .live-state-dot {
  background: var(--serie-1);
}

.live-connecting .live-state-dot,
.live-reconnecting .live-state-dot {
  background: var(--nivel-atencao);
}

.user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 6px;
}

.user-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.user-info strong {
  overflow: hidden;
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-chip {
  align-self: flex-start;
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--background);
}

.logout {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 650;
  background: var(--surface);
}

.logout:hover {
  background: var(--background);
}

.mock-note {
  padding: 8px 10px;
  border-radius: 9px;
  color: #1f5fae;
  font-size: 0.72rem;
  line-height: 1.4;
  background: rgba(42, 120, 214, 0.08);
}

.content {
  min-width: 0;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    /* Altura da barra do topo, para a barra de status do dashboard grudar logo abaixo. */
    --app-top-offset: 59px;
  }

  .sidebar {
    z-index: 20;
    gap: 0;
    height: auto;
    max-height: 100vh;
    padding: 10px 14px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .menu-toggle {
    display: grid;
  }

  .nav,
  .sidebar-footer {
    display: none;
  }

  .menu-open .nav,
  .menu-open .sidebar-footer {
    display: flex;
  }

  .menu-open .nav {
    margin: 16px 0;
  }
}
</style>
