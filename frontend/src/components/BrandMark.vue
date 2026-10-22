<script setup lang="ts">
// A marca do TankVitals: um peixe com o traço de batimento no corpo, os
// "sinais vitais" do tanque. Fica no menu, no login e na tela de carregando.
withDefaults(defineProps<{ size?: number }>(), { size: 36 })
</script>

<template>
  <svg class="brand-fish" :width="size" :height="size * 0.75" viewBox="0 0 32 24" aria-hidden="true">
    <path class="brand-fish-body" d="M3 12 C7 4.5 17 4.5 22 12 C17 19.5 7 19.5 3 12 Z" />
    <path class="brand-fish-body" d="M22 12 L29 6.5 L27.5 12 L29 17.5 Z" />
    <polyline class="brand-fish-pulse" points="6,12 9.5,12 11.5,8.5 14,15.5 16,12 19,12" />
  </svg>
</template>

<style scoped>
.brand-fish {
  flex: 0 0 auto;
}

.brand-fish-body {
  fill: var(--brand-fish, #ee7b4a);
}

/* O batimento tem a cor do fundo escuro em que a marca fica: parece recortado. */
.brand-fish-pulse {
  fill: none;
  stroke: var(--brand-fish-pulse, #0f3550);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
