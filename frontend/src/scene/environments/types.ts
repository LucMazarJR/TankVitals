import type { Color, DirectionalLight, Fog, Group, Vector3 } from 'three'
import type { Footprint } from '../../plant/tanks'
import type { Quality } from '../quality'
import type { Palette } from '../tokens'

/** Os cenários que a pessoa escolhe no 3D. O tanque e os dados são os mesmos nos três. */
export type Scenery = 'fazenda' | 'galpao' | 'aquario'

export const SCENERY_LABEL: Record<Scenery, string> = {
  fazenda: 'Piscicultura',
  galpao: 'Galpão',
  aquario: 'Aquário',
}

export const SCENERIES: Scenery[] = ['fazenda', 'galpao', 'aquario']

/** Tilápias na criação; peixes coloridos no aquário de exposição. */
export type FishStyle = 'tilapia' | 'ornamental'

/** Onde fica a origem (centro do fundo) de cada tanque no mundo. */
export interface TankSlot {
  origin: Vector3
}

export interface EnvContext {
  palette: Palette
  slots: TankSlot[]
  footprints: Footprint[]
  quality: Quality
}

/**
 * Um cenário: o chão, o céu ou as paredes, as luzes e a decoração em volta dos
 * tanques. O cenário é dono das luzes (número fixo, para não recompilar
 * shader) e decide onde cada tanque fica (`slots`), crescendo com quantos
 * tanques houver.
 *
 * Ele só reage a dado ao vivo por `update(daylight)`: a luminosidade lida pelos
 * sensores vira dia e noite. Nada aqui lê o store direto.
 */
export interface Environment {
  readonly id: Scenery
  readonly fish: FishStyle
  readonly root: Group
  /** A única luz com sombra; a cena ajusta a caixa da sombra ao que está em foco. */
  readonly keyLight: DirectionalLight
  /** Direções (normalizadas pela cena) de onde a câmera olha a planta e cada tanque. */
  readonly view: { overview: Vector3; tank: Vector3; maxDistance: number }
  readonly background: Color | null
  readonly fog: Fog | null
  /** Quanto a luz do aquário (água e LED) acende à noite neste cenário. */
  readonly tankGlow: number
  slots(footprints: Footprint[]): TankSlot[]
  build(ctx: EnvContext): void
  /** `daylight` de 0 (noite) a 1 (meio-dia), já suavizado; `t` é o relógio da cena. */
  update(daylight: number, t: number): void
  dispose(): void
}
