import { FarmEnvironment } from './farm'
import { ShowroomEnvironment } from './showroom'
import type { Environment, Scenery } from './types'
import { WarehouseEnvironment } from './warehouse'

export function createEnvironment(id: Scenery): Environment {
  if (id === 'galpao') return new WarehouseEnvironment()
  if (id === 'aquario') return new ShowroomEnvironment()
  return new FarmEnvironment()
}
