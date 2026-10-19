import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhoneticToggle } from './PhoneticToggle'

afterEach(cleanup)

describe('PhoneticToggle', () => {
  it.each([
    ['zhuyin', '注音'],
    ['pinyin', '拼音'],
    ['iast', '梵文'],
    ['none', '無音標'],
  ] as const)('shows %s as %s', (mode, label) => {
    render(<PhoneticToggle mode={mode} onCycle={() => {}} />)
    const button = screen.getByTestId('phonetic-toggle')
    expect(button.textContent).toBe(label)
    expect(button.getAttribute('data-mode')).toBe(mode)
  })

  it('calls onCycle on click', () => {
    const onCycle = vi.fn()
    render(<PhoneticToggle mode="zhuyin" onCycle={onCycle} />)
    fireEvent.click(screen.getByTestId('phonetic-toggle'))
    expect(onCycle).toHaveBeenCalledOnce()
  })
})
