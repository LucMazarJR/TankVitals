# Roteiro da apresentação — TankVitals

Tarefa ENT-04. Conta a história na ordem em que a rubrica é avaliada, para
nenhum ponto ficar sem ser demonstrado.

**Duração: 8 a 10 min.** A regra da rubrica que manda em tudo: *incluir a
tecnologia no código sem demonstrar funcionamento não pontua*. Então cada bloco
abaixo termina com algo **acontecendo na tela**.

---

## Antes de começar (15 min de folga)

Suba tudo e deixe aberto. O passo a passo completo está em
[COMO-FUNCIONA.md](COMO-FUNCIONA.md#3-como-rodar-do-zero).

- [ ] Docker Desktop aberto, `docker compose ps` com os dois no ar
- [ ] Backend rodando, log visível numa janela
- [ ] Dashboard em <http://localhost:5173>
- [ ] Wokwi aberto e **em foco** — a simulação fica bem mais lenta em aba de
      segundo plano
- [ ] `mosquitto_sub` já rodando num terminal (comando abaixo)
- [ ] Data Explorer do InfluxDB aberto em <http://localhost:8086>
- [ ] `/docs` da API aberto em outra aba
- [ ] Simulador pronto para colar, caso o Wokwi falhe

**Abas do navegador, na ordem de uso:** Wokwi · dashboard · InfluxDB · `/docs`

**Deixe estes dois comandos colados e prontos:**

```bash
# terminal do MQTT (deixe rodando desde o início)
docker exec tankvitals-mosquitto \
  mosquitto_sub -h localhost -t 'tankvitals-unifacef-g3/#' -v

# plano de emergência, se o Wokwi travar
cd backend && .venv\Scripts\python.exe tools/fake_device.py --interval 5
```

> **O relógio do Wokwi engana.** A simulação roda de 3 a 7 vezes mais devagar
> que o tempo real: 5 s de dispositivo levam de 15 a 35 s de relógio. Não
> espere o dashboard piscar a cada 5 segundos na frente da turma — e **não
> fique em silêncio esperando**. Fale enquanto o dado vem.

---

## O roteiro

Preencha quem fala cada parte antes de ensaiar.

| Tempo | Bloco | Quem fala |
| --- | --- | --- |
| 0–1 | O problema | |
| 1–2 | Arquitetura | |
| 2–4 | Dispositivo no Wokwi | |
| 4–5 | MQTT e a bridge | |
| 5–6 | Backend e persistência | |
| 6–8 | Dashboard | |
| 8–9 | Alerta ao vivo | |
| 9–10 | 2º bimestre | |

---

### 0–1 min · O problema — *1,0 pt*

Sem tela ainda, ou com o README aberto.

> "Tanque de criação vive numa faixa estreita: temperatura entre 24 e 28 graus,
> pH entre 6,5 e 8. Fora disso o prejuízo é rápido — a amônia fica tóxica e dá
> mortandade em horas. Hoje o controle é manual: alguém mede duas vezes por dia
> e anota num caderno. O problema não é medir. É não ver o que acontece entre
> as medições, e não ter histórico pra descobrir a causa depois."

Feche com a proposta em uma frase: **medir a cada 5 segundos, mostrar, guardar
e avisar.**

### 1–2 min · Arquitetura — *contextualiza tudo*

Mostre o diagrama do README e ande por ele com o dedo:

> "ESP32 publica em MQTT · Mosquitto transporta · Python valida e grava ·
> InfluxDB guarda a série · FastAPI serve · Vue mostra."

Uma frase por caixa, sem se aprofundar — o aprofundamento vem nos blocos
seguintes. Se perguntarem por que dois brokers, a resposta está no bloco de
4–5 min.

### 2–4 min · O dispositivo — *1,5 pt*

No Wokwi:

1. **Mostre o circuito** e nomeie os quatro sensores. Aponte os dois resistores
   e explique que têm funções diferentes: 4,7 kΩ é o *pull-up* do DS18B20, 220 Ω
   limita a corrente do LED.
2. **Mostre o monitor serial** com as linhas `[pub] {...}` saindo.
3. **Mexa num sensor ao vivo** — arraste o potenciômetro — e mostre o pH
   acompanhando no serial.

Se sobrar respiro, diga a frase que mostra domínio:

> "Os sensores analógicos estão no GPIO 34 e 35 porque o ESP32 tem dois
> conversores e o ADC2 é usado pelo rádio Wi-Fi — ler ADC2 com Wi-Fi ligado
> devolve lixo."

### 4–5 min · MQTT e Mosquitto — *2,0 pts*

Vá para o terminal do `mosquitto_sub`, que já está recebendo.

> "Essas mensagens estão chegando no nosso Mosquitto local. Mas o ESP32 do
> Wokwi roda na nuvem e não alcança o localhost de ninguém. Então ele publica
> num broker público, e o nosso Mosquitto **importa o tópico por bridge**. O
> backend só conversa com o broker local."

Mostre o bloco `connection wokwi-bridge` no `mosquitto.conf`. E explique o
prefixo:

> "O broker público é aberto, qualquer um publica. Por isso o prefixo é único do
> grupo: `tankvitals-unifacef-g3`."

Se quiser um extra forte, mostre o campo `seq` no JSON:

> "Esse contador serve pra detectar perda de mensagem. Medimos 60 segundos e
> não houve lacuna — 0 % de perda, mesmo passando por um broker público."

### 5–6 min · Backend e persistência — *1,0 + 1,5 pts*

Duas telas, em sequência:

1. **Log do backend**, com uma linha por leitura:
   `Leitura gravada: tank_id=tanque-01 temp=26.4 ph=7.2 ... alerta=ok`
2. **Data Explorer do InfluxDB**: measurement `water_reading`, com as tags e os
   fields. Mostre que `tank_id` é *tag* e as grandezas são *fields*.

> "As tags são indexadas, servem pra agrupar. Valor numérico contínuo como tag
> explodiria a cardinalidade do banco. É essa escolha que deixa a gente
> adicionar mais tanques depois sem migrar nada."

Se der tempo, abra o `/docs` e execute um endpoint ao vivo. É o jeito mais rápido
de provar que a API existe e funciona.

### 6–8 min · Dashboard — *2,0 + 1,0 pt*

No painel:

1. **Os 4 cards**, com valor, cor e rótulo.
2. **O gráfico**, apontando a faixa segura tracejada.
3. **Troque o período** (1h → 6h → 24h) e mostre recarregando.
4. **O painel de análise**: mín/média/máx das quatro de uma vez, quanto do
   período cada uma ficou fora da faixa, e a tendência de cada uma.

> "Os limites das faixas não estão escritos no front. Eles vêm de um endpoint,
> `/api/thresholds`, que lê do backend. Assim dispositivo, backend e painel
> nunca discordam — não existe número de faixa repetido no projeto."

E sobre o tempo real:

> "O backend empurra cada leitura por WebSocket assim que ela chega do MQTT —
> medimos 78 milissegundos. Se o WebSocket cair, o painel passa a consultar
> sozinho a cada 5 segundos e tenta reconectar."

### 8–9 min · O alerta ao vivo — *amarra tudo*

**Este é o momento que vale a apresentação.** É onde a corrente inteira aparece
reagindo junto.

Gire o potenciômetro do Wokwi até o pH sair da faixa e narre a reação, na ordem:

1. o **LED vermelho** do circuito acende;
2. o JSON sai no serial com o novo pH;
3. a mensagem aparece no `mosquitto_sub`;
4. o log do backend mostra `alerta=critico`;
5. o **card do pH** fica vermelho e muda o rótulo;
6. o **painel de análise** passa a contar o tempo fora da faixa.

> "Um sensor mudou de valor, e a informação atravessou seis tecnologias até
> virar um alerta na tela."

Depois volte o potenciômetro para 7 e mostre tudo normalizando.

### 9–10 min · Continuidade — *fecha*

O gancho de atuação remota **já funciona** — vale demonstrar se sobrar tempo:

```bash
docker exec tankvitals-mosquitto mosquitto_pub \
  -h test.mosquitto.org -t 'tankvitals-unifacef-g3/tanque-01/cmd' \
  -m '{"interval_s":2}'
```

O dispositivo passa a publicar a cada 2 segundos, sem recompilar. Foi testado.

> "Esse mesmo caminho, no 2º bimestre, aciona aerador e bomba. O `tank_id` já é
> tag no banco, então mais tanques entram sem migração. E o WebSocket já empurra
> evento, então falta só escolher o canal do alarme."

---

## Se algo quebrar na hora

Ensaie estas três, porque as três já aconteceram de verdade.

| Sintoma | Causa provável | O que fazer na hora |
| --- | --- | --- |
| **Dashboard parou de atualizar, mas o Wokwi está rodando** | a simulação do Wokwi atingiu o limite de tempo da sessão | aperte play de novo; o status vira `offline` sozinho pelo Last Will, e isso é bom material de explicação |
| **Nada chega no `mosquitto_sub`** | a bridge caiu (o broker público é de terceiro) | `docker compose restart mosquitto`, espere ~15 s; se não voltar, use o simulador |
| **Painel diz "Sem sinal" mas os cards atualizam** | status retido velho no broker local | `docker compose restart mosquitto` — a bridge reassina e puxa o status certo |
| **Wokwi não compila** | projeto criado como ESP-IDF em vez de Arduino | não dá pra resolver na hora; use o simulador |

**A saída de emergência**, em qualquer caso:

```bash
cd backend && .venv\Scripts\python.exe tools/fake_device.py --interval 5
```

Isso publica direto no broker local e pula o broker público inteiro. **Avise que
é o simulador** — a rubrica exige o dispositivo, então isso é recurso de último
minuto para não perder o resto da demonstração, nunca substituto.

---

## Checklist de ensaio (ENT-04)

- [ ] Quem fala cada bloco está preenchido na tabela
- [ ] Ensaiado dentro de 10 min, cronometrado
- [ ] A demonstração do alerta foi ensaiada e funciona
- [ ] Cada integrante sabe responder o básico da frente do colega —
      as perguntas mais comuns e as respostas curtas estão em
      [COMO-FUNCIONA.md §4](COMO-FUNCIONA.md#4-perguntas-que-o-professor-faz-e-a-resposta-curta)
- [ ] Ensaiado o que fazer se a bridge cair
- [ ] Ambiente sobe do zero em menos de 5 min (ENT-03)
