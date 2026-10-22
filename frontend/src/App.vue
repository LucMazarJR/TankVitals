<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// Quando a sessão acaba, volta ao login. Se ela venceu sozinha (token vencido
// ou 401 da API), guarda a tela em que a pessoa estava para devolvê-la lá.
// Num "Sair" não guarda: quem entra depois pode ser outra pessoa.
watch(
  () => auth.isAuthenticated,
  (loggedIn) => {
    if (loggedIn || route.meta.public) return
    void router.replace({
      name: 'login',
      query: auth.expired ? { redirect: route.fullPath, expirou: '1' } : {},
    })
  },
)
</script>

<template>
  <RouterView />
</template>
