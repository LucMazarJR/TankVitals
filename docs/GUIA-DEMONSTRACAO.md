# Guia de demonstração — TankVitals

Como mostrar o projeto na apresentação do **1º bimestre (28/09/2026)**, critério
por critério da rubrica. Sem slides: tudo é o sistema rodando.

A regra que manda em tudo:

> "A pontuação de cada item dependerá do seu correto funcionamento durante a
> avaliação. A simples inclusão da tecnologia no código, sem demonstrar seu
> funcionamento, não garante a pontuação correspondente."

Então **cada bloco abaixo termina com algo acontecendo na tela**. O texto do
que falar está no [ROTEIRO-APRESENTACAO.md](ROTEIRO-APRESENTACAO.md). Este guia
é o checklist: *o que a rubrica pede → o que abrir → o que o professor tem que
ver*.

---

## 1. Rubrica e onde cada ponto aparece

| Critério | Pts | Bloco (seção 3) | Situação |
| --- | --- | --- | --- |
| Definição do problema e proposta | 1,0 | 3.1 | ✅ |
| Frontend Vue 3 + TypeScript + Vite | 2,0 | 3.6 | ✅ |
| Dispositivo IoT no Wokwi | 1,5 | 3.2 | ✅ |
| MQTT + Mosquitto | 2,0 | 3.3 | ✅ |
| Backend Python recebendo e processando | 1,0 | 3.4 | ✅ |
| Persistência no InfluxDB | 1,5 | 3.5 | ✅ |
| Dashboard com gráfico ou indicador | 1,0 | 3.6 | ✅ |

### Requisitos mínimos

| Requisito | Como provar na hora |
| --- | --- |
| Problema real claramente definido | fala de abertura + README |
| Interface Web em Vue.js 3 | dashboard aberto; `frontend/src/*.vue` |
| TypeScript | `lang="ts"` nos componentes, `frontend/src/types.ts` |
| Projeto com Vite | `npm run dev` rodando; `vite.config.ts` |
| Pelo menos 1 sensor | **4 sensores** no circuito |
| Dispositivo no Wokwi | simulação rodando |
| Comunicação MQTT | `mosquitto_sub` mostrando as mensagens |
| Mosquitto como broker | container `tankvitals-mosquitto` |
| Backend em Python | log do backend gravando cada leitura |
| Leituras no InfluxDB | Data Explorer mostrando `water_reading` |
| Consulta ao histórico | trocar o período do gráfico (1h / 6h / 24h / 7d) |
| Gráfico ou indicador | gráfico + cards + painel de análise |
| Código no GitHub | repositório aberto, histórico de commits |

**O fluxo mínimo exigido** — `Sensor → MQTT → Mosquitto → Python → InfluxDB →
Aplicação Web` — é exatamente a ordem da seção 3.

### Fechar antes de segunda

O sistema está completo para o 1º bimestre: a cadeia foi validada com o ESP32
real no Wokwi em 12/09. O que ainda falta é da entrega:

- [ ] **`git push`** — há commits na `main` local que não estão no GitHub, e
      "código versionado no GitHub" é requisito
- [ ] Commits de **todos os integrantes** no histórico
- [ ] **Link público do projeto no Wokwi** no README
- [ ] Prints do dashboard (normal e em alerta) no README
- [ ] Confirmar com a turma que o prefixo `tankvitals-unifacef-g3` não colide
      com outro grupo
- [ ] Ensaio cronometrado, incluindo o plano de emergência (seção 4)

---

## 2. Preparação (chegar 20 min antes)

Use o caminho já validado do [COMO-FUNCIONA.md §3](COMO-FUNCIONA.md#3-como-rodar-do-zero):
infraestrutura no Docker, backend e front em terminal. Assim o log do backend e
o Vite ficam à vista, o que ajuda a mostrar o Python e o Vite funcionando.

```bash
# Terminal 1 — infraestrutura
cd infra
docker compose up -d
docker compose ps                      # mosquitto Up, influxdb healthy

# Terminal 2 — backend (log fica aberto aqui)
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload

# Terminal 3 — dashboard
cd frontend
npm run dev

# Terminal 4 — MQTT (deixe rodando desde o início)
docker exec tankvitals-mosquitto \
  mosquitto_sub -h localhost -t 'tankvitals-unifacef-g3/#' -v
```

### Checklist

- [ ] Docker Desktop **aberto** (não sobe sozinho depois de reiniciar)
- [ ] `.env` na raiz com `MQTT_TOPIC_PREFIX=tankvitals-unifacef-g3` e o
      `INFLUX_TOKEN` preenchido
- [ ] Os 4 terminais acima rodando
- [ ] Wokwi aberto, simulação rodando e **aba em foco** (em segundo plano fica
      muito mais lenta)
- [ ] Navegador, nesta ordem de abas: **Wokwi · dashboard · InfluxDB · API
      `/docs` · GitHub**
- [ ] Comando de emergência pronto num terminal extra (seção 4)
- [ ] Tabela "quem fala" do roteiro preenchida

| Endereço | O quê |
| --- | --- |
| <http://localhost:5173> | dashboard (Vite) |
| <http://localhost:8000/docs> | documentação interativa da API |
| <http://localhost:8086> | InfluxDB — usuário `tankvitals`, senha `tankvitals123` |

---

## 3. A demonstração, bloco por bloco

A ordem segue o caminho do dado, do sensor até a tela.

### 3.1 Problema e proposta — *1,0 pt*

Sem tela, ou com o README aberto. Em uma frase:

> Tanque de peixe vive numa faixa estreita de temperatura, pH, nível e
> turbidez; hoje se mede à mão duas vezes por dia e não se vê o que acontece
> entre as medições. O TankVitals **mede a cada 5 segundos, mostra, guarda e
> avisa**.

Depois mostre o diagrama do README e percorra as caixas, uma frase por caixa.

### 3.2 Dispositivo no Wokwi — *1,5 pt*

**Abra:** Wokwi.

1. Aponte os **4 sensores** no circuito: DS18B20 (temperatura), HC-SR04
   (nível), potenciômetro (pH) e LDR (turbidez) — e o **LED de alerta**.
2. Mostre o **monitor serial** com as linhas `[pub] {...}` saindo.
3. **Arraste o potenciômetro** e mostre o pH mudando na próxima linha.

**O professor tem que ver:** o JSON saindo do dispositivo com valores que
mudam quando você mexe no sensor.

### 3.3 MQTT + Mosquitto — *2,0 pts*

**Abra:** terminal 4 (`mosquitto_sub`).

1. Mostre as mensagens chegando **no Mosquitto local**, com o tópico na frente.
2. Aponte os dois tipos: `.../telemetry` (JSON) e `.../status` (`online`).
3. Abra `infra/mosquitto/config/mosquitto.conf` no bloco
   `connection wokwi-bridge` e explique por que existem dois brokers.

**Extra forte — Last Will:** pare a simulação do Wokwi. Em alguns segundos
aparece `.../status offline` no terminal, **publicado pelo broker**, não pela
placa. Aperte play de novo e ele volta para `online`.

### 3.4 Backend Python — *1,0 pt*

**Abra:** terminal 2 (log do backend) e a aba `/docs`.

1. No log, uma linha por leitura:
   `Leitura gravada: tank_id=tanque-01 temp=... alerta=ok`
2. No `/docs`, execute ao vivo `GET /api/readings/latest` e mostre o JSON com o
   **nível de alerta calculado** pelo backend — é o "processando" da rubrica.
3. Execute `GET /api/health` → `{"status":"ok","mqtt":true,"influxdb":true}`.

**O professor tem que ver:** o Python recebendo do MQTT, processando e
servindo por HTTP.

### 3.5 InfluxDB — *1,5 pt*

**Abra:** <http://localhost:8086> → Data Explorer.

1. Bucket `tankvitals` → measurement `water_reading`.
2. Mostre as **tags** (`tank_id`, `device_id`, `fw`) e os **fields**
   (`temperature_c`, `ph`, `level_pct`, `turbidity_ntu`...).
3. Clique em *Submit* e mostre os pontos no gráfico do próprio Influx.

**O professor tem que ver:** o dado gravado, fora da nossa aplicação.

### 3.6 Frontend e dashboard — *2,0 + 1,0 pts*

**Abra:** dashboard em <http://localhost:5173>.

1. **Indicadores:** os 4 cards com valor, cor e rótulo.
2. **Tempo real:** mexa no Wokwi e espere o card mudar **sem recarregar a
   página** (WebSocket).
3. **Histórico:** troque o período **1h → 6h → 24h** e mostre o gráfico
   recarregando, com a faixa segura tracejada.
4. **Análise do período:** mín/média/máx, tempo fora da faixa e tendência.
5. **Vue + TS + Vite:** mostre rapidamente um `.vue` com `<script setup
   lang="ts">` e o terminal do `npm run dev`.

> **O relógio do Wokwi engana:** 5 s de simulação levam de 15 a 35 s de
> relógio. Não fique em silêncio esperando o card piscar — fale enquanto o
> dado vem.

### 3.7 Fechamento — o alerta ao vivo

**Este é o momento que amarra a apresentação:** a corrente inteira reagindo
junto. Gire o potenciômetro até o pH passar de 8,5 e narre, em ordem:

1. o **LED vermelho** acende no circuito;
2. o JSON sai no serial com o novo pH;
3. a mensagem aparece no `mosquitto_sub`;
4. o log do backend mostra `alerta=critico`;
5. o card do pH fica vermelho e muda o rótulo;
6. o painel de análise passa a contar tempo fora da faixa.

Volte o potenciômetro para ~7 e mostre tudo normalizando.

> "Um sensor mudou de valor, e a informação atravessou todas as tecnologias da
> stack até virar um alerta na tela."

### 3.8 Continuidade: o plano do 2º bimestre (se sobrar tempo)

O enunciado diz que o projeto **continua no 2º bimestre**. Feche com o plano,
em uma frase por item (detalhes em
[PREPARACAO-PERGUNTAS.md §4](PREPARACAO-PERGUNTAS.md#4-o-plano-para-o-2º-bimestre)):

- **aerador** acionado automaticamente quando a temperatura passar de 28 °C;
- **bomba de reposição** ligada por um botão no dashboard (Web → IoT);
- **PostgreSQL** para usuários, cadastro de dispositivos, faixas e regras;
- **toda a pilha no Docker Compose**.

E mostre que a base já está pronta para isso: o firmware já **recebe comandos**
pelo tópico `/cmd`. Demonstre com:

```bash
docker exec tankvitals-mosquitto mosquitto_pub \
  -h test.mosquitto.org -t 'tankvitals-unifacef-g3/tanque-01/cmd' \
  -m '{"interval_s":2}'
```

O serial mostra `[cmd] intervalo de publicacao agora e 2 s` e as publicações
aceleram.

> "Esse é o mesmo caminho que vai ligar a bomba quando o usuário apertar o
> botão no dashboard."

---

## 4. Se algo quebrar na hora

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Dashboard parou, Wokwi rodando | sessão do Wokwi expirou | play de novo; aproveite para mostrar o `offline` do Last Will |
| Nada chega no `mosquitto_sub` | bridge com o broker público caiu | `docker compose restart mosquitto`, esperar ~15 s |
| Painel "Sem sinal", mas cards atualizam | status retido antigo | `docker compose restart mosquitto` |
| Backend não sobe, `ValidationError` | `INFLUX_TOKEN` faltando no `.env` | preencher o token (ver [infra/README.md](../infra/README.md#credenciais)) |
| Mensagens no broker, nada no backend | prefixo do `.env` diferente do firmware | conferir `MQTT_TOPIC_PREFIX` e reiniciar o backend |
| Wokwi não compila | projeto criado como ESP-IDF | usar o simulador |

**Saída de emergência** — publica direto no broker local, pulando o Wokwi e o
broker público:

```bash
cd backend && .venv\Scripts\python.exe tools/fake_device.py --interval 5
# com alerta forçado:
cd backend && .venv\Scripts\python.exe tools/fake_device.py --interval 5 --anomalia ph
```

**Avise que é o simulador.** A rubrica pontua o dispositivo (1,5 pt); isso só
serve para não perder o resto da demonstração.
