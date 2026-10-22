/**
 * Depois de quanto tempo sem mensagem uma leitura vira "sem dados". É a mesma
 * regra do 3D (WEB-06): melhor avisar que parou do que mostrar valor velho.
 */
export const STALE_AFTER_MS = 10_000

export function isFresh(ts: string, now: number): boolean {
  return now - Date.parse(ts) <= STALE_AFTER_MS
}
