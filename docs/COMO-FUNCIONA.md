# TankVitals — como funciona e como usar

Explicação completa do sistema, em ordem de leitura. Serve para dois usos:
entender o projeto inteiro, e **conseguir explicar a parte do colega** — o
professor costuma perguntar exatamente para quem não implementou aquele pedaço.

Os contratos técnicos (nomes de campo, tópico, endpoint) estão em
[ARQUITETURA.md](ARQUITETURA.md). Aqui é o "por quê" e o "como rodar".

---

## 1. A ideia em um parágrafo

Tanque de peixe vive numa faixa estreita de temperatura, pH, nível e turbidez.
Fora dela, o prejuízo é rápido — mortandade em horas. Hoje o acompanhamento é
manual: alguém mede duas vezes por dia e anota num caderno. O problema não é
medir, é **não ver o que acontece entre as medições** e **não ter histórico**
para descobrir a causa depois. O TankVitals mede a cada 5 segundos, mostra num
painel, guarda a série temporal e avisa quando sai da faixa.

---

## 2. A corrente, elo por elo

```
[1] ESP32 no Wokwi          lê 4 sensores, monta JSON
       |  MQTT publish
[2] test.mosquitto.org      broker público (o Wokwi está na nuvem)
       |  bridge
[3] Mosquitto local         o broker que o backend conhece
       |  MQTT subscribe
[4] Ingestor Python         valida, classifica, persiste
       |
[5] InfluxDB                série temporal, 30 dias de retenção
       ^  Flux
[6] API FastAPI             REST + WebSocket
       |
[7] Dashboard Vue 3         cards, gráfico, análise
```

### [1] O dispositivo — `firmware/wokwi/sketch.ino`

Um ESP32 simulado no Wokwi com quatro sensores. Cada leitura vira um JSON e é
publicada no MQTT a cada 5 segundos.

| Grandeza | Sensor no circuito | Como é calculada |
| --- | --- | --- |
| Temperatura | DS18B20 (GPIO 4, 1-Wire) | direto da biblioteca |
| pH | potenciômetro (GPIO 34) | `analogRead` 0–4095 → escala 0–14 |
| Nível | HC-SR04 (TRIG 5 / ECHO 18) | distância → % (cheio 5 cm, vazio 45 cm) |
| Turbidez | LDR (GPIO 35) | `analogRead` 0–4095 → 0–100 NTU (mais luz = menos NTU) |

Três decisões que valem saber explicar:

- **Por que GPIO 34 e 35 e não outro pino.** O ESP32 tem dois conversores
  analógicos, e o **ADC2 é usado pelo rádio Wi-Fi**. Ler ADC2 com Wi-Fi ligado
  devolve lixo. Só GPIO 32–39 (ADC1) servem.
- **Campo ausente em vez de zero.** Se um sensor falha, o campo simplesmente
  não entra no JSON. Mandar `0` seria mentira: zero é leitura legítima. Mandar
  `NaN` geraria JSON inválido e o backend descartaria a mensagem inteira.
- **O LED só olha a faixa "ok"**, em binário. A classificação em três níveis é
  do backend — o dispositivo não decide nada de negócio.

### [2] e [3] Por que existem dois brokers

O ESP32 do Wokwi roda **na nuvem** e não enxerga o `localhost` de ninguém. Como
o projeto não tem servidor público, o caminho é invertido: o dispositivo publica
no `test.mosquitto.org` (que é uma instância pública do próprio Mosquitto) e o
**Mosquitto local importa o tópico por bridge**.

Resultado: o backend continua falando só com um broker local, a exigência da
disciplina segue cumprida, e nenhuma máquina da equipe precisa de porta aberta.

O preço é depender de serviço de terceiro, e o broker ser aberto a qualquer um —
por isso o prefixo de tópico é único do grupo: **`tankvitals-unifacef-g3`**.

> Esse prefixo tem que ser **idêntico** em três lugares: `sketch.ino`
> (`TOPIC_PREFIX`), `.env` (`MQTT_TOPIC_PREFIX`) e a linha `topic` da bridge no
> `mosquitto.conf`. Se um divergir, a mensagem sai do ESP32 e **desaparece sem
> erro nenhum** — é o sintoma mais difícil de diagnosticar do projeto.

### [4] O ingestor — `backend/app/mqtt_ingestor.py`

Assina `<prefixo>/+/telemetry` e `<prefixo>/+/status` e, para cada mensagem:
valida → classifica → grava → empurra para o WebSocket.

É a **fronteira de confiança** do sistema: dado de IoT chega sujo. As seis
regras de validação estão na [ARQUITETURA §3](ARQUITETURA.md#3-contrato-do-dado-campos);
a mais interessante é a regra 3 — **grandeza fora da faixa válida descarta só
aquele campo**, não a leitura inteira. Sensor com defeito não derruba os outros
três.

Isso foi visto acontecendo com dado real: o HC-SR04 mandou `distance_cm: 403.5`,
acima do limite de 400, e o log registrou `distancia=None` mantendo temperatura,
pH e turbidez.

Duas armadilhas resolvidas aqui:

- **A assinatura se perde a cada reconexão.** Ela é refeita no `on_connect`; sem
  isso o ingestor conecta e emudece em silêncio.
- **O `paho-mqtt` 2.x exige `CallbackAPIVersion.VERSION2`** e mudou a assinatura
  dos callbacks. Todo tutorial que o Google devolve é da 1.x e estoura.

### [5] O banco — InfluxDB

Série temporal, não banco relacional, porque o dado é `(tempo, valor)` e o que
se pergunta é "como variou". O InfluxDB faz *downsampling* nativo
(`aggregateWindow`) e retenção automática de 30 dias.

| Elemento | Nome |
| --- | --- |
| measurement | `water_reading` |
| **tags** (indexadas) | `tank_id`, `device_id`, `fw` |
| **fields** (valores) | as 4 grandezas + `distance_cm`, `rssi`, `seq` |

**Por que `tank_id` é tag e não field:** tags são indexadas e usadas em
`group by`. São dimensões, com poucos valores distintos. Valor numérico contínuo
como tag explodiria a cardinalidade do banco. Essa escolha é o que permite
vários tanques no 2º bimestre sem migração.

### [6] A API — `backend/app/api.py`

Seis rotas REST e um WebSocket. O ingestor e a API rodam **no mesmo processo**:
o ingestor sobe no `lifespan` do FastAPI, o que simplifica a demonstração e
permite o push ao vivo sem fila no meio.

| Rota | Para quê |
| --- | --- |
| `GET /api/health` | serviço, broker e banco; **503 quando o Influx cai** |
| `GET /api/thresholds` | as faixas da §5, para o front não ter número próprio |
| `GET /api/tanks` | tanques conhecidos, último visto, online |
| `GET /api/readings/latest` | última leitura já classificada |
| `GET /api/readings/history` | série agregada que alimenta o gráfico |
| `GET /api/stats` | mín/máx/média/último + contagem de leituras |
| `WS /ws/live` | cada leitura nova, assim que chega do MQTT |

**A travessia de thread é o ponto delicado.** O ingestor roda em thread do
`paho`, a API em `asyncio`. Para cruzar, usa-se
`asyncio.run_coroutine_threadsafe` com o *event loop* capturado no `lifespan`.
Dar `await` direto da thread do paho não funciona.

A janela de agregação é automática por período, para o gráfico nunca receber
mais pontos do que desenha bem: `1h→10s`, `6h→1m`, `24h→5m`, `7d→1h`. Isso
mantém a série em no máximo 360 pontos, por construção.

### [7] O dashboard — `frontend/src/`

Vue 3 + TypeScript. Recebe as leituras por WebSocket e **cai para consulta a
cada 5 s** se ele falhar, com reconexão automática — o painel não morre se o
backend piscar.

| Painel | Responde |
| --- | --- |
| Barra de status | qual tanque, qual dispositivo, online, há quanto tempo |
| 4 cards | como está **agora**, com cor e rótulo por nível |
| Gráfico | como **variou**, com a faixa segura tracejada |
| **Análise do período** | mín/média/máx das 4, quanto tempo fora da faixa, tendência |
| Últimas leituras | os números crus, para conferência |
| Alertas do período | as ocorrências, da mais recente para a mais antiga |

O front **não tem número de faixa próprio** — todos vêm do `/api/thresholds`.
Isso é o que garante que dispositivo, backend e painel concordem.

---

## 3. Como rodar do zero

Ordem importa. São quatro terminais.

### Pré-requisitos

Docker Desktop **aberto** (ele não sobe sozinho depois de reiniciar a máquina),
Python 3.13 e Node 22.

### Terminal 1 — infraestrutura

```bash
cd infra
docker compose up -d
docker compose ps          # os dois precisam estar Up, o influx healthy
```

Isso sobe o Mosquitto (com a bridge já ativa) e o InfluxDB, já com organização
`unifacef`, bucket `tankvitals` e 30 dias de retenção.

### Configuração (só na primeira vez)

```bash
cp .env.example .env
```

Depois preencha o `INFLUX_TOKEN`. O token do backend tem escopo **apenas** do
bucket `tankvitals` — o passo a passo para gerar está no
[infra/README.md](../infra/README.md#credenciais).

> Sem o token, o backend falha na subida com `ValidationError` dizendo qual
> campo falta. Isso é de propósito: melhor morrer na subida do que dar `401`
> genérico na primeira escrita.

### Terminal 2 — backend

```bash
cd backend
py -m venv .venv                    # só na primeira vez
.venv\Scripts\activate              # Windows
pip install -r requirements.txt     # só na primeira vez
uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Documentação interativa: <http://localhost:8000/docs>

### Terminal 3 — dashboard

```bash
cd frontend
npm ci                # só na primeira vez
npm run dev
```

Painel em <http://localhost:5173>.

### Terminal 4 — a fonte do dado

**Opção A, com o dispositivo real:** abra o projeto no Wokwi e aperte play.
Precisa ser projeto do tipo **Arduino** (aba `sketch.ino`); se aparecer
`main.c`, é ESP-IDF e não compila — ver [O-QUE-FALTA.md](O-QUE-FALTA.md).

**Opção B, sem o Wokwi:** o simulador publica direto no broker local.

```bash
cd backend
.venv\Scripts\python.exe tools/fake_device.py --interval 5
```

Para forçar um alerta:

```bash
.venv\Scripts\python.exe tools/fake_device.py --interval 5 --anomalia ph
```

> O simulador é **ferramenta de desenvolvimento**. Na avaliação quem publica é
> o ESP32 — a rubrica exige o dispositivo funcionando.

### Conferindo que a corrente fechou

```bash
# elo 2→3: a mensagem chegou no broker local?
docker exec tankvitals-mosquitto \
  mosquitto_sub -h localhost -t 'tankvitals-unifacef-g3/#' -v

# elo 3→4: o ingestor gravou?
#   no log do backend: "Leitura gravada: tank_id=tanque-01 temp=..."

# elo 5→6: a API responde?
curl http://localhost:8000/api/readings/latest
```

---

## 4. Perguntas que o professor faz (e a resposta curta)

Cada integrante precisa saber o básico da frente do colega. Estas são as que
mais aparecem.

**"Por que MQTT e não HTTP?"**
MQTT é publish/subscribe, feito para dispositivo com pouca banda e conexão
instável. O dispositivo publica e esquece; quem quiser o dado assina. Com HTTP o
ESP32 precisaria saber o endereço de cada consumidor e manter conexão. Além
disso o MQTT tem *Last Will*, que é como sabemos que o dispositivo caiu.

**"O que é esse Last Will?"**
Uma mensagem que o ESP32 registra no broker **ao conectar**, dizendo "se eu cair
sem avisar, publique `offline` no meu tópico de status". Quem publica é o broker,
não o dispositivo. Foi testado: ao parar a simulação, o status virou `offline`
sozinho.

**"Por que InfluxDB e não MySQL?"**
O dado é série temporal. O Influx tem agregação por janela de tempo nativa
(`aggregateWindow`) e retenção automática. Em SQL cada consulta do gráfico seria
um `GROUP BY` com truncamento de data feito à mão.

**"Por que dois brokers?"**
O Wokwi roda na nuvem e não alcança nosso `localhost`. Ele publica num broker
público e o nosso Mosquitto importa por bridge. O backend só conhece o local.

**"Como o dashboard atualiza sem recarregar?"**
WebSocket: o backend empurra cada leitura nova assim que ela chega do MQTT
(medido: 78 ms). Se o WebSocket cair, o front passa a consultar a cada 5 s
sozinho e tenta reconectar.

**"Onde ficam os limites das faixas?"**
Em um lugar só, no `backend/app/config.py`, lido do `.env`. O firmware usa
apenas a faixa "ok" para o LED, e o front busca tudo no `/api/thresholds`. Não
existe número de faixa repetido no projeto.

**"E se o banco cair no meio?"**
O ingestor registra `WARNING` e continua; quando o banco volta, ele volta a
gravar sem reiniciar nada. O `/api/health` responde `degraded` com HTTP 503
enquanto isso, e os endpoints que dependem do banco devolvem 503 com mensagem.
Testado derrubando o container.

**"Como vocês sabem que não perde mensagem?"**
O payload tem um contador `seq`. Medindo 60 segundos de coleta, `seq` foi de 30
a 34 sem lacuna — 0 % de perda, apesar de passar por um broker público.

---

## 5. O que já foi verificado rodando

Não por leitura de código — com o sistema de pé.

| O quê | Resultado |
| --- | --- |
| Testes do backend | **106 passando** |
| Push do MQTT até o WebSocket | **78 ms** |
| Perda de mensagem (medida por `seq`) | **0 %** |
| Contrato do payload | **12 de 12 campos** da §2.2 |
| Bordas da tabela de alerta | **26 casos**, backend e front idênticos |
| Banco fora do ar | backend sobrevive e volta a gravar |
| Broker fora do ar | ingestor reassina os tópicos e volta |
| Duas abas no WebSocket | recebem a mesma leitura; fechar uma não afeta a outra |

---

## 6. O que vem no 2º bimestre

A base já foi desenhada prevendo:

- **Atuação remota.** O tópico `<prefixo>/<tank>/cmd` já é assinado pelo
  firmware e já funciona: o comando `{"interval_s": 2}` altera o intervalo de
  publicação em tempo de execução, sem recompilar. O mesmo caminho serve para
  acionar aerador ou bomba.
- **Múltiplos tanques.** `tank_id` é tag no InfluxDB, então outro tanque entra
  sem migração de schema.
- **Alarme ativo.** O WebSocket já empurra evento; falta só decidir o canal
  (e-mail, push).

> Uma limitação a saber: a bridge está configurada como `in` (só importa). Para
> o backend **mandar** comando ao dispositivo, ela precisa também exportar —
> hoje o comando tem que ser publicado direto no broker público.
