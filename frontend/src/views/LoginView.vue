<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogIn } from 'lucide-vue-next'
import { ApiError } from '../api/http'
import { MOCK } from '../config'
import { MOCK_USERNAMES } from '../mock/auth'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const expiredNotice = computed(() => route.query.expirou === '1')

// Só volta para caminhos do próprio app: um `?redirect=//site-qualquer`
// levaria a pessoa para fora depois do login.
const redirectTarget = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/dashboard'
})

async function submit() {
  if (loading.value) return
  error.value = null
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    await router.replace(redirectTarget.value)
  } catch (err) {
    error.value = loginErrorMessage(err)
  } finally {
    loading.value = false
  }
}

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Usuário ou senha inválidos.'
    if (err.status === 429) return 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.'
    return err.message
  }
  // O fetch lança TypeError quando nem chega ao servidor.
  if (err instanceof TypeError) return 'Não foi possível falar com o servidor.'
  return err instanceof Error ? err.message : 'Não foi possível entrar.'
}

function quickLogin(name: string) {
  username.value = name
  password.value = 'mock'
  void submit()
}
</script>

<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <div class="login-brand">
        <span class="brand-mark">TV</span>
        <div>
          <strong>TankVitals</strong>
          <small>Monitoramento do tanque e da bomba</small>
        </div>
      </div>

      <h1>Entrar</h1>

      <p v-if="expiredNotice" class="login-notice">Sua sessão expirou. Entre de novo para continuar.</p>

      <label class="field">
        <span>Usuário</span>
        <input v-model="username" name="username" autocomplete="username" required autofocus />
      </label>

      <label class="field">
        <span>Senha</span>
        <input
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>

      <p v-if="error" class="login-error" role="alert">{{ error }}</p>

      <button type="submit" class="login-submit" :disabled="loading">
        <LogIn :size="17" aria-hidden="true" />
        {{ loading ? 'Entrando…' : 'Entrar' }}
      </button>

      <div v-if="MOCK" class="login-mock">
        <strong>Modo simulado</strong>
        <span>O backend ainda não tem login (BACK-03). Entre com um dos papéis de teste:</span>
        <div class="login-mock-users">
          <button v-for="name in MOCK_USERNAMES" :key="name" type="button" @click="quickLogin(name)">
            {{ name }}
          </button>
        </div>
      </div>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  padding: 24px 16px;
  place-items: center;
}

.login-card {
  display: flex;
  width: min(100%, 390px);
  flex-direction: column;
  gap: 16px;
  padding: 30px 28px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-brand strong,
.login-brand small {
  display: block;
}

.login-brand small {
  color: var(--muted);
  font-size: 0.78rem;
}

.login-card h1 {
  margin-top: 6px;
  font-size: 1.4rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
}

.field input {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  background: var(--surface);
}

.field input:focus {
  border-color: var(--nivel-ok);
  outline: 2px solid rgba(21, 127, 120, 0.18);
}

.login-notice,
.login-error {
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.login-notice {
  color: #92400e;
  background: rgba(217, 119, 6, 0.1);
}

.login-error {
  color: #b91c1c;
  background: rgba(220, 38, 38, 0.08);
}

.login-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px;
  border: 0;
  border-radius: 10px;
  color: white;
  font-weight: 700;
  background: linear-gradient(145deg, #0d9488, #145e69);
}

.login-submit:disabled {
  cursor: progress;
  opacity: 0.7;
}

.login-mock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  color: #1f5fae;
  font-size: 0.8rem;
  line-height: 1.4;
  background: rgba(42, 120, 214, 0.08);
}

.login-mock-users {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.login-mock-users button {
  padding: 5px 11px;
  border: 1px solid rgba(42, 120, 214, 0.35);
  border-radius: 999px;
  color: #1f5fae;
  font-size: 0.8rem;
  font-weight: 650;
  background: var(--surface);
}
</style>
