<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Construction } from 'lucide-vue-next'
import LiveSnapshot from '../components/LiveSnapshot.vue'
import RoleGate from '../components/RoleGate.vue'

// Tela que ainda não existe: mostra o que ela vai ter e qual tarefa a constrói.
const route = useRoute()
const page = computed(() => route.meta.page)
</script>

<template>
  <main v-if="page" class="dashboard">
    <header class="page-header">
      <div>
        <span class="eyebrow">{{ page.group.toUpperCase() }}</span>
        <h2>{{ page.title }}</h2>
        <p v-if="page.description">{{ page.description }}</p>
      </div>

      <RoleGate v-if="page.action" :permission="page.action.permission">
        <button type="button" class="page-action" disabled :title="`Chega com a ${page.task}`">
          {{ page.action.label }}
        </button>
      </RoleGate>
    </header>

    <section class="panel placeholder">
      <Construction :size="22" aria-hidden="true" />
      <div>
        <strong>Tela em construção</strong>
        <span>
          Quem constrói esta tela é a tarefa <b>{{ page.task }}</b> do backlog
          (<code>docs/TAREFAS-2BIM.md</code>).
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header compact">
        <div>
          <span class="eyebrow">STORE AO VIVO</span>
          <h3>O que já está chegando</h3>
        </div>
      </div>
      <LiveSnapshot />
    </section>
  </main>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h2 {
  font-size: 1.55rem;
  letter-spacing: -0.03em;
}

.page-header p {
  max-width: 640px;
  margin-top: 6px;
  color: var(--muted);
}

.page-action {
  padding: 9px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--muted);
  font-weight: 650;
  background: var(--surface);
}

.page-action:disabled {
  cursor: not-allowed;
}

.placeholder {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  color: var(--muted);
}

.placeholder strong,
.placeholder span {
  display: block;
}

.placeholder strong {
  color: var(--ink);
}
</style>
