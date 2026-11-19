import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FollowControls } from './FollowControls'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('FollowControls', () => {
  it('idle shows 誦 with the start label', () => {
    render(<FollowControls playing={false} active={false} pace={225} onToggle={() => {}} onEnd={() => {}} onCyclePace={() => {}} />)
    const toggle = screen.getByTestId('follow-toggle')
    expect(toggle.textContent).toBe('誦')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('開始隨誦')
  })

  it('playing shows 停 with the pause label', () => {
    render(<FollowControls playing active pace={225} onToggle={() => {}} onEnd={() => {}} onCyclePace={() => {}} />)
    const toggle = screen.getByTestId('follow-toggle')
    expect(toggle.textContent).toBe('停')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('暫停隨誦')
  })

  it.each([
    [150, '慢'],
    [225, '中'],
    [300, '快'],
  ] as const)('pace %i shows %s', (pace, text) => {
    render(<FollowControls playing={false} active={false} pace={pace} onToggle={() => {}} onEnd={() => {}} onCyclePace={() => {}} />)
    const button = screen.getByTestId('follow-pace')
    expect(button.textContent).toBe(text)
    expect(button.getAttribute('aria-label')).toBe(`隨誦速度：每分鐘 ${pace} 字`)
  })

  it('voice shows 聲 with the recording label', () => {
    render(<FollowControls playing={false} active={false} pace="voice" onToggle={() => {}} onEnd={() => {}} onCyclePace={() => {}} />)
    const button = screen.getByTestId('follow-pace')
    expect(button.textContent).toBe('聲')
    expect(button.getAttribute('aria-label')).toBe('隨誦速度：原音朗讀')
  })

  it('calls the matching callbacks', () => {
    const onToggle = vi.fn()
    const onCyclePace = vi.fn()
    render(<FollowControls playing={false} active={false} pace={225} onToggle={onToggle} onEnd={() => {}} onCyclePace={onCyclePace} />)
    fireEvent.click(screen.getByTestId('follow-toggle'))
    fireEvent.click(screen.getByTestId('follow-pace'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onCyclePace).toHaveBeenCalledTimes(1)
  })

  describe('long press (REQ-RDR-042)', () => {
    it('in progress: the toggle is described by 長按結束隨誦', () => {
      render(<FollowControls playing={false} active pace={225} onToggle={() => {}} onEnd={() => {}} onCyclePace={() => {}} />)
      const toggle = screen.getByTestId('follow-toggle')
      const id = toggle.getAttribute('aria-describedby')
      expect(id).toBeTruthy()
      expect(document.getElementById(id as string)?.textContent).toBe('長按結束隨誦')
      expect(toggle.getAttribute('aria-label')).toBe('開始隨誦')
    })

    it('not in progress: no description', () => {
      render(<FollowControls playing={false} active={false} pace={225} onToggle={() => {}} onEnd={() => {}} onCyclePace={() => {}} />)
      expect(screen.getByTestId('follow-toggle').hasAttribute('aria-describedby')).toBe(false)
      expect(screen.queryByText('長按結束隨誦')).toBeNull()
    })

    it('holding the toggle 600 ms calls onEnd, not onToggle', () => {
      const onToggle = vi.fn()
      const onEnd = vi.fn()
      render(<FollowControls playing active pace={225} onToggle={onToggle} onEnd={onEnd} onCyclePace={() => {}} />)
      const toggle = screen.getByTestId('follow-toggle')
      fireEvent.pointerDown(toggle)
      act(() => void vi.advanceTimersByTime(600))
      fireEvent.pointerUp(toggle)
      fireEvent.click(toggle)
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(onToggle).not.toHaveBeenCalled()
    })
  })
})
