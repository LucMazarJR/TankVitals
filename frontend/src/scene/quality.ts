import type { WebGLRenderer } from 'three'

/**
 * Quanto a cena pode gastar. A apresentação roda num notebook comum, e os
 * prints automáticos rodam sem placa de vídeo (SwiftShader): nos dois a cena
 * tem que andar lisa, nem que seja com menos árvore e sombra mais simples.
 */
export interface Quality {
  level: 'alta' | 'baixa'
  pixelRatio: number
  shadowMapSize: number
  /** Árvores e arbustos da fazenda, estrelas do céu. */
  trees: number
  stars: number
  fishPerTank: number
}

const ALTA: Quality = { level: 'alta', pixelRatio: 1.5, shadowMapSize: 2048, trees: 54, stars: 420, fishPerTank: 16 }
const BAIXA: Quality = { level: 'baixa', pixelRatio: 1, shadowMapSize: 1024, trees: 26, stars: 200, fishPerTank: 10 }

/** Placa de vídeo emulada no processador: dá para desenhar, mas devagar. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i

export function detectQuality(renderer: WebGLRenderer): Quality {
  if (new URLSearchParams(window.location.search).get('qualidade') === 'baixa') return { ...BAIXA }
  const gl = renderer.getContext()
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
  if (SOFTWARE.test(name)) return { ...BAIXA }
  // Celular: tela pequena de toque, a mesma cena com menos pixels.
  if (window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches) return { ...ALTA, pixelRatio: 1.25 }
  return { ...ALTA }
}

/**
 * Mede o tempo dos quadros e avisa uma vez se a máquina não está dando conta
 * (média acima de 28 ms, ~35 quadros por segundo). Só desce, nunca sobe de
 * volta: assim a qualidade não fica indo e voltando.
 */
export class FrameBudget {
  private warmup = 3
  private samples: number[] = []
  private tripped = false

  /** Devolve `true` no quadro em que a cena deve baixar a qualidade. */
  tick(dt: number): boolean {
    if (this.tripped) return false
    if (this.warmup > 0) {
      this.warmup -= dt
      return false
    }
    this.samples.push(dt)
    if (this.samples.length < 120) return false
    const average = this.samples.reduce((a, b) => a + b, 0) / this.samples.length
    this.samples = []
    if (average > 0.028) {
      this.tripped = true
      return true
    }
    return false
  }
}
