import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Definition } from './Definition'

afterEach(cleanup)

describe('Definition', () => {
  it('keeps text verbatim, newlines and surrounding spaces included', () => {
    const { container } = render(<Definition parts={[' 一\n二 ']} />)
    expect(container.querySelector('p')!.textContent).toBe(' 一\n二 ')
  })

  it('renders gaiji objects as inline images at their position', () => {
    const { container } = render(<Definition parts={['甲', { g: 'DF-1' }, '乙']} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('data/gaiji/DF-1.png')
    expect(img.dataset.gaiji).toBe('DF-1')
    expect(container.querySelector('p')!.childNodes[1]).toBe(img)
  })

  it('wraps private-use characters as labelled missing glyphs without changing the text', () => {
    const { container } = render(<Definition parts={['似鵒']} />)
    const glyph = screen.getByRole('img', { name: '缺字' })
    expect(glyph.textContent).toBe('')
    expect(container.querySelector('p')!.textContent).toBe('似鵒')
  })
})
