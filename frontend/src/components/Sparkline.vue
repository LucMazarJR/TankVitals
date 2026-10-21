<script setup lang="ts">
import { computed } from 'vue'

/**
 * Sparkline de uma série só, em SVG puro (sem dependência de gráfico).
 *
 * Uma grandeza por sparkline de propósito: as quatro têm unidades diferentes
 * (°C, pH, %, NTU) e empilhá-las num eixo comum — ou pior, em dois eixos —
 * falsearia a comparação. Quatro pequenos múltiplos lado a lado comparam a
 * *forma* da curva, que é o que interessa aqui.
 *
 * A faixa segura entra como banda de fundo: quem olha vê "saiu da faixa" pela
 * posição, sem depender de cor.
 */

const props = defineProps<{
  points: number[]
  okMin?: number | null
  okMax?: number | null
  width?: number
  height?: number
}>()

const W = computed(() => props.width ?? 240)
const H = computed(() => props.height ?? 44)
const PAD = 3 // deixa o raio do ponto final e a espessura da linha caberem

// Escala vertical: engloba os dados E a faixa segura, senão a banda sai do
// quadro quando todos os valores estão dentro dela.
const escala = computed(() => {
  const vals = [...props.points]
  if (props.okMin != null) vals.push(props.okMin)
  if (props.okMax != null) vals.push(props.okMax)
  if (!vals.length) return null

  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    // Série constante: abre uma folga para a linha não colar na borda.
    min -= 1
    max += 1
  }
  const folga = (max - min) * 0.12
  return { min: min - folga, max: max + folga }
})

const y = (valor: number) => {
  const e = escala.value
  if (!e) return H.value / 2
  const t = (valor - e.min) / (e.max - e.min)
  return PAD + (1 - t) * (H.value - PAD * 2)
}

const x = (i: number) => {
  const n = props.points.length
  if (n <= 1) return W.value / 2
  return PAD + (i / (n - 1)) * (W.value - PAD * 2)
}

const linha = computed(() =>
  props.points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
)

// Wash de ~10% sob a linha, como manda a especificação de área.
const area = computed(() => {
  if (props.points.length < 2) return ''
  const base = H.value - PAD
  return `${linha.value} L${x(props.points.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`
})

const banda = computed(() => {
  const e = escala.value
  if (!e) return null
  const topo = props.okMax != null ? y(props.okMax) : PAD
  const base = props.okMin != null ? y(props.okMin) : H.value - PAD
  return { y: topo, altura: Math.max(1, base - topo) }
})

const ultimo = computed(() => {
  const n = props.points.length
  if (!n) return null
  return { cx: x(n - 1), cy: y(props.points[n - 1]) }
})
</script>

<template>
  <svg
    v-if="points.length"
    class="sparkline"
    :viewBox="`0 0 ${W} ${H}`"
    :width="W"
    :height="H"
    role="img"
    aria-hidden="true"
    preserveAspectRatio="none"
  >
    <rect
      v-if="banda"
      class="sparkline-banda"
      :x="0"
      :y="banda.y"
      :width="W"
      :height="banda.altura"
    />
    <path v-if="area" class="sparkline-area" :d="area" />
    <path class="sparkline-linha" :d="linha" vector-effect="non-scaling-stroke" />
    <circle
      v-if="ultimo"
      class="sparkline-ponta"
      :cx="ultimo.cx"
      :cy="ultimo.cy"
      r="4"
      vector-effect="non-scaling-stroke"
    />
  </svg>

  <div v-else class="sparkline-vazio">sem dados</div>
</template>
