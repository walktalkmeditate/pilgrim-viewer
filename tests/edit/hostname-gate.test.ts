// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

describe('mountEditLayer', () => {
  beforeEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild)
    document.body.classList.remove('tend-on')
  })

  it('adds a Tend button to the header', async () => {
    const header = document.createElement('div')
    document.body.appendChild(header)
    const { mountEditLayer } = await import('../../src/edit/index')
    mountEditLayer(header, document.body)
    const button = header.querySelector('.tend-toggle')
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe('Tend')
  })

  it('clicking Tend toggles the body class', async () => {
    const header = document.createElement('div')
    document.body.appendChild(header)
    const { mountEditLayer } = await import('../../src/edit/index')
    mountEditLayer(header, document.body)
    const button = header.querySelector<HTMLButtonElement>('.tend-toggle')!
    button.click()
    expect(document.body.classList.contains('tend-on')).toBe(true)
    expect(button.textContent).toBe('Done')
    button.click()
    expect(document.body.classList.contains('tend-on')).toBe(false)
  })
})
