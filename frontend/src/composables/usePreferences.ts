import { reactive, watch } from 'vue'
import { SCENERIES, type Scenery } from '../scene/environments/types'

/**
 * Preferências de exibição de cada pessoa, guardadas no navegador dela.
 *
 * Ficam num objeto só para crescer sem virar uma chave de armazenamento por
 * opção: para uma preferência nova, some aqui o campo, o padrão e o que ela
 * muda no documento (`applyToDocument`), e ponha o controle no menu do usuário.
 */
export type Contrast = 'padrao' | 'alto'

export interface Preferences {
  /** "alto" reforça bordas, cores e pesos (tokens em src/style.css). */
  contrast: Contrast
  /** O cenário do gêmeo 3D: piscicultura, galpão ou aquário. */
  scenery: Scenery
}

const STORAGE_KEY = 'tankvitals.preferences'

const DEFAULTS: Preferences = {
  contrast: 'padrao',
  scenery: 'fazenda',
}

function load(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Preferences>
    return {
      contrast: stored.contrast === 'alto' ? 'alto' : DEFAULTS.contrast,
      scenery: SCENERIES.includes(stored.scenery as Scenery) ? (stored.scenery as Scenery) : DEFAULTS.scenery,
    }
  } catch {
    // Aba anônima, armazenamento bloqueado ou valor estragado: fica no padrão.
    return { ...DEFAULTS }
  }
}

function applyToDocument(prefs: Preferences): void {
  document.documentElement.dataset.contrast = prefs.contrast
}

const preferences = reactive<Preferences>(load())
applyToDocument(preferences)

// `sync`: o documento muda antes de qualquer componente recalcular as cores
// (o gráfico lê os tokens do CSS na hora de desenhar).
watch(
  preferences,
  (prefs) => {
    applyToDocument(prefs)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // Sem armazenamento, a escolha vale só até recarregar.
    }
  },
  { deep: true, flush: 'sync' },
)

export function usePreferences(): Preferences {
  return preferences
}
