import { DirectionalLight, type Material, type Mesh, type Object3D, SpotLight, type Texture } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

/**
 * Tira tudo de um grupo e devolve a memória de vídeo: geometrias, materiais,
 * texturas, mapas de sombra e os elementos HTML dos rótulos. Trocar de cenário
 * ou de contraste várias vezes não pode ir enchendo a placa de vídeo.
 */
export function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh
    mesh.geometry?.dispose()
    for (const material of [mesh.material ?? []].flat() as Material[]) disposeMaterial(material)
    if (object instanceof DirectionalLight || object instanceof SpotLight) object.dispose()
    if (object instanceof CSS2DObject) object.element.remove()
  })
  root.clear()
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose()
  }
  material.dispose()
}
