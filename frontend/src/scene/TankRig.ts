import {
  Box3,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Sphere,
  TubeGeometry,
  Vector3,
} from 'three'
import { worstLevel } from '../alerts'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import type { Device } from '../domain/devices'
import { FIXTURES, TANK_3D } from '../plant/layout'
import type { FlowBinding, TankMember, TankSpec } from '../plant/tanks'
import type { AlertLevel } from '../types'
import { disposeTree } from './dispose'
import { Bubbles, PipeFlow, Stream } from './effects'
import type { FishStyle, TankSlot } from './environments/types'
import { FishSchool } from './fish'
import type { PickTarget } from './focus'
import { ItemPin, TankBadge } from './markers'
import { buildFilter, buildItem, buildTank, type ItemModel, type TankModel } from './models'
import { roundedPath, routePoints } from './pipes'
import type { Palette } from './tokens'

/**
 * Um tanque inteiro da cena (WEB-05 a WEB-07), em coordenadas locais: o vidro,
 * a água, o cardume, o filtro, os itens do cadastro daquela zona, os tubos
 * entre eles e os efeitos. O cenário diz onde ele fica (`place`); o resto não
 * muda de um tanque para outro.
 *
 * Nada aqui guarda dado ao vivo: a cada quadro o tanque lê o que precisa por
 * `TwinSource`, de dentro do loop único da cena.
 */

/** O que o tanque lê do app, de dentro do loop. */
export interface RigSource {
  value(device: string, field: string): number | null
  state(device: string, field: string): boolean | null
  level(device: Device): ItemLevel
  /** O próprio dispositivo publicou nos últimos 10 s. */
  fresh(device: string): boolean
}

export interface RigContext {
  palette: Palette
  fish: FishStyle
  fishCount: number
  reducedMotion: boolean
  onPick(target: PickTarget): void
}

export interface TankStatus {
  level: ItemLevel
  /** Algum dispositivo do tanque está publicando (e a cena não congelou). */
  live: boolean
  online: number
  total: number
  notOk: Array<{ device: Device; level: ItemLevel }>
}

/** O que os marcadores mostram neste tanque, conforme o foco da tela. */
export type MarkerMode = 'overview' | 'focused' | 'background'

interface RigItem {
  member: TankMember
  model: ItemModel
  pin: ItemPin
  level: ItemLevel | null
}

/** Altura do selo acima da borda do tanque. */
const BADGE_LIFT = 0.75
/** Na visão geral, tanque com mais itens fora do normal que isso mostra só o selo. */
const MAX_OVERVIEW_PINS = 3

export class TankRig {
  readonly id: string
  readonly root = new Group()
  /** O que o clique testa: a caixa invisível do tanque e cada item. */
  readonly pickables: Object3D[] = []
  spec: TankSpec
  status: TankStatus

  private readonly ctx: RigContext
  private readonly tank: TankModel
  private readonly items = new Map<string, RigItem>()
  private readonly nozzles = new Map<string, Object3D>()
  private readonly flows: Array<{ flow: PipeFlow; binding: FlowBinding | null }> = []
  private readonly bubbles: Bubbles
  private readonly refillJet: Stream
  private readonly returnJet: Stream
  private readonly school: FishSchool
  private readonly badge: TankBadge

  /** Relógio próprio: para quando o tanque fica sem dados. */
  private t = 0
  private live = false
  /** Nível da água desenhado agora, em %; anda suave até a leitura. */
  private shownLevel: number | null = null
  /** `null` até a primeira leitura: aí vale direto, sem suavizar. */
  private daylight: number | null = null

  constructor(spec: TankSpec, ctx: RigContext) {
    this.id = spec.id
    this.spec = spec
    this.ctx = ctx
    this.root.name = `tanque:${spec.id}`
    const p = ctx.palette

    this.tank = buildTank(p)
    this.root.add(this.tank.root)
    for (const [name, nozzle] of Object.entries(this.tank.nozzles)) this.nozzles.set(`tank.${name}`, nozzle)

    if (spec.hasFilter) {
      const filter = buildFilter(p)
      filter.root.position.set(...FIXTURES.filter.position)
      this.root.add(filter.root)
      for (const [name, nozzle] of Object.entries(filter.nozzles)) this.nozzles.set(`filter.${name}`, nozzle)
    }

    // A caixa do clique: invisível, do tamanho do tanque. Mesmo invisível o raio a acerta.
    const { width: W, depth: D, height: H } = TANK_3D
    const proxy = new Mesh(new BoxGeometry(W, H, D), new MeshBasicMaterial({ visible: false, side: DoubleSide }))
    proxy.position.y = H / 2
    proxy.userData.pick = { kind: 'tank', tank: spec.id } satisfies PickTarget
    this.root.add(proxy)
    this.pickables.push(proxy)

    for (const member of spec.members) this.addItem(member)

    // Com o tanque ainda na origem, local e mundo são a mesma coisa: os tubos
    // saem certos dos bocais e depois andam junto com o tanque.
    this.root.updateMatrixWorld(true)
    this.buildPipes()

    this.bubbles = new Bubbles(p['--surface'])
    this.refillJet = new Stream(p['--water-line'])
    this.returnJet = new Stream(p['--water-line'])
    this.root.add(this.bubbles.mesh, this.refillJet.column, this.refillJet.drops, this.returnJet.column, this.returnJet.drops)

    this.school = new FishSchool(ctx.fish, p, ctx.fishCount)
    this.school.mesh.visible = false
    this.root.add(this.school.mesh)

    const badgeAnchor = new Object3D()
    badgeAnchor.position.set(0, H + BADGE_LIFT, 0)
    this.root.add(badgeAnchor)
    this.badge = new TankBadge(() => ctx.onPick({ kind: 'tank', tank: spec.id }))
    badgeAnchor.add(this.badge.object)

    this.status = { level: 'vazio', live: false, online: 0, total: spec.members.length, notOk: [] }
  }

  place(slot: TankSlot): void {
    this.root.position.copy(slot.origin)
    this.root.updateMatrixWorld(true)
  }

  /** Mesmos itens nos mesmos lugares, mas o cadastro mudou (uma faixa, um nome): só troca as referências. */
  updateSpec(spec: TankSpec): void {
    this.spec = spec
    for (const member of spec.members) {
      const item = this.items.get(member.device.id)
      if (item) item.member = member
    }
  }

  // --- estado (4 vezes por segundo) -------------------------------------------------

  refreshStatus(src: RigSource, frozen: boolean): TankStatus {
    let online = 0
    for (const item of this.items.values()) if (src.fresh(item.member.device.id)) online += 1
    this.live = !frozen && online > 0

    const levels: AlertLevel[] = []
    const notOk: TankStatus['notOk'] = []
    for (const item of this.items.values()) {
      const device = item.member.device
      const level: ItemLevel = this.live ? src.level(device) : 'vazio'
      if (level !== item.level) {
        item.level = level
        const color = this.levelColor(level)
        for (const material of item.model.status) {
          material.color.copy(color)
          material.emissive.copy(color).multiplyScalar(level === 'vazio' ? 0 : 0.28)
          material.emissiveIntensity = 1
        }
      }
      if (level !== 'vazio') levels.push(level)
      if (this.live && level !== 'ok') notOk.push({ device, level })

      // Lâmpada do atuador: acesa quando ligado.
      const lamp = item.model.lamp
      if (lamp && device.state_field) {
        const on = this.live && src.state(device.id, device.state_field) === true
        lamp.emissive.copy(on ? this.ctx.palette['--accent'] : this.ctx.palette['--night']).multiplyScalar(on ? 1.6 : 0)
        lamp.color.copy(on ? this.ctx.palette['--surface'] : this.ctx.palette['--metal'])
      }
    }

    this.status = {
      level: this.live && levels.length ? worstLevel(levels) : 'vazio',
      live: this.live,
      online,
      total: this.items.size,
      notOk,
    }
    return this.status
  }

  /** Selo e pinos conforme o foco: na visão geral, pouco; no tanque em foco, com texto. */
  updateMarkers(mode: MarkerMode, focusedDevice: string | null, src: RigSource): void {
    const { status } = this
    this.badge.set({
      label: this.spec.label,
      level: status.level,
      notOk: status.notOk.length,
      live: status.live,
      // No tanque em foco o painel mostra tudo; o selo sairia por cima dos pinos.
      visible: mode !== 'focused',
    })
    const crowded = status.notOk.length > MAX_OVERVIEW_PINS
    for (const item of this.items.values()) {
      const level = item.level ?? 'vazio'
      const problem = status.live && level !== 'ok'
      const visible =
        problem &&
        ((mode === 'overview' && !crowded) || (mode === 'focused' && item.member.device.id !== focusedDevice))
      item.pin.set(visible, level, mode === 'focused' ? this.shortText(item.member.device, level, src) : null)
    }
  }

  /** Texto da dica do mouse para o tanque ou um item dele. */
  describe(target: PickTarget, src: RigSource): { text: string; level: ItemLevel } {
    if (target.kind === 'tank') {
      const { level, online, total } = this.status
      return { text: `${this.spec.label} · ${ITEM_LEVEL_TEXT[level]} · ${online} de ${total} online`, level }
    }
    const item = this.items.get(target.device)
    if (!item) return { text: target.device, level: 'vazio' }
    const level = item.level ?? 'vazio'
    const reading = readingText(item.member.device, src)
    return {
      text: [item.member.device.name, reading, ITEM_LEVEL_TEXT[level]].filter(Boolean).join(' · '),
      level,
    }
  }

  // --- animação (a cada quadro) --------------------------------------------------------

  /**
   * `daylight` é o dia do cenário; `glow` diz quanto a luz do aquário acende à
   * noite naquele cenário. Sem dados no tanque, nada anda: nem água, nem peixe.
   */
  update(dt: number, src: RigSource, daylight: number, glow: number): void {
    // A luz do próprio tanque, se ele tiver sensor; senão a do cenário.
    const lux = this.spec.bindings.light ? src.value(this.spec.bindings.light.device, this.spec.bindings.light.field) : null
    const target = lux === null ? daylight : Math.min(1, Math.sqrt(Math.max(0, lux) / 30000))
    this.daylight = this.daylight === null ? target : this.daylight + (target - this.daylight) * Math.min(1, dt * 1.5)

    if (!this.live) return
    this.t += dt
    this.tank.time.value = this.t
    this.updateWater(dt, src)
    this.updateWaterLook(dt, src, glow)
    this.updateActuators(dt, src)
    this.updateFish(dt, src)
    this.shakePump(src)
    this.pulseCritical()
  }

  /** Centro e raio de um item (ou do tanque), no mundo: é para onde a câmera voa. */
  bounds(deviceId?: string): Sphere {
    const item = deviceId ? this.items.get(deviceId) : undefined
    if (item) return new Box3().setFromObject(item.model.root).getBoundingSphere(new Sphere())
    const { width: W, depth: D, height: H } = TANK_3D
    const center = new Vector3(0.3, H * 0.45, 0).add(this.root.position)
    return new Sphere(center, Math.hypot(W, H, D) / 2)
  }

  /** Onde o item está montado (o pé dele), no mundo. */
  itemBase(deviceId: string): Vector3 | null {
    const item = this.items.get(deviceId)
    return item ? item.model.root.getWorldPosition(new Vector3()) : null
  }

  hasItem(deviceId: string): boolean {
    return this.items.has(deviceId)
  }

  dispose(): void {
    this.school.dispose()
    disposeTree(this.root)
  }

  // --- montagem --------------------------------------------------------------------

  private addItem(member: TankMember): void {
    const { device, placement } = member
    const model = buildItem(placement.model, this.ctx.palette)
    model.root.position.set(...placement.position)
    model.root.rotation.y = ((placement.rotationY ?? 0) * Math.PI) / 180
    const pick: PickTarget = { kind: 'item', tank: this.id, device: device.id }
    model.root.traverse((object) => {
      object.userData.pick = pick
    })
    this.root.add(model.root)
    this.pickables.push(model.root)
    for (const [name, nozzle] of Object.entries(model.nozzles)) this.nozzles.set(`${device.id}.${name}`, nozzle)

    const pin = new ItemPin(() => this.ctx.onPick(pick))
    pin.object.center.set(0.5, 1)
    model.labelAnchor.add(pin.object)
    this.items.set(device.id, { member, model, pin, level: null })
  }

  /** Só monta o tubo com os dois bocais na cena: item desativado leva o tubo junto. */
  private buildPipes(): void {
    const p = this.ctx.palette
    const water = new MeshStandardMaterial({ color: p['--surface'], transparent: true, opacity: 0.42, roughness: 0.2, depthWrite: false })
    const air = new MeshStandardMaterial({ color: p['--surface'], transparent: true, opacity: 0.6, roughness: 0.2, depthWrite: false })

    for (const pipe of this.spec.pipes) {
      const from = this.nozzles.get(pipe.from)
      const to = this.nozzles.get(pipe.to)
      if (!from || !to) continue
      const path = roundedPath(routePoints(from, to, pipe.via))
      const tube = new Mesh(
        new TubeGeometry(path, Math.ceil(path.getLength() * 28), pipe.radius, 10, false),
        pipe.medium === 'air' ? air : water,
      )
      tube.renderOrder = 3
      // O que corre dentro: água azul, ar branco.
      const flow = new PipeFlow(path, pipe.radius, pipe.medium === 'air' ? p['--surface'] : p['--accent'])
      this.root.add(tube, flow.mesh)
      this.flows.push({ flow, binding: pipe.flow })
    }
  }

  // --- o que mexe com os dados -----------------------------------------------------

  /** A água vai até o nível lido, sem pular: anda uma fração do caminho por quadro. */
  private updateWater(dt: number, src: RigSource): void {
    const binding = this.spec.bindings.level
    const level = binding ? src.value(binding.device, binding.field) : null
    if (level !== null) {
      const target = Math.min(100, Math.max(0, level))
      this.shownLevel = this.shownLevel === null ? target : this.shownLevel + (target - this.shownLevel) * Math.min(1, dt * 2)
    }
    const { water, surface } = this.tank
    // Tanque sem sensor de nível não ganha água inventada: a cena só mostra o que foi lido.
    if (this.shownLevel === null) {
      water.visible = surface.visible = false
      return
    }
    const inner = TANK_3D.height - TANK_3D.sand - 0.08
    const height = Math.max(0.001, (this.shownLevel / 100) * inner)
    water.visible = surface.visible = true
    water.scale.y = height
    water.position.y = TANK_3D.sand + height / 2
    surface.position.y = TANK_3D.sand + height + 0.002

    // O feixe do sensor de nível vai até a superfície.
    for (const item of this.items.values()) {
      const beam = item.model.parts.beam
      if (!beam) continue
      const top = beam.parent!.position.y + 0.02
      const length = Math.max(0.02, top - surface.position.y)
      beam.visible = true
      beam.scale.y = length
      beam.position.y = 0.02 - length / 2
    }
  }

  /** A água turva com a turbidez e acende à noite, como a luz de um aquário. */
  private updateWaterLook(dt: number, src: RigSource, glow: number): void {
    const p = this.ctx.palette
    const ease = Math.min(1, dt * 1.5)
    const material = this.tank.waterMaterial
    const binding = this.spec.bindings.turbidity
    const ntu = binding ? src.value(binding.device, binding.field) : null
    if (ntu !== null) {
      // Até 10 NTU é água limpa; perto dos 60 do crítico, barrenta.
      const murk = Math.min(1, Math.max(0, (ntu - 10) / 50))
      const target = p['--water'].clone().lerp(p['--scene-murky'], murk)
      material.color.lerp(target, ease)
      material.opacity += (0.42 + 0.4 * murk - material.opacity) * ease
    }
    const night = (1 - (this.daylight ?? 1)) * glow
    material.emissive.copy(p['--accent']).multiplyScalar(0.55 * night)
    // A rede de luz no fundo vem do sol (ou da luminária, à noite) passando pela superfície.
    this.tank.caustics.value = this.tank.surface.visible ? 0.22 * (0.3 + 0.7 * Math.max(this.daylight ?? 1, night)) : 0
    this.tank.led.color.copy(p['--night']).lerp(p['--scene-led'], Math.min(1, 0.25 + night))
  }

  /**
   * Atuadores animados quando ligados (WEB-07): partículas nos tubos pela
   * vazão, bolhas do aerador, jatos da reposição e do retorno e as ventoinhas.
   */
  private updateActuators(dt: number, src: RigSource): void {
    const { bindings } = this.spec
    const surfaceY = this.tank.surface.visible ? this.tank.surface.position.y : TANK_3D.sand

    for (const { flow, binding } of this.flows) flow.update(dt, rate(binding, src))

    const aerator = bindings.aerator ? src.state(bindings.aerator.device, bindings.aerator.field) === true : false
    this.bubbles.update(dt, this.t, aerator, this.tank.emitters.airstone, surfaceY)
    this.refillJet.update(dt, rate(bindings.refill, src), this.tank.emitters.refill, surfaceY)
    this.returnJet.update(dt, this.spec.hasFilter ? rate(bindings.flow, src) : 0, this.tank.emitters.return, surfaceY)

    for (const item of this.items.values()) {
      const fan = item.model.parts.fan
      const field = item.member.device.state_field
      if (fan && field && src.state(item.member.device.id, field)) {
        const axis = fan.userData.axis === 'z' ? 'z' : 'x'
        fan.rotation[axis] += dt * 18
      }
    }
  }

  /** Peixes só existem com água desenhada; o ritmo vem do oxigênio dissolvido. */
  private updateFish(dt: number, src: RigSource): void {
    const { surface } = this.tank
    this.school.mesh.visible = surface.visible
    if (!surface.visible) return
    const binding = this.spec.bindings.oxygen
    this.school.update(dt, this.t, {
      oxygen: binding ? src.value(binding.device, binding.field) : null,
      bottom: TANK_3D.sand,
      top: surface.position.y,
      halfW: TANK_3D.width / 2,
      halfD: TANK_3D.depth / 2,
    })
  }

  /**
   * Quanto mais vibração, mais a bomba treme (WEB-07). Saudável, perto de
   * 1 mm/s, quase não mexe; perto dos 4,5 mm/s do crítico, treme forte. Só o
   * corpo treme: os bocais ficam presos nos tubos.
   */
  private shakePump(src: RigSource): void {
    const { vibration, recirculation } = this.spec.bindings
    if (!vibration) return
    const body = this.items.get(vibration.device)?.model.parts.body
    if (!body) return
    const value = src.value(vibration.device, vibration.field)
    const running = recirculation ? src.state(recirculation.device, recirculation.field) === true : true
    const amplitude =
      !running || value === null || this.ctx.reducedMotion ? 0 : Math.min(1.4, Math.max(0, (value - 0.5) / 4)) * 0.03
    // Senos de frequências diferentes: tremor que não se repete a cada quadro.
    const t = this.t
    body.position.set(amplitude * Math.sin(t * 53), amplitude * 0.4 * Math.sin(t * 61 + 2), amplitude * Math.sin(t * 47 + 1))
    body.rotation.z = amplitude * 1.5 * Math.sin(t * 43)
  }

  /** O crítico pulsa: chama o olho mesmo de longe, no projetor. */
  private pulseCritical(): void {
    const glow = this.ctx.reducedMotion ? 1.4 : 1 + 0.9 * Math.sin(this.t * 6)
    for (const item of this.items.values()) {
      if (item.level !== 'critico') continue
      for (const material of item.model.status) material.emissiveIntensity = glow
    }
  }

  private levelColor(level: ItemLevel) {
    const p = this.ctx.palette
    return { ok: p['--nivel-ok'], atencao: p['--nivel-atencao'], critico: p['--nivel-critico'], vazio: p['--scene-nodata'] }[level]
  }

  /** "pH 8,92 · Crítico", "Aerador · ligado · Atenção": o texto do pino no tanque em foco. */
  private shortText(device: Device, level: ItemLevel, src: RigSource): string {
    if (level === 'vazio') return `${shortName(device)} · ${ITEM_LEVEL_TEXT.vazio}`
    const reading = readingText(device, src, true)
    return [reading || device.name, ITEM_LEVEL_TEXT[level]].join(' · ')
  }
}

/** Quanto corre num tubo: a vazão sobre a cheia, ou 1 e 0 pelo estado do atuador. */
function rate(binding: FlowBinding | null, src: RigSource): number {
  if (!binding) return 0
  if (binding.full) {
    const value = src.value(binding.device, binding.field)
    return value === null ? 0 : Math.min(1.2, Math.max(0, value / binding.full))
  }
  return src.state(binding.device, binding.field) ? 1 : 0
}

function shortName(device: Device): string {
  return device.kind === 'sensor' && device.fields[0] ? device.fields[0].short : device.name
}

/** "7,21 pH", "ligado", "1,21 mm/s"; `short` põe a grandeza na frente ("pH 7,21"). */
function readingText(device: Device, src: RigSource, short = false): string {
  const field = device.fields[0]
  if (field) {
    const v = src.value(device.id, field.key)
    if (v === null) return ''
    const n = v.toLocaleString('pt-BR', { minimumFractionDigits: field.decimals, maximumFractionDigits: field.decimals })
    const unit = field.unit && field.unit !== field.short ? ` ${field.unit}` : ''
    if (!short) return `${n} ${field.unit}`.trim()
    return device.kind === 'sensor' ? `${field.short} ${n}${unit}` : `${device.name} · ${n}${unit}`
  }
  if (device.state_field) {
    const on = src.state(device.id, device.state_field)
    if (on === null) return ''
    return short ? `${device.name} · ${on ? 'ligado' : 'desligado'}` : on ? 'ligado' : 'desligado'
  }
  return ''
}
