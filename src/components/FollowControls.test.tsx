import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FollowControls } from './FollowControls'

afterEach(cleanup)

describe('FollowControls', () => {
  it('idle shows 誦 with the start label', () => {
    render(<FollowControls playing={false} pace={100} onToggle={() => {}} onCyclePace={() => {}} />)
    const toggle = screen.getByTestId('follow-toggle')
    expect(toggle.textContent).toBe('誦')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('開始隨誦')
  })

  it('playing shows 停 with the pause label', () => {
    render(<FollowControls playing pace={100} onToggle={() => {}} onCyclePace={() => {}} />)
    const toggle = screen.getByTestId('follow-toggle')
    expect(toggle.textContent).toBe('停')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('暫停隨誦')
  })

  it.each([
    [60, '慢'],
    [100, '中'],
    [150, '快'],
  ] as const)('pace %i shows %s', (pace, text) => {
    render(<FollowControls playing={false} pace={pace} onToggle={() => {}} onCyclePace={() => {}} />)
    const button = screen.getByTestId('follow-pace')
    expect(button.textContent).toBe(text)
    expect(button.getAttribute('aria-label')).toBe(`隨誦速度：每分鐘 ${pace} 字`)
  })

  it('calls the matching callbacks', () => {
    const onToggle = vi.fn()
    const onCyclePace = vi.fn()
    render(<FollowControls playing={false} pace={100} onToggle={onToggle} onCyclePace={onCyclePace} />)
    fireEvent.click(screen.getByTestId('follow-toggle'))
    fireEvent.click(screen.getByTestId('follow-pace'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onCyclePace).toHaveBeenCalledTimes(1)
  })
})
