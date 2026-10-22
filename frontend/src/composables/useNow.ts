import { readonly, ref, type Ref } from 'vue'

/**
 * Relógio comum do app, que anda de segundo em segundo. Serve para o "há 3 s",
 * para virar "sem dados" e para o "aberto há 2 min", sem cada componente criar
 * o próprio timer.
 */
const now = ref(Date.now())
let started = false

export function useNow(): Readonly<Ref<number>> {
  if (!started) {
    started = true
    window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
  return readonly(now)
}
