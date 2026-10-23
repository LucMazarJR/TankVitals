import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'

/**
 * O que a cena escreve por cima do 3D (WEB-06), no lugar dos rótulos fixos que
 * poluíam a tela:
 *
 * - um **selo por tanque**, sempre visível: é por ele que se navega;
 * - um **pino** só nos itens fora do normal, com o texto quando o tanque está
 *   em foco;
 * - uma **dica** só, reaproveitada, que segue o mouse.
 *
 * O estado vai sempre escrito, nunca só na cor. A lista de itens no painel ao
 * lado é o caminho acessível; selo e pino são atalhos visuais.
 */

const ICON: Record<ItemLevel, string> = {
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  atencao: '<path d="M12 3.5 2.8 20h18.4L12 3.5Z"/><path d="M12 10v4.5"/><path d="M12 17.4v.1"/>',
  critico: '<path d="M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2Z"/><path d="M12 7.8v5.2"/><path d="M12 16.2v.1"/>',
  vazio: '<path d="M4.5 9.5a11 11 0 0 1 15 0"/><path d="M8 13.2a6 6 0 0 1 8 0"/><path d="M12 17.2v.1"/><path d="m3 3 18 18"/>',
}

function icon(level: ItemLevel): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICON[level]}</svg>`
}

function button(className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  // Atalho visual: quem usa leitor de tela navega pela lista do painel.
  el.tabIndex = -1
  el.setAttribute('aria-hidden', 'true')
  // O clique não pode chegar no canvas, senão vira clique no vazio também.
  el.addEventListener('pointerdown', (event) => event.stopPropagation())
  el.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return el
}

export interface BadgeState {
  label: string
  level: ItemLevel
  notOk: number
  live: boolean
  visible: boolean
}

export class TankBadge {
  readonly object: CSS2DObject
  private readonly el: HTMLButtonElement
  private key = ''

  constructor(onClick: () => void) {
    this.el = button('twin-badge', onClick)
    this.object = new CSS2DObject(this.el)
  }

  set(state: BadgeState): void {
    this.object.visible = state.visible
    const key = `${state.label}|${state.level}|${state.notOk}|${state.live}`
    if (key === this.key) return
    this.key = key
    this.el.className = `twin-badge level-${state.level}`
    const extra =
      state.live && state.notOk > 0
        ? `<span class="twin-badge-extra">${state.notOk} fora do normal</span>`
        : ''
    this.el.innerHTML =
      `<span class="twin-badge-icon">${icon(state.level)}</span>` +
      `<strong>${escapeHtml(state.label)}</strong>` +
      `<span class="twin-badge-level">${ITEM_LEVEL_TEXT[state.level]}</span>${extra}`
  }
}

export class ItemPin {
  readonly object: CSS2DObject
  private readonly el: HTMLButtonElement
  private key = ''

  constructor(onClick: () => void) {
    this.el = button('twin-pin', onClick)
    this.object = new CSS2DObject(this.el)
    this.object.visible = false
  }

  /** `text` só no tanque em foco; na visão geral o pino é só o ícone. */
  set(visible: boolean, level: ItemLevel, text: string | null): void {
    this.object.visible = visible
    if (!visible) return
    const key = `${level}|${text ?? ''}`
    if (key === this.key) return
    this.key = key
    this.el.className = `twin-pin level-${level}${text ? ' has-text' : ''}`
    this.el.innerHTML = icon(level) + (text ? `<span>${escapeHtml(text)}</span>` : '')
  }
}

/** A dica do mouse: um elemento só, que anda com o ponteiro. */
export class Tooltip {
  private readonly el: HTMLDivElement
  private text = ''

  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'twin-tooltip'
    this.el.setAttribute('aria-hidden', 'true')
    container.append(this.el)
  }

  show(text: string, level: ItemLevel, x: number, y: number): void {
    if (text !== this.text) {
      this.text = text
      this.el.textContent = text
    }
    this.el.dataset.level = level
    this.el.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`
    this.el.classList.add('is-visible')
  }

  hide(): void {
    this.el.classList.remove('is-visible')
  }

  dispose(): void {
    this.el.remove()
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
