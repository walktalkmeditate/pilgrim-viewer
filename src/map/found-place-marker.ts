// A found place (Seek arrival) reads as a soft dawn halo rather than a
// pin: a translucent radial glow with a small bright core. The halo
// itself ignores pointer events so it never blocks map interaction;
// only the core is hoverable, revealing the label tooltip.
export function createFoundPlaceElement(label?: string, variant?: 'overlay'): HTMLElement {
  const halo = document.createElement('div')
  halo.className = variant === 'overlay'
    ? 'found-place-halo found-place-halo-overlay'
    : 'found-place-halo'

  const core = document.createElement('div')
  core.className = 'found-place-core'

  if (label) {
    const tip = document.createElement('span')
    tip.className = 'waypoint-tooltip'
    tip.textContent = label
    core.appendChild(tip)
  }

  halo.appendChild(core)
  return halo
}
