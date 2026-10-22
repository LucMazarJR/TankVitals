/**
 * Modo simulado (mock): login e dados ao vivo gerados no próprio navegador.
 *
 * Existe para a interface andar antes do backend ter as rotas novas. Enquanto
 * a BACK-03 (login) e a BACK-04 (WebSocket com ticket) não existirem, deixe
 * ligado. Quando elas estiverem no ar, ponha `VITE_MOCK=false` no `.env` do
 * frontend e a casca passa a falar com a API de verdade, sem mudar mais nada.
 *
 * Sem a variável, o padrão é ligado.
 */
export const MOCK = import.meta.env.VITE_MOCK !== 'false'
