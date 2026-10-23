import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * A câmera do gêmeo 3D: a pessoa gira e aproxima com o mouse (ou os dedos), e
 * ao escolher um tanque ou um item a câmera voa até ele, em vez de pular.
 *
 * O voo contorna o alvo (interpola ângulo e distância, não a reta entre as
 * duas posições), então a câmera não atravessa o vidro do tanque no caminho.
 */

export interface CameraPose {
  position: Vector3
  target: Vector3
}

/** Até onde a pessoa pode aproximar e afastar em cada nível do foco. */
export interface ZoomLimits {
  min: number
  max: number
}

const FLY_SECONDS = 0.9

interface Flight {
  fromTarget: Vector3
  toTarget: Vector3
  from: Spherical
  to: Spherical
  limits: ZoomLimits
  t: number
}

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

export class CameraRig {
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls
  private flight: Flight | null = null
  private readonly offset = new Vector3()

  constructor(canvas: HTMLElement) {
    this.camera = new PerspectiveCamera(38, 1, 0.1, 400)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = 1.45
    this.controls.minDistance = 3
    this.controls.maxDistance = 40
  }

  get flying(): boolean {
    return this.flight !== null
  }

  /** Voa até a pose; `instant` (movimento reduzido, primeiro enquadramento) pula direto. */
  flyTo(pose: CameraPose, limits: ZoomLimits, instant = false): void {
    if (instant) {
      this.flight = null
      this.applyLimits(limits)
      this.controls.target.copy(pose.target)
      this.camera.position.copy(pose.position)
      this.controls.enabled = true
      this.controls.update()
      return
    }
    const from = new Spherical().setFromVector3(this.offset.copy(this.camera.position).sub(this.controls.target))
    const to = new Spherical().setFromVector3(this.offset.copy(pose.position).sub(pose.target))
    // Gira pelo lado mais curto.
    let delta = to.theta - from.theta
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    to.theta = from.theta + delta

    // Durante o voo a distância pode passar dos limites do nível de destino.
    this.controls.minDistance = Math.min(limits.min, from.radius, to.radius)
    this.controls.maxDistance = Math.max(limits.max, from.radius, to.radius)
    this.controls.enabled = false
    this.flight = { fromTarget: this.controls.target.clone(), toTarget: pose.target.clone(), from, to, limits, t: 0 }
  }

  /** A pessoa pegou a câmera no meio do voo: para onde está e devolve o controle. */
  cancel(): void {
    if (!this.flight) return
    this.applyLimits(this.flight.limits)
    this.flight = null
    this.controls.enabled = true
  }

  /** Chamado uma vez por quadro, de dentro do loop. */
  update(dt: number): void {
    const flight = this.flight
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / FLY_SECONDS)
      const k = easeInOutCubic(flight.t)
      this.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k)
      const s = new Spherical(
        MathUtils.lerp(flight.from.radius, flight.to.radius, k),
        MathUtils.lerp(flight.from.phi, flight.to.phi, k),
        MathUtils.lerp(flight.from.theta, flight.to.theta, k),
      )
      this.camera.position.copy(this.controls.target).add(this.offset.setFromSpherical(s))
      this.camera.lookAt(this.controls.target)
      if (flight.t >= 1) {
        this.flight = null
        this.applyLimits(flight.limits)
        this.controls.enabled = true
      }
    }
    if (!this.flight) this.controls.update()
  }

  /**
   * Tamanho do canvas e o que os painéis cobrem por cima dele. O centro da
   * imagem anda para o meio da parte visível, para o que está em foco não
   * ficar escondido atrás do painel.
   */
  setViewport(width: number, height: number, insets: { right: number; bottom: number }): void {
    this.camera.aspect = width / height
    if (insets.right > 0 || insets.bottom > 0) {
      this.camera.setViewOffset(width, height, insets.right / 2, insets.bottom / 2, width, height)
    } else {
      this.camera.clearViewOffset()
    }
    this.camera.updateProjectionMatrix()
  }

  /** Quanto o canvas é "largo" para enquadrar: o painel tira um pedaço da largura. */
  visibleAspect(width: number, height: number, insets: { right: number; bottom: number }): number {
    return Math.max(0.3, (width - insets.right) / Math.max(1, height - insets.bottom))
  }

  dispose(): void {
    this.controls.dispose()
  }

  private applyLimits(limits: ZoomLimits): void {
    this.controls.minDistance = limits.min
    this.controls.maxDistance = limits.max
  }
}
