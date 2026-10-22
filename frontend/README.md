# TankVitals — Frontend

Dashboard em Vue 3 + TypeScript + Vite para o projeto de monitoramento IoT de tanque de aquicultura.

## Requisitos

- Node.js
- Backend TankVitals rodando em `http://localhost:8000` (para o dashboard; as
  outras telas rodam sem backend no modo simulado)

## Instalação

```bash
npm install
```

## Desenvolvimento

Copie `.env.example` para `.env`.

Deixe `VITE_API_BASE_URL=` vazio para usar o proxy do Vite:

```bash
npm run dev
```

Acesse `http://localhost:5173`.

## Modo simulado

Enquanto o backend não tem o login (BACK-03) e o WebSocket com ticket
(BACK-04), o app roda em **modo simulado** (`VITE_MOCK=true`, o padrão): o
login e os dados ao vivo são gerados no próprio navegador, no mesmo formato que
o backend vai mandar. Na tela de login há um botão para cada papel de teste:
`visualizador`, `operador` e `admin`.

Quando o backend tiver essas rotas, ponha `VITE_MOCK=false` no `.env`. Nenhum
outro código muda.

O dashboard ainda usa as rotas do 1º bimestre e mostra os dados reais do
backend, com o modo simulado ligado ou não.

## Como o app está organizado (WEB-01)

| Onde | O quê |
| --- | --- |
| `src/router/pages.ts` | as telas: título, ícone, grupo do menu, permissão e a tarefa que constrói cada uma |
| `src/stores/auth.ts` | sessão (JWT), papéis e permissões: `can('command')`, `can('train')`... |
| `src/stores/live.ts` | o store ao vivo: última telemetria de cada dispositivo, as recentes e os insights da IA |
| `src/live/socket.ts` | o WebSocket: pede o ticket, conecta e reconecta |
| `src/api/http.ts` | o cliente HTTP: manda o JWT e leva ao login quando a sessão acaba |
| `src/mock/` | o login e a telemetria do modo simulado |
| `src/components/RoleGate.vue` | esconde um trecho de quem não tem a permissão |

**Para fazer uma tela:** crie a view em `src/views/` e aponte o `component` dela
em `src/router/pages.ts`. Enquanto ela não existe, a rota mostra um placeholder
com a tarefa e o que já está chegando no store ao vivo.

**Para esconder um botão do visualizador:**

```vue
<RoleGate permission="command">
  <button>Ligar</button>
</RoleGate>
```

**Para ler o ao vivo:** `useLiveStore().latest['od-01']?.payload.oxygen_mg_l`.
Para os outros tipos de mensagem (progresso de job, alerta),
`useLiveStore().subscribe(msg => ...)`.

## Build

```bash
npm run build
npm run preview
```

## Integração

O frontend não conversa diretamente com MQTT ou InfluxDB. Ele consome somente a API FastAPI:

- `GET /api/health`
- `GET /api/thresholds`
- `GET /api/tanks`
- `GET /api/readings/latest`
- `GET /api/readings/history`
- `GET /api/stats`
- `WS /ws/live`

O WebSocket é usado como canal principal. Após falhas consecutivas, o dashboard passa automaticamente para polling de `/api/readings/latest` a cada 5 segundos.

## Observação sobre Chart.js

O gráfico utiliza duas linhas tracejadas para representar os limites mínimo/máximo da faixa segura, evitando adicionar dependências extras ao projeto.
