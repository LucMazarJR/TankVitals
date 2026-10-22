<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import Sparkline from './Sparkline.vue'
import { LEVEL_TEXT } from '../alerts'
import { LEVEL_ICON } from '../icons'
import type { SeriesStats } from '../domain/devices'
import type { AlertLevel, HistoryRange, MetricThreshold } from '../types'

/**
 * Análise do período: responde "como a água e a bomba se comportaram", não só
 * "como estão agora", que é o trabalho dos cartões. Uma linha por grandeza do
 * cadastro, agrupadas pelo dispositivo; as estatísticas vêm prontas do
 * histórico (`GET /api/history`), calculadas sobre as leituras cruas.
 */
export interface AnalysisRow {
  id: string
  /** Grupo da linha na tabela: "Água", "Bomba de recirculação"... */
  group: string
  /** Dispositivo da grandeza, para somar as leituras uma vez por dispositivo. */
  device: string
  label: string
  unit: string
  decimals: number
  icon: Component
  now: number | null
  level: AlertLevel | null
  stats?: SeriesStats
  points: number[]
  range: MetricThreshold | null
}

const props = defineProps<{
  rows: AnalysisRow[]
  range: HistoryRange
}>()

const RANGE_TEXTO: Record<HistoryRange, string> = {
  '1h': 'na última hora',
  '6h': 'nas últimas 6 horas',
  '24h': 'nas últimas 24 horas',
  '7d': 'nos últimos 7 dias',
}

// Quantos pontos o sparkline desenha. Mais que isso vira ruído nesse tamanho.
const MAX_PONTOS = 60

function amostrar(valores: number[]): number[] {
  if (valores.length <= MAX_PONTOS) return valores
  const passo = valores.length / MAX_PONTOS
  return Array.from({ length: MAX_PONTOS }, (_, i) => valores[Math.floor(i * passo)])
}

const linhas = computed(() =>
  props.rows.map((row, index) => {
    const count = row.stats?.count ?? 0
    const fora = row.stats?.out_of_range_s
    return {
      ...row,
      novoGrupo: index === 0 || props.rows[index - 1].group !== row.group,
      pontos: amostrar(row.points),
      foraS: fora,
      foraPct: fora !== undefined && count ? (fora * 100) / count : 0,
      okMin: row.range?.ok_min ?? null,
      okMax: row.range?.ok_max ?? null,
    }
  }),
)

// Uma leitura por dispositivo por passo: soma o total de cada dispositivo uma vez.
const leituras = computed(() => {
  const porDispositivo = new Map<string, number>()
  for (const row of props.rows) porDispositivo.set(row.device, Math.max(porDispositivo.get(row.device) ?? 0, row.stats?.count ?? 0))
  return [...porDispositivo.values()].reduce((a, b) => a + b, 0)
})

const comFaixa = computed(() => linhas.value.filter((l) => l.range !== null))
const foraAgora = computed(() => comFaixa.value.filter((l) => l.level === 'atencao' || l.level === 'critico').length)

// O indicador que mais diz: qual grandeza passou mais tempo fora da faixa.
const maisTempoFora = computed(() =>
  comFaixa.value.reduce<(typeof linhas.value)[number] | null>(
    (pior, l) => ((l.foraS ?? 0) > (pior?.foraS ?? 0) ? l : pior),
    null,
  ),
)

const semDados = computed(() => linhas.value.every((l) => l.pontos.length === 0))

function fmt(valor: number | null | undefined, casas: number): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return '—'
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

function fmtDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} s`
  if (segundos < 3600) return `${Math.round(segundos / 60)} min`
  const horas = Math.floor(segundos / 3600)
  const minutos = Math.round((segundos % 3600) / 60)
  return minutos ? `${horas} h ${minutos} min` : `${horas} h`
}
</script>

<template>
  <section class="analise">
    <div class="analise-resumo">
      <div class="analise-resumo-item">
        <span>Leituras recebidas</span>
        <strong>{{ leituras ? leituras.toLocaleString('pt-BR') : '—' }}</strong>
        <small>{{ RANGE_TEXTO[range] }}</small>
      </div>
      <div class="analise-resumo-item">
        <span>Fora da faixa agora</span>
        <strong>{{ foraAgora }} de {{ comFaixa.length }}</strong>
        <small>grandezas com faixa definida</small>
      </div>
      <div class="analise-resumo-item">
        <span>Mais tempo fora da faixa</span>
        <strong v-if="maisTempoFora && maisTempoFora.foraS">{{ fmtDuracao(maisTempoFora.foraS) }}</strong>
        <strong v-else>Nenhuma</strong>
        <small v-if="maisTempoFora && maisTempoFora.foraS">{{ maisTempoFora.label }}, {{ RANGE_TEXTO[range] }}</small>
        <small v-else>todas ficaram na faixa {{ RANGE_TEXTO[range] }}</small>
      </div>
    </div>

    <div v-if="semDados" class="analise-vazio">
      <component :is="LEVEL_ICON.ok" :size="18" aria-hidden="true" />
      <span>Sem leituras no período selecionado.</span>
    </div>

    <table v-else class="analise-tabela">
      <thead>
        <tr>
          <th scope="col">Grandeza</th>
          <th scope="col">Agora</th>
          <th scope="col" class="num">Mín</th>
          <th scope="col" class="num">Média</th>
          <th scope="col" class="num">Máx</th>
          <th scope="col">Fora da faixa</th>
          <th scope="col">Tendência</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="l in linhas" :key="l.id">
          <tr v-if="l.novoGrupo" class="analise-grupo">
            <th scope="colgroup" colspan="7">{{ l.group }}</th>
          </tr>
          <tr>
            <th scope="row" class="analise-grandeza">
              <component :is="l.icon" :size="16" aria-hidden="true" />
              <span>{{ l.label }}</span>
              <small>{{ l.unit }}</small>
            </th>

            <td>
              <span class="analise-agora">
                <component
                  v-if="l.level"
                  :is="LEVEL_ICON[l.level]"
                  :size="15"
                  :class="`ink-${l.level}`"
                  aria-hidden="true"
                />
                <strong>{{ fmt(l.now, l.decimals) }}</strong>
                <small v-if="l.level">{{ LEVEL_TEXT[l.level] }}</small>
                <small v-else-if="l.now === null">sem dados</small>
              </span>
            </td>

            <td class="num">{{ fmt(l.stats?.min, l.decimals) }}</td>
            <td class="num destaque">{{ fmt(l.stats?.avg, l.decimals) }}</td>
            <td class="num">{{ fmt(l.stats?.max, l.decimals) }}</td>

            <td>
              <div v-if="l.foraS !== undefined" class="medidor" :title="`${l.foraPct.toFixed(1)}% do período`">
                <div class="medidor-trilha">
                  <div
                    :class="['medidor-preenchido', l.foraS > 0 ? 'nivel-atencao' : 'nivel-ok']"
                    :style="{ width: `${Math.min(100, Math.max(l.foraPct, l.foraS > 0 ? 2 : 0))}%` }"
                  />
                </div>
                <span class="medidor-valor">{{ l.foraS > 0 ? fmtDuracao(l.foraS) : '0' }}</span>
              </div>
              <span v-else class="analise-sem-faixa">sem faixa</span>
            </td>

            <td class="analise-spark">
              <Sparkline :points="l.pontos" :ok-min="l.okMin" :ok-max="l.okMax" :width="200" :height="40" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <p v-if="!semDados" class="analise-nota">
      A banda clara na tendência é a faixa normal da grandeza. "Fora da faixa" é o
      tempo, {{ RANGE_TEXTO[range] }}, em que as leituras saíram dela.
    </p>
  </section>
</template>
