import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Segment } from '../lib/types'
import { VernacularPanel } from './VernacularPanel'

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(cleanup)

const segment: Segment = { id: 's1', vernacular: '白話內容', themes: ['觀照', '空'], reflection: '提示內容', tokens: [] }

describe('VernacularPanel', () => {
  it('shows title, vernacular, themes and reflection in order', () => {
    render(<VernacularPanel open onOpenChange={() => {}} segment={segment} />)
    const panel = screen.getByTestId('vernacular-panel')
    expect(screen.getByTestId('vernacular-title').textContent).toBe('白話參考')
    expect(screen.getByTestId('vernacular-text').textContent).toBe('白話內容')
    expect(screen.getAllByTestId('vernacular-theme').map((e) => e.textContent)).toEqual(['觀照', '空'])
    expect(screen.getByTestId('vernacular-reflection').textContent).toBe('提示內容')
    const ids = [...panel.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['vernacular-title', 'vernacular-text', 'vernacular-theme', 'vernacular-theme', 'vernacular-reflection'])
  })

  it('renders nothing while closed', () => {
    render(<VernacularPanel open={false} onOpenChange={() => {}} segment={segment} />)
    expect(screen.queryByTestId('vernacular-panel')).toBeNull()
  })
})
