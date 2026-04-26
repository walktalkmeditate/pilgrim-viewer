import './edit.css'
import { createStaging } from './staging'

export interface EditLayer {
  staging: ReturnType<typeof createStaging>
}

// Expanded in Task 25 to attach the toggle, drawer, and affordances.
export function mountEditLayer(): EditLayer {
  const staging = createStaging()
  return { staging }
}
