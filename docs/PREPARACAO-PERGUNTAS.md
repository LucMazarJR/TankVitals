# TankVitals — a arquitetura explicada

Como o sistema funciona, peça por peça, e por que cada decisão foi tomada. Os
contratos técnicos completos (campos, tópicos, endpoints) estão em
[ARQUITETURA.md](ARQUITETURA.md).

---

## 1. Visão geral

Um ESP32 simulado no Wokwi lê quatro sensores do tanque — temperatura, pH,
nível e turbidez — e publica um JSON a cada 5 segundos via **MQTT**. Como o
Wokwi roda na nuvem, ele publica num broker público, e o **Mosquitto** local
importa as mensagens por *bridge*. O backend em **Python** assina o tópico,
valida o JSON, classifica o alerta e grava no **InfluxDB**, um banco de série
temporal. A mesma aplicação Python expõe uma API **FastAPI**, com REST para o
histórico e **WebSocket** para o tempo real. O dashboard em **Vue 3 com
TypeScript e Vite** consome essa API e desenha os gráficos com **Chart.js**.
Mosquitto e InfluxDB rodam em containers Docker.

```
 ┌───────────────┐  publish JSON   ┌──────────────────┐  bridge  ┌─────────────────┐
 │ ESP32 (Wokwi) │ ──────────────> │ test.mosquitto   │ ───────> │ Mosquitto local │
 │ 4 sensores    │  a cada 5 s     │ (broker público) │   (in)   │ :1883           │
 │ 1 LED         │ <── /cmd ─────  └──────────────────┘          └────────┬────────┘
 └───────────────┘                                                        │ subscribe
                                                                          v
 ┌───────────────┐  REST + WS  ┌──────────────────────────────┐  write  ┌──────────┐
 │ Dashboard Vue │ <────────── │ Python: ingestor + FastAPI   │ ──────> │ InfluxDB │
 │ :5173 / :8080 │             │ (mesmo processo)  :8000      │ <────── │ :8086    │
 └───────────────┘             └──────────────────────────────┘  Flux   └──────────┘
```

Cada peça tem uma responsabilidade só:

| Peça | Faz | **Não** faz |
| --- | --- | --- |
| Firmware | lê sensor, publica, acende LED | não classifica alerta em 3 níveis |
| Mosquitto | transporta mensagem | nenhuma lógica |
| Ingestor | valida e grava — **único que escreve no banco** | não serve o front |
| InfluxDB | guarda a série temporal | — |
| API | lê o banco e serve o front — **única coisa que o front conhece** | — |
| Dashboard | apresenta | não fala MQTT nem InfluxDB direto |

---

## 2. Tecnologia por tecnologia

### 2.1 ESP32 e Wokwi

ESP32 é um microcontrolador com Wi-Fi. Wokwi é um simulador on-line que executa
o firmware de verdade, com os componentes do circuito. O código está em
`firmware/wokwi/sketch.ino` (C++/Arduino) e o circuito em `diagram.json`.

| Grandeza | Componente | Pino | Conversão |
| --- | --- | --- | --- |
| Temperatura | DS18B20 (1-Wire) | GPIO 4 | direto da biblioteca |
| pH | potenciômetro | GPIO 34 | 0–4095 → 0–14 |
| Nível | HC-SR04 (ultrassom) | TRIG 5 / ECHO 18 | distância → % (5 cm cheio, 45 cm vazio) |
| Turbidez | LDR | GPIO 35 | 0–4095 → 0–100 NTU (mais luz = menos NTU) |
| **LED de alerta** | LED + 220 Ω | GPIO 19 | acende se qualquer grandeza sai da faixa |

- **GPIO 34 e 35.** O ESP32 tem dois conversores analógicos, ADC1 e ADC2. O ADC2
  é usado pelo rádio Wi-Fi, e lê-lo com o Wi-Fi ligado devolve lixo. Por isso
  os sensores analógicos estão no ADC1 (GPIO 32–39).
- **Os dois resistores.** 4,7 kΩ é o *pull-up* obrigatório do barramento 1-Wire
  do DS18B20; 220 Ω limita a corrente do LED.
- **Sensores simulados.** O Wokwi não tem sonda de pH nem sensor de turbidez:
  um potenciômetro e um LDR geram o sinal analógico no lugar deles. O código de
  leitura é o mesmo que seria com o sensor real.
- **Sensor com falha.** O campo não entra no JSON. Mandar `0` seria errado (zero
  é leitura válida) e `NaN` geraria JSON inválido.
- **Sem `delay()` no loop.** `delay` trava o `mqtt.loop()`, que mantém a conexão
  viva. O agendamento das publicações usa `millis()`.
- **Velocidade da simulação.** O Wokwi roda de 3 a 7× mais devagar que o
  relógio: 5 s de placa levam de 15 a 35 s reais.

### 2.2 MQTT

Protocolo **publish/subscribe** leve, feito para dispositivos com pouca banda e
rede instável. Os participantes não falam entre si: todos falam com o
**broker**. O prefixo de tópico do grupo é `tankvitals-unifacef-g3`:

| Tópico | Direção | QoS | Retained |
| --- | --- | --- | --- |
| `.../tanque-01/telemetry` | placa → backend | 0 | não |
| `.../tanque-01/status` | placa → backend | 1 | **sim** |
| `.../tanque-01/cmd` | backend → placa | 0 | não |

O backend assina com curinga: `tankvitals-unifacef-g3/+/telemetry`, em que `+`
significa qualquer tanque.

- **MQTT em vez de HTTP.** Com HTTP a placa precisaria conhecer o endereço de
  cada consumidor e abrir uma requisição a cada envio. Com MQTT ela publica e
  quem quiser o dado assina. A conexão fica aberta, o cabeçalho tem poucos
  bytes e existe *Last Will* para detectar queda.
- **QoS** é a garantia de entrega: **0** = no máximo uma vez (pode perder),
  **1** = pelo menos uma vez (pode duplicar), **2** = exatamente uma vez. A
  telemetria usa 0 porque em 5 s chega outra; o status usa 1 porque não pode se
  perder.
- **Retained.** O broker guarda a última mensagem do tópico e a entrega a quem
  assinar depois. O status é *retained* para que um backend recém-iniciado já
  saiba se a placa está online.
- **Last Will.** Mensagem que a placa registra no broker **ao conectar**: "se
  eu sumir sem avisar, publique `offline` no meu status". Quem publica é o
  **broker**. Ao parar a simulação, o status vira `offline` sozinho.
- **Prefixo único.** O broker público é aberto e qualquer um publica nele. Com
  um prefixo genérico, mensagens de terceiros apareceriam no nosso painel.
- **Perda de mensagem.** O JSON leva um contador `seq`. Em 60 s medidos não
  houve lacuna: 0 % de perda.

### 2.3 Mosquitto

O broker MQTT (Eclipse Mosquitto), rodando em container. Configuração em
`infra/mosquitto/config/mosquitto.conf`.

- **Dois brokers.** O Wokwi roda **na nuvem** e não alcança o `localhost` de
  ninguém. Ele publica no `test.mosquitto.org` (que também é Mosquitto) e o
  Mosquitto local **importa o tópico por bridge**. O backend só conhece o
  broker local, e nenhuma máquina precisou abrir porta no roteador.
- **Bridge.** Conexão que o Mosquitto local abre como *cliente* do broker
  remoto, repassando os tópicos configurados. A nossa é `in`: só importa.
- **Custo da escolha.** Dependência de um serviço de terceiro. Sem ele, o
  `backend/tools/fake_device.py` publica direto no broker local.
- **`allow_anonymous true`.** O broker local não fica exposto à internet: só a
  bridge sai, e sai como cliente. Num ambiente de produção entrariam usuário,
  senha e TLS.
- **`listener 1883` declarado.** Sem listener declarado, o Mosquitto 2.x só
  aceita conexão de dentro do próprio container.

### 2.4 Backend Python (ingestor + FastAPI)

Um processo Python com duas partes: o **ingestor** (cliente MQTT, biblioteca
`paho-mqtt`) e a **API** (FastAPI, servida pelo `uvicorn`).

| Arquivo | Papel |
| --- | --- |
| `app/main.py` | cria o app; sobe o ingestor no `lifespan` |
| `app/mqtt_ingestor.py` | assina os tópicos, valida, grava, avisa o WebSocket |
| `app/models.py` | `SensorReading` (Pydantic): o contrato do JSON |
| `app/alerts.py` | `classify_metric` / `classify_reading`: ok / atenção / crítico |
| `app/influx_repo.py` | toda consulta e escrita no InfluxDB |
| `app/api.py` | as 6 rotas REST e o WebSocket |
| `app/config.py` | configuração e faixas seguras, lidas do `.env` |

O caminho de uma mensagem: chega no `on_message` → valida com Pydantic →
classifica → grava no InfluxDB → empurra para o WebSocket.

| Rota | Para quê |
| --- | --- |
| `GET /api/health` | estado do serviço, do broker e do banco |
| `GET /api/thresholds` | as faixas seguras (o front não tem número próprio) |
| `GET /api/tanks` | tanques conhecidos, último visto, online |
| `GET /api/readings/latest` | última leitura, já classificada |
| `GET /api/readings/history` | série agregada → gráfico |
| `GET /api/stats` | mín / máx / média / último do período |
| `WS /ws/live` | cada leitura nova, assim que chega |

- **FastAPI.** Assíncrono (adequado a WebSocket), valida parâmetros pelos tipos
  do Python e gera a documentação em `/docs` sozinho.
- **Validação.** O ingestor é a **fronteira de confiança**. JSON inválido é
  descartado; sem `device_id` ou `tank_id`, também. Uma grandeza **fora da
  faixa física** (ex.: pH 20) remove **só aquele campo**, então um sensor com
  defeito não derruba os outros três. Isso aconteceu com dado real: o HC-SR04
  mandou 403,5 cm e a leitura foi gravada sem a distância.
- **Ingestor e API no mesmo processo.** Simplifica a execução e permite
  empurrar a leitura para o WebSocket sem uma fila no meio. Para escalar, os
  dois seriam separados, com um Redis entre eles.
- **Travessia de thread.** O `paho` roda numa thread própria e o FastAPI no
  *event loop* do `asyncio`. Não é possível dar `await` a partir de outra
  thread; por isso o ingestor usa `asyncio.run_coroutine_threadsafe` com o
  loop capturado no `lifespan`.
- **InfluxDB fora do ar.** O ingestor registra `WARNING` e continua. A API
  responde **503** e `/api/health` fica `degraded`. Quando o banco volta, a
  gravação retoma sem reiniciar nada.
- **Broker fora do ar.** O `paho` reconecta, e a assinatura é refeita no
  `on_connect`; sem isso o cliente reconectaria sem receber nada.
- **Testes.** 106 testes com `pytest`, em `backend/tests/`.

### 2.5 InfluxDB

Banco de **série temporal**: otimizado para pares `(tempo, valor)`, com
agregação por janela de tempo e retenção automática. Consultado em **Flux**.
Org `unifacef`, bucket `tankvitals` (retenção de **30 dias**), measurement
`water_reading`.

| Tipo | Nomes |
| --- | --- |
| **tags** (indexadas) | `tank_id`, `device_id`, `fw` |
| **fields** (valores) | `temperature_c`, `ph`, `level_pct`, `distance_cm`, `turbidity_ntu`, `rssi`, `seq` |

- **InfluxDB em vez de banco relacional.** O dado é série temporal e a pergunta
  é "como variou". O InfluxDB tem `aggregateWindow` (média por janela) nativo e
  apaga dado antigo pela retenção. Em SQL, cada consulta do gráfico seria um
  `GROUP BY` com truncamento de data à mão, numa tabela que só cresce.
- **Tag × field.** Tag é **indexada** e serve para filtrar e agrupar: é uma
  dimensão, com poucos valores distintos. Field é o valor medido. Um número
  contínuo como tag **explodiria a cardinalidade** do índice.
- **`tank_id` como tag.** Permite filtrar por tanque e acrescentar novos tanques
  sem mudar o schema.
- **Gráfico de períodos longos.** A janela de agregação muda com o período
  (`1h→10s`, `6h→1m`, `24h→5m`, `7d→1h`), então a série tem no máximo ~360
  pontos.
- **Timestamp.** Vale o `ts` do dispositivo (sincronizado por NTP); se não vier,
  o horário do servidor no recebimento.

### 2.6 Vue 3, TypeScript e Vite

Vue 3 é o framework da interface, baseado em componentes reativos. TypeScript
adiciona tipos ao JavaScript. Vite é a ferramenta de build e o servidor de
desenvolvimento. O código está em `frontend/src/`.

| Arquivo | Papel |
| --- | --- |
| `App.vue` | monta a tela |
| `components/MetricCard.vue` | os 4 cards |
| `components/HistoryChart.vue` | o gráfico (Chart.js) |
| `components/AnalysisPanel.vue` | mín/média/máx, tempo fora da faixa, tendência |
| `components/HistoryTable.vue`, `AlertsPanel.vue` | leituras e alertas |
| `composables/useLiveReadings.ts` | WebSocket + fallback de polling |
| `composables/useHistory.ts` | busca o histórico do período |
| `api/client.ts` | todas as chamadas HTTP |
| `types.ts` | os tipos do contrato da API |

- **Tempo real.** Pelo WebSocket `/ws/live`, o backend **empurra** cada leitura
  assim que ela chega do MQTT (medido: 78 ms). Se o WebSocket cair, o front
  consulta `/api/readings/latest` a cada 5 s e tenta reconectar sozinho.
- **Composables.** Funções que agrupam estado reativo e lógica reaproveitável
  (`ref`, `onMounted`, `onUnmounted`): é o jeito da *Composition API* do Vue 3
  de separar a lógica da tela.
- **TypeScript.** `types.ts` descreve o JSON da API. Se o backend mudar um
  campo, o `npm run build` falha, em vez de a tela mostrar `undefined`.
- **O front não fala MQTT.** O navegador precisaria de MQTT sobre WebSocket e
  das credenciais do broker. Centralizar tudo na API mantém o front simples e
  sem segredos.
- **Limites das faixas.** A fonte é o backend (`app/config.py`), e o front os
  busca em `/api/thresholds`. O front só guarda uma cópia de reserva
  (`DEFAULT_THRESHOLDS`), usada se a API não mandar alguma grandeza; o firmware
  tem a própria faixa "ok" para acender o LED mesmo sem rede.
- **Vite.** Servidor de desenvolvimento com recarga instantânea, *proxy* de
  `/api` e `/ws` para o backend (`vite.config.ts`) e build de produção.

### 2.7 Chart.js

Usado via `vue-chartjs`, com `chartjs-adapter-date-fns` para o eixo de tempo.
Mostra as séries do período com a **faixa segura tracejada**; os cards têm
*sparklines*. Foi escolhido em vez do ECharts por ser mais leve e suficiente
para linhas no tempo — os dois eram permitidos.

### 2.8 Docker e Docker Compose

Docker empacota cada serviço num container; o Compose sobe vários containers
juntos, numa rede comum. Arquivo: `infra/docker-compose.yml`.

| Serviço | Imagem | Porta |
| --- | --- | --- |
| `mosquitto` | `eclipse-mosquitto:2` | 1883 |
| `influxdb` | `influxdb:2.7` | 8086 |
| `backend` | `backend/Dockerfile` (Python 3.13) | 8000 |
| `frontend` | `frontend/Dockerfile` (build Vite + Nginx) | 8080 |

`docker compose up -d` sobe só a infraestrutura; `docker compose --profile app
up -d --build` sobe tudo.

- **Endereços dentro do Compose.** Os serviços se encontram pelo nome:
  `http://influxdb:8086` e `MQTT_HOST=mosquitto`. Dentro de um container,
  `localhost` é o próprio container.
- **Ordem de subida.** `depends_on` com `condition: service_healthy`: o backend
  só sobe depois que o `healthcheck` do InfluxDB (`influx ping`) passa.
- **Nginx no front.** O build do Vite gera arquivos estáticos; o Nginx os serve
  e encaminha `/api` e `/ws` para o backend, com os cabeçalhos de *Upgrade* sem
  os quais o WebSocket fecharia.
- **Backend sem `--reload` no container.** O recarregador duplicaria o
  ingestor, e dois clientes MQTT com o mesmo `client_id` se derrubam em laço.
- **Persistência.** Os dados do InfluxDB ficam num *volume* (`influxdb-data`) e
  sobrevivem à recriação do container.

### 2.9 Git e GitHub

Branch por tarefa e commits no padrão `tipo(escopo): descrição`
(ex.: `feat(fe): ...`, `docs: ...`), descritos em
[PADROES-DESENVOLVIMENTO.md](PADROES-DESENVOLVIMENTO.md). O `.env` está no
`.gitignore`; só o `.env.example` é versionado.

---

## 3. Uma leitura de ponta a ponta

O que acontece quando o potenciômetro do pH é girado:

1. O ESP32 lê o GPIO 34 (`analogRead`, 0–4095) e converte para pH 0–14.
2. Compara com a faixa 6,5–8,0; fora dela, **acende o LED** (GPIO 19).
3. Monta o JSON (ArduinoJson) e publica em `.../tanque-01/telemetry`.
4. O `test.mosquitto.org` recebe; a **bridge** entrega ao Mosquitto local.
5. O ingestor recebe no `on_message`, valida com Pydantic e classifica
   (ex.: pH 8,7 → `critico`).
6. Grava um ponto em `water_reading` no InfluxDB.
7. Chama `run_coroutine_threadsafe`, e o `ConnectionManager` envia a leitura a
   todos os navegadores conectados no `/ws/live`.
8. O Vue atualiza o `ref` e o card do pH fica vermelho, sem recarregar.
9. Ao trocar o período do gráfico, o front chama `/api/readings/history`, que
   roda uma consulta Flux com `aggregateWindow`.

---

## 4. O plano para o 2º bimestre

O projeto continua no 2º bimestre com o mesmo problema. Estes são os itens
planejados e o que do 1º bimestre já prepara cada um.

| O 2º bimestre pede | O que vamos fazer | O que já existe |
| --- | --- | --- |
| Pelo menos 2 sensores | manter os 4 atuais | ✅ temperatura, pH, nível, turbidez |
| Atuador **automático** por regra de negócio | **aerador** (relé) liga sozinho quando a temperatura passa de 28 °C: água quente tem menos oxigênio dissolvido | regra de faixa segura em `app/alerts.py`; o LED de alerta já acende sozinho |
| Atuador **controlado pela Web** | **bomba de reposição de água**, ligada e desligada por um botão no dashboard | firmware já assina o tópico `/cmd` |
| Comunicação Web → IoT | botão → `POST` na API → `publish_command()` → MQTT `/cmd` → ESP32 → relé | `publish_command()` pronto e testado; `/cmd` já aceita `interval_s` |
| PostgreSQL | usuários, cadastro de tanques e dispositivos, faixas seguras editáveis, regras de acionamento e histórico de comandos | faixas centralizadas em `app/config.py`, prontas para sair do `.env` e ir para tabela |
| Cadastro / gerenciamento de dispositivos | tela no dashboard para cadastrar tanque e dispositivo | `GET /api/tanks` já lista tanques e status online |
| WebSocket | continuar usando; empurrar também o estado dos atuadores | ✅ `/ws/live` já em uso |
| Docker + Docker Compose | toda a pilha no Compose, incluindo o PostgreSQL | ✅ Mosquitto e InfluxDB no Compose; backend e front já têm Dockerfile (perfil `app`) |

### Acionamento da bomba pela Web

```
Botão no dashboard
  → POST /api/tanks/tanque-01/actuators/bomba  {"on": true}
  → backend grava o comando no PostgreSQL e chama publish_command()
  → MQTT: tankvitals-unifacef-g3/tanque-01/cmd  {"pump": true}
  → ESP32 recebe no callback do /cmd e liga o relé
  → ESP32 confirma o estado na telemetria
  → WebSocket atualiza o botão no dashboard
```

A bridge do Mosquitto passa de `in` para `both` no tópico `/cmd`; senão o
comando não sai do broker local para o público, onde está o ESP32.

### Regra automática do aerador

O ingestor já classifica cada leitura. A regra entra logo depois da
classificação: se `temperature_c` passar do limite configurado (lido do
PostgreSQL), o backend publica `{"aerator": true}` no `/cmd`; quando voltar à
faixa, `{"aerator": false}`. Com o limite no banco, a regra pode ser mudada
pela tela sem recompilar nada.

### Decisões do plano

- **Leituras continuam no InfluxDB.** Leitura de sensor é série temporal; o
  PostgreSQL fica com o que é **relacional** (usuários, dispositivos, regras,
  comandos), que tem relações entre si e é editado.
- **LED no firmware, aerador no backend.** A regra do LED funciona **mesmo sem
  rede**: é a reação local de segurança. A regra do aerador fica no backend,
  onde pode ser configurada pela tela.
- **Sem reescrita.** `tank_id` já é tag no InfluxDB (mais tanques sem
  migração), o tópico `/cmd` já existe no firmware, o WebSocket já empurra
  eventos e cada serviço já tem Dockerfile.

---

## 5. Números do projeto

| O quê | Valor |
| --- | --- |
| Intervalo de publicação | 5 s (alterável de 1 a 300 s pelo `/cmd`) |
| Sensores | 4 |
| Faixa segura | temp 24–28 °C · pH 6,5–8,0 · nível ≥ 30 % · turbidez < 40 NTU |
| Níveis de alerta | ok · atenção · crítico |
| Retenção no InfluxDB | 30 dias |
| Pontos máximos no gráfico | ~360 |
| MQTT → navegador | 78 ms |
| Perda de mensagem medida | 0 % |
| Testes do backend | 106 passando |
| Fallback do WebSocket | polling a cada 5 s |

---

## 6. Glossário

| Termo | Significado |
| --- | --- |
| Broker | servidor que recebe e distribui as mensagens MQTT |
| Tópico | "endereço" hierárquico da mensagem (`a/b/c`); `+` e `#` são curingas |
| Pub/Sub | quem envia não conhece quem recebe; ambos só conhecem o broker |
| Bridge | um broker assinando outro e repassando tópicos |
| Measurement | equivalente a "tabela" no InfluxDB |
| Tag × field | dimensão indexada × valor medido |
| Flux | linguagem de consulta do InfluxDB 2.x |
| `aggregateWindow` | calcula média (ou outra função) por janela de tempo |
| WebSocket | conexão aberta em que o servidor manda dados sem pedido |
| Polling | o cliente pergunta de tempos em tempos |
| Lifespan | código que roda ao subir e ao desligar a aplicação FastAPI |
| Pydantic | valida um dicionário contra uma classe com tipos |
| Composable | função Vue 3 que reúne estado reativo e lógica reaproveitável |
| Healthcheck | comando que o Docker roda para saber se o container está pronto |
