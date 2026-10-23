/**
 * Para onde a pessoa está olhando no gêmeo 3D: a planta inteira, um tanque ou
 * um item dentro dele. É a tela (TwinView) que guarda o foco; a cena só
 * desenha e avisa o que foi clicado.
 */

/** O que está debaixo do clique: um tanque ou um item de um tanque. */
export type PickTarget = { kind: 'tank'; tank: string } | { kind: 'item'; tank: string; device: string }

export type TwinFocus =
  | { level: 'overview' }
  | { level: 'tank'; tank: string }
  | { level: 'item'; tank: string; device: string }

export const OVERVIEW: TwinFocus = { level: 'overview' }

/**
 * Clicou em algo: o tanque abre o tanque, o item abre o item (de qualquer
 * nível). Clique no vazio só fecha o item, voltando para o tanque dele; na
 * visão geral e no tanque ele não muda nada, para um clique perdido não jogar a
 * câmera longe.
 */
export function nextFocus(current: TwinFocus, pick: PickTarget | null): TwinFocus {
  if (pick?.kind === 'item') return { level: 'item', tank: pick.tank, device: pick.device }
  if (pick?.kind === 'tank') {
    return current.level === 'tank' && current.tank === pick.tank ? current : { level: 'tank', tank: pick.tank }
  }
  return current.level === 'item' ? { level: 'tank', tank: current.tank } : current
}

/** Sobe um nível: item → tanque → visão geral. É o Esc e o botão de voltar. */
export function upFocus(current: TwinFocus): TwinFocus {
  if (current.level === 'item') return { level: 'tank', tank: current.tank }
  return OVERVIEW
}

export function sameFocus(a: TwinFocus, b: TwinFocus): boolean {
  if (a.level !== b.level) return false
  if (a.level === 'overview') return true
  if (a.level === 'tank') return a.tank === (b as { tank: string }).tank
  const other = b as { tank: string; device: string }
  return a.tank === other.tank && a.device === other.device
}
