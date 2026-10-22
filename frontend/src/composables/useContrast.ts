import { ref, watch } from 'vue'

/**
 * Nível de contraste do tema (src/style.css): "natural" no dia a dia e "alto"
 * para o projetor da apresentação. A escolha fica no navegador de cada pessoa
 * e vai para o atributo `data-contrast` do <html>, que troca os tokens.
 */
export type Contrast = 'natural' | 'alto'

const STORAGE_KEY = 'tankvitals.contrast'

function readStored(): Contrast {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'alto' ? 'alto' : 'natural'
  } catch {
    // Aba anônima ou armazenamento bloqueado: fica no padrão.
    return 'natural'
  }
}

function apply(value: Contrast): void {
  document.documentElement.dataset.contrast = value
}

const contrast = ref<Contrast>(readStored())
apply(contrast.value)

// `sync`: o atributo muda antes de qualquer componente recalcular as cores
// (o gráfico lê os tokens do CSS na hora de desenhar).
watch(
  contrast,
  (value) => {
    apply(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Sem armazenamento, a escolha vale só até recarregar.
    }
  },
  { flush: 'sync' },
)

export function useContrast() {
  return {
    contrast,
    setContrast(value: Contrast) {
      contrast.value = value
    },
  }
}
