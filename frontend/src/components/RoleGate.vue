<script setup lang="ts">
import { useAuthStore, type Permission } from '../stores/auth'

/**
 * Mostra o conteúdo só para quem tem a permissão. É assim que os botões de
 * comando somem para o visualizador:
 *
 *   <RoleGate permission="command"><button>Ligar</button></RoleGate>
 *
 * Esconder na tela é conforto; quem barra de verdade é a API, que confere o
 * papel em cada rota (BACK-03).
 */
defineProps<{ permission: Permission }>()

const auth = useAuthStore()
</script>

<template>
  <slot v-if="auth.can(permission)" />
</template>
