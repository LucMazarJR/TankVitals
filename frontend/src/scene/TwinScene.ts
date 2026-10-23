import {
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  Raycaster,
  RingGeometry,
  Scene,
  Sphere,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Device } from '../domain/devices'
import { planTanks, type TankSpec } from '../plant/tanks'
import { CameraRig, type CameraPose, type ZoomLimits } from './CameraRig'
import { disposeTree } from './dispose'
import { createEnvironment } from './environments'
import type { Environment, Scenery } from './environments/types'
import type { PickTarget, TwinFocus } from './focus'
import { Tooltip } from './markers'
import { detectQuality, FrameBudget, type Quality } from './quality'
import { TankRig, type RigSource } from './TankRig'
import { readPalette, type Palette } from './tokens'

/**
 * O gêmeo digital (WEB-05 a WEB-08), em Three.js puro: o loop de animação fica
 * aqui, explícito. A cena nunca é refeita a cada mensagem: ela lê o store ao
 * vivo de dentro do loop, por `TwinSource`. Só o cadastro (tanques e itens que
 * entram e saem), o cenário e o contraste reconstroem objetos.
 *
 * Cada zona do cadastro é um tanque (`TankRig`), e o cenário escolhido decide
 * onde cada um fica.
 */

/** O que a cena lê do app, de dentro do loop. */
export interface TwinSource extends RigSource {
  /** Nada chegou nos últimos 10 s: a cena congela e avisa. */
  frozen(): boolean
}

/** O que a cena avisa à tela. */
export interface TwinHandlers {
  /** Clicou num tanque ou num item; `null` é clique no vazio. */
  onPick(target: PickTarget | null): void
}

export interface Insets {
  right: number
  bottom: number
}

/** Estado e marcadores mudam 4 vezes por segundo (e só se mudaram); o resto anda a cada quadro. */
const STATUS_EVERY_S = 0.25

const LIMITS: Record<TwinFocus['level'], ZoomLimits> = {
  overview: { min: 4, max: 48 },
  tank: { min: 2.5, max: 16 },
  item: { min: 1.1, max: 8 },
}

export class TwinScene {
  private readonly container: HTMLElement
  private readonly source: TwinSource
  private readonly handlers: TwinHandlers
  private readonly renderer: WebGLRenderer
  private readonly labels: CSS2DRenderer
  private readonly cameraRig: CameraRig
  private readonly tooltip: Tooltip
  private readonly scene = new Scene()
  private readonly timer = new Timer()
  private readonly resize: ResizeObserver
  private readonly budget = new FrameBudget()
  private readonly quality: Quality
  private palette: Palette

  private scenery: Scenery
  private env: Environment | null = null
  private specs: TankSpec[] = []
  private readonly rigs = new Map<string, TankRig>()
  /** Muda quando os tanques ou o tamanho deles mudam: aí o cenário se refaz. */
  private layoutKey = ''

  private focusTarget: TwinFocus = { level: 'overview' }
  private insets: Insets = { right: 0, bottom: 0 }
  private framed = false
  private selection: Mesh | null = null

  private statusTimer = 0
  /** Sem mensagem há mais de 10 s: nada anda, tudo fica cinza. */
  private frozen = true
  /** Relógio do cenário (nuvens): para quando a cena congela. */
  private t = 0
  /** Quanto é dia, de 0 (noite) a 1, pela luminosidade lida; anda suave. */
  private daylight = 1
  private targetDaylight = 1

  // Clique e dica do mouse (WEB-08).
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private pressedAt: { x: number; y: number } | null = null
  private hover: PointerEvent | null = null
  private hovering: { target: PickTarget; x: number; y: number } | null = null

  /** Quem pediu menos movimento no sistema: câmera sem voo, bomba sem tremer. */
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(container: HTMLElement, source: TwinSource, handlers: TwinHandlers, options: { scenery: Scenery }) {
    this.container = container
    this.source = source
    this.handlers = handlers
    this.scenery = options.scenery
    this.palette = readPalette()

    this.renderer = new WebGLRenderer({ antialias: true })
    this.quality = detectQuality(this.renderer)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio))
    this.renderer.toneMapping = NeutralToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.domElement.classList.add('twin-canvas')
    container.append(this.renderer.domElement)

    // Selos e pinos em HTML por cima do canvas: texto nítido em qualquer zoom.
    this.labels = new CSS2DRenderer()
    this.labels.domElement.classList.add('twin-labels')
    container.append(this.labels.domElement)
    this.tooltip = new Tooltip(container)

    this.cameraRig = new CameraRig(this.renderer.domElement)

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)

    this.resize = new ResizeObserver(() => this.fit())
    this.resize.observe(container)
    this.fit()

    this.renderer.setAnimationLoop((time) => this.frame(time))
  }

  /** Monta os tanques do cadastro. Chamado quando o cadastro muda, nunca por mensagem. */
  setDevices(devices: Device[]): void {
    this.specs = planTanks(devices)
    const wanted = new Set(this.specs.map((spec) => spec.id))
    for (const [id, rig] of this.rigs) {
      if (!wanted.has(id)) this.removeRig(id, rig)
    }
    for (const spec of this.specs) {
      const rig = this.rigs.get(spec.id)
      if (rig && rig.spec.signature === spec.signature) {
        rig.updateSpec(spec)
        continue
      }
      if (rig) this.removeRig(spec.id, rig)
      this.addRig(spec)
    }

    const layoutKey = this.specs.map((s) => `${s.id}:${Object.values(s.footprint).map((v) => v.toFixed(2)).join(',')}`).join('|')
    this.statusTimer = 0
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey
      this.buildEnvironment()
      this.applyFocus(true)
    } else {
      // Mesmo desenho: a câmera fica onde a pessoa deixou.
      this.placeRigs()
    }
  }

  /** Troca o cenário: o ambiente, os peixes e onde fica cada tanque. */
  setScenery(id: Scenery): void {
    if (id === this.scenery) return
    this.scenery = id
    this.rebuildAll()
  }

  /** Para onde olhar; a câmera voa até lá (ou pula, com movimento reduzido). */
  focus(target: TwinFocus): void {
    this.focusTarget = target
    this.applyFocus(false)
  }

  /** O quanto os painéis da tela cobrem o canvas, à direita e embaixo. */
  setInsets(insets: Insets): void {
    if (insets.right === this.insets.right && insets.bottom === this.insets.bottom) return
    this.insets = insets
    this.fit()
    this.applyFocus(true)
  }

  /**
   * Troca de contraste: as cores da cena vêm dos tokens do CSS, então ela se
   * remonta com a paleta nova. Acontece quando a pessoa muda no menu, nunca
   * por mensagem.
   */
  refreshPalette(): void {
    this.palette = readPalette()
    this.rebuildAll()
  }

  /** Números do desenho, para conferir as metas de desempenho em desenvolvimento. */
  stats() {
    const { render, memory } = this.renderer.info
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures, quality: this.quality.level }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.resize.disconnect()
    this.cameraRig.dispose()
    this.clearSelection()
    for (const [id, rig] of this.rigs) this.removeRig(id, rig)
    if (this.env) {
      this.env.dispose()
      this.scene.remove(this.env.root)
    }
    this.tooltip.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  // --- montagem ---------------------------------------------------------------------

  private addRig(spec: TankSpec): void {
    const rig = new TankRig(spec, {
      palette: this.palette,
      fish: this.scenery === 'aquario' ? 'ornamental' : 'tilapia',
      fishCount: this.quality.fishPerTank + (this.scenery === 'aquario' ? 2 : 0),
      reducedMotion: this.reducedMotion,
      onPick: (target) => this.handlers.onPick(target),
    })
    this.rigs.set(spec.id, rig)
    this.scene.add(rig.root)
  }

  private removeRig(id: string, rig: TankRig): void {
    this.scene.remove(rig.root)
    rig.dispose()
    this.rigs.delete(id)
  }

  /** O cenário em volta dos tanques, do tamanho que eles pedem. */
  private buildEnvironment(): void {
    if (this.env) {
      this.scene.remove(this.env.root)
      this.env.dispose()
    }
    const env = createEnvironment(this.scenery)
    const footprints = this.specs.map((spec) => spec.footprint)
    const slots = env.slots(footprints)
    env.build({ palette: this.palette, slots, footprints, quality: this.quality })
    this.env = env
    this.scene.add(env.root)
    this.scene.fog = env.fog
    this.scene.background = env.background
    this.specs.forEach((spec, i) => this.rigs.get(spec.id)?.place(slots[i]))
    env.update(this.daylight, this.t)
  }

  private placeRigs(): void {
    if (!this.env) return
    const slots = this.env.slots(this.specs.map((spec) => spec.footprint))
    this.specs.forEach((spec, i) => this.rigs.get(spec.id)?.place(slots[i]))
  }

  /** Cenário novo ou paleta nova: refaz tudo, tanques inclusive (os peixes mudam de espécie). */
  private rebuildAll(): void {
    this.clearSelection()
    for (const [id, rig] of this.rigs) this.removeRig(id, rig)
    this.layoutKey = ''
    if (this.env) {
      this.scene.remove(this.env.root)
      this.env.dispose()
      this.env = null
    }
    const devices = this.specs.flatMap((spec) => spec.members.map((m) => m.device))
    this.setDevices(devices)
  }

  // --- foco -------------------------------------------------------------------------

  /** Leva a câmera, a sombra, os marcadores e o anel de seleção para o foco atual. */
  private applyFocus(instant: boolean): void {
    if (!this.env || !this.framed) return
    // Foco num tanque ou item que saiu do cadastro: volta para a visão geral.
    let focus = this.focusTarget
    if (focus.level !== 'overview' && !this.rigs.has(focus.tank)) focus = { level: 'overview' }
    if (focus.level === 'item' && !this.rigs.get(focus.tank)!.hasItem(focus.device)) focus = { level: 'tank', tank: focus.tank }

    const pose = this.poseFor(focus)
    this.cameraRig.flyTo(pose, LIMITS[focus.level], instant || this.reducedMotion)
    this.fitShadow(focus)
    this.updateSelection(focus)
    this.statusTimer = 0
  }

  private poseFor(focus: TwinFocus): CameraPose {
    const env = this.env!
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    const aspect = this.cameraRig.visibleAspect(width, height, this.insets)

    if (focus.level === 'overview') {
      const sphere = this.allBounds()
      // Longe o bastante para mostrar o cenário em volta, não só os tanques.
      const distance = Math.max(13, sphere.radius * 3) * Math.max(1, 1.35 / aspect)
      const target = sphere.center.clone().setY(1.4)
      return { target, position: target.clone().addScaledVector(env.view.overview.clone().normalize(), distance) }
    }

    const rig = this.rigs.get(focus.tank)!
    if (focus.level === 'tank') {
      const sphere = rig.bounds()
      const distance = 7 * Math.max(1, 1.3 / aspect)
      return { target: sphere.center, position: sphere.center.clone().addScaledVector(env.view.tank.clone().normalize(), distance) }
    }

    // Item: chega perto, de frente para o tanque, mantendo o lado de onde a pessoa já olhava.
    const sphere = rig.bounds(focus.device)
    const camera = this.cameraRig.camera.position.clone().sub(sphere.center)
    const azimuth = Math.max(-1.1, Math.min(1.1, Math.atan2(camera.x, camera.z)))
    const elevation = 0.36
    const direction = new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
    const distance = Math.min(4.2, Math.max(1.7, sphere.radius * 4.5)) * Math.max(1, 1.1 / aspect)
    return { target: sphere.center, position: sphere.center.clone().addScaledVector(direction, distance) }
  }

  /** A esfera que envolve todos os tanques e seus equipamentos. */
  private allBounds(): Sphere {
    if (!this.rigs.size) return new Sphere(new Vector3(0, 1, 0), 4)
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const rig of this.rigs.values()) {
      const { footprint } = rig.spec
      const { x, z } = rig.root.position
      minX = Math.min(minX, x + footprint.minX)
      maxX = Math.max(maxX, x + footprint.maxX)
      minZ = Math.min(minZ, z + footprint.minZ)
      maxZ = Math.max(maxZ, z + footprint.maxZ)
    }
    const center = new Vector3((minX + maxX) / 2, 1, (minZ + maxZ) / 2)
    return new Sphere(center, Math.hypot(maxX - minX, maxZ - minZ) / 2)
  }

  /** A caixa da sombra cobre o que está em foco: sombra nítida onde se olha. */
  private fitShadow(focus: TwinFocus): void {
    const light = this.env!.keyLight
    const sphere = focus.level === 'overview' ? this.allBounds() : this.rigs.get(focus.tank)!.bounds()
    const r = sphere.radius + (focus.level === 'overview' ? 2 : 3.5)
    light.target.position.copy(sphere.center).setY(0)
    Object.assign(light.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 120 })
    light.shadow.camera.updateProjectionMatrix()
    // A luz se posiciona a partir do alvo novo, mesmo com a cena congelada.
    this.env!.update(this.daylight, this.t)
  }

  /** O anel no chão do item escolhido. */
  private updateSelection(focus: TwinFocus): void {
    this.clearSelection()
    if (focus.level !== 'item') return
    const rig = this.rigs.get(focus.tank)!
    const sphere = rig.bounds(focus.device)
    const base = rig.itemBase(focus.device) ?? sphere.center
    const radius = Math.max(0.28, Math.min(1.1, sphere.radius * 0.85))
    const ring = new Mesh(
      new RingGeometry(radius, radius + 0.05, 48),
      new MeshBasicMaterial({ color: this.palette['--accent'], toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    // No pé do item, um pouco acima do piso (ou da borda do tanque, nas sondas).
    ring.position.set(sphere.center.x, base.y + 0.03, sphere.center.z)
    ring.renderOrder = 5
    this.selection = ring
    this.scene.add(ring)
  }

  private clearSelection(): void {
    if (!this.selection) return
    this.scene.remove(this.selection)
    disposeTree(this.selection)
    this.selection = null
  }

  // --- loop ---------------------------------------------------------------------------

  private frame(time: number): void {
    this.timer.update(time)
    const dt = Math.min(this.timer.getDelta(), 0.1)
    if (this.budget.tick(dt)) this.lowerQuality()

    if (this.hover) {
      // Um raio por quadro no máximo, não um por evento do mouse.
      this.updateHover(this.hover)
      this.hover = null
    }

    this.statusTimer -= dt
    if (this.statusTimer <= 0) {
      this.statusTimer = STATUS_EVERY_S
      this.refreshStatus()
    }

    // Congelada, a cena não anda: nem céu, nem água, nem peças. Só a câmera continua livre.
    if (!this.frozen) {
      this.t += dt
      this.daylight += (this.targetDaylight - this.daylight) * Math.min(1, dt * 1.5)
      this.env?.update(this.daylight, this.t)
    }
    const glow = this.env?.tankGlow ?? 0.8
    for (const rig of this.rigs.values()) rig.update(dt, this.source, this.daylight, glow)
    if (this.selection) (this.selection.material as MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(time / 260)

    this.cameraRig.update(dt)
    this.renderer.render(this.scene, this.cameraRig.camera)
    this.labels.render(this.scene, this.cameraRig.camera)
  }

  /** Estado dos tanques, marcadores, a dica e quanto é dia: 4 vezes por segundo. */
  private refreshStatus(): void {
    this.frozen = this.source.frozen()
    // Qualidade baixa: a sombra é refeita aqui, 4 vezes por segundo, e não a cada quadro.
    if (!this.renderer.shadowMap.autoUpdate) this.renderer.shadowMap.needsUpdate = true
    const focus = this.focusTarget
    let lux = 0
    let readings = 0
    for (const rig of this.rigs.values()) {
      const status = rig.refreshStatus(this.source, this.frozen)
      const focused = focus.level !== 'overview' && focus.tank === rig.id
      const mode = focus.level === 'overview' ? 'overview' : focused ? 'focused' : 'background'
      rig.updateMarkers(mode, focus.level === 'item' && focused ? focus.device : null, this.source)
      const light = rig.spec.bindings.light
      if (status.live && light) {
        const value = this.source.value(light.device, light.field)
        if (value !== null) {
          lux += value
          readings += 1
        }
      }
    }
    // A raiz deixa o amanhecer e o entardecer visíveis, não só o meio-dia.
    if (readings) this.targetDaylight = Math.min(1, Math.sqrt(Math.max(0, lux / readings) / 30000))

    // A dica acompanha a leitura enquanto o mouse está parado em cima.
    if (this.hovering) {
      const { target, x, y } = this.hovering
      const rig = this.rigs.get(target.tank)
      if (rig) {
        const { text, level } = rig.describe(target, this.source)
        this.tooltip.show(text, level, x, y)
      }
    }
  }

  /** A máquina não está dando conta: menos pixels e sombra mais leve, de uma vez só. */
  private lowerQuality(): void {
    this.renderer.setPixelRatio(1)
    this.renderer.shadowMap.autoUpdate = false
    this.fit()
  }

  // --- clique e dica ------------------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressedAt = { x: event.clientX, y: event.clientY }
    // A pessoa pegou a câmera no meio do voo: o voo para onde está.
    this.cameraRig.cancel()
  }

  /** Clique de verdade, não o fim de um arrasto da câmera. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pressedAt) return
    const moved = Math.hypot(event.clientX - this.pressedAt.x, event.clientY - this.pressedAt.y)
    this.pressedAt = null
    if (moved <= 6) this.handlers.onPick(this.pick(event))
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.hover = event
  }

  private readonly onPointerLeave = (): void => {
    this.hover = null
    this.hovering = null
    this.tooltip.hide()
    this.renderer.domElement.style.cursor = ''
  }

  private updateHover(event: PointerEvent): void {
    const target = this.pick(event)
    this.renderer.domElement.style.cursor = target ? 'pointer' : ''
    // Dica só com mouse e sem arrastar: no toque ela ficaria presa na tela.
    if (!target || event.pointerType !== 'mouse' || event.buttons !== 0) {
      this.hovering = null
      this.tooltip.hide()
      return
    }
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.hovering = { target, x: event.clientX - rect.left, y: event.clientY - rect.top }
    const rig = this.rigs.get(target.tank)
    if (rig) {
      const { text, level } = rig.describe(target, this.source)
      this.tooltip.show(text, level, this.hovering.x, this.hovering.y)
    }
  }

  /**
   * O que está debaixo do ponteiro. O raio entra e sai da caixa invisível de
   * cada tanque: um item acertado antes da saída (uma sonda dentro do vidro)
   * vence; um item atrás do tanque perde para o tanque.
   */
  private pick(event: PointerEvent): PickTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.cameraRig.camera)
    const pickables = [...this.rigs.values()].flatMap((rig) => rig.pickables)
    let tank: PickTarget | null = null
    for (const hit of this.raycaster.intersectObjects(pickables, true)) {
      const target = hit.object.userData.pick as PickTarget | undefined
      if (!target) continue
      if (target.kind === 'item') return target
      if (!tank) tank = target
      else if (target.tank === tank.tank) return tank
    }
    return tank
  }

  private fit(): void {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(width, height)
    this.labels.setSize(width, height)
    this.cameraRig.setViewport(width, height, this.insets)
    // Primeiro enquadramento só com o canvas já medido.
    if (!this.framed && width > 2 && height > 2) {
      this.framed = true
      this.applyFocus(true)
    }
  }
}
