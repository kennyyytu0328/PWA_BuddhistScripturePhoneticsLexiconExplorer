import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, useLongPress } from './useLongPress'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(enabled = true) {
  const onLongPress = vi.fn()
  const onClick = vi.fn()
  function Probe() {
    const handlers = useLongPress({ enabled, onLongPress, onClick })
    return createElement('button', { type: 'button', 'data-testid': 'b', ...handlers })
  }
  render(createElement(Probe))
  const button = screen.getByTestId('b')
  const hold = (ms: number) => {
    fireEvent.pointerDown(button)
    act(() => void vi.advanceTimersByTime(ms))
  }
  return { button, onLongPress, onClick, hold }
}

describe('useLongPress', () => {
  it('fires onLongPress after 600 ms of holding', () => {
    const { hold, onLongPress } = setup()
    hold(LONG_PRESS_MS - 1)
    expect(onLongPress).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('releasing earlier is a click', () => {
    const { button, hold, onLongPress, onClick } = setup()
    hold(LONG_PRESS_MS - 100)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    act(() => void vi.advanceTimersByTime(1000))
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('the click after a long press is swallowed', () => {
    const { button, hold, onLongPress, onClick } = setup()
    hold(LONG_PRESS_MS)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.pointerDown(button)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it.each(['pointerLeave', 'pointerCancel'] as const)('%s cancels the hold', (name) => {
    const { button, hold, onLongPress } = setup()
    hold(300)
    fireEvent[name](button)
    act(() => void vi.advanceTimersByTime(1000))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('the click still follows a long press when pointerleave comes after pointerup (touch order)', () => {
    const { button, hold, onClick } = setup()
    hold(LONG_PRESS_MS)
    fireEvent.pointerUp(button)
    fireEvent.pointerLeave(button)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabled: a long hold is still a click', () => {
    const { button, hold, onLongPress, onClick } = setup(false)
    hold(LONG_PRESS_MS * 2)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('suppresses the context menu a touch hold would open', () => {
    const { button } = setup()
    const event = createEvent.contextMenu(button)
    fireEvent(button, event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('unmount clears the timer', () => {
    const { hold, onLongPress } = setup()
    hold(300)
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(1000))
    expect(onLongPress).not.toHaveBeenCalled()
  })
})
