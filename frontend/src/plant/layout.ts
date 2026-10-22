/**
 * Onde cada dispositivo do cadastro entra no desenho do tanque, pelo id.
 *
 * O cadastro diz o que existe; este arquivo diz onde cada coisa fica na
 * representação visual da planta. É aqui que a cena 3D (WEB-05) vai guardar a
 * posição de cada item, pelo mesmo id, como o enunciado pede.
 */
export const TANK = {
  id: 'tanque-01',
  level: { device: 'nivel-01', field: 'level_pct' },
  aerator: { device: 'aerador-01', field: 'on' },
  recirculation: { device: 'bomba-rec-01', field: 'running' },
  refill: { device: 'bomba-repo-01', field: 'on' },
} as const
