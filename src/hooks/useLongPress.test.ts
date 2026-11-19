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
  const props = { enabled }
  const onLongPress = vi.fn()
  const onClick = vi.fn()
  function Probe() {
    const handlers = useLongPress({ enabled: props.enabled, onLongPress, onClick })
    return createElement('button', { type: 'button', 'data-testid': 'b', ...handlers })
  }
  const { rerender } = render(createElement(Probe))
  const setEnabled = (value: boolean) => {
    props.enabled = value
    rerender(createElement(Probe))
  }
  const button = screen.getByTestId('b')
  const hold = (ms: number) => {
    fireEvent.pointerDown(button)
    act(() => void vi.advanceTimersByTime(ms))
  }
  return { button, onLongPress, onClick, hold, setEnabled }
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
    fireEvent.click(button, { detail: 1 })
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
    fireEvent.click(button, { detail: 1 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('becoming disabled mid-hold drops the hold: no long press, the release is a click', () => {
    const { button, hold, setEnabled, onLongPress, onClick } = setup()
    hold(300)
    setEnabled(false)
    act(() => void vi.advanceTimersByTime(1000))
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled: a long hold is still a click', () => {
    const { button, hold, onLongPress, onClick } = setup(false)
    hold(LONG_PRESS_MS * 2)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('only the primary button starts a hold', () => {
    const { button, onLongPress } = setup()
    fireEvent.pointerDown(button, { button: 2 })
    fireEvent.pointerDown(button, { button: 1 })
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS * 2))
    expect(onLongPress).not.toHaveBeenCalled()
    fireEvent.pointerDown(button, { button: 0 })
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('a keyboard click is never swallowed, even after a long press released outside the button', () => {
    const { button, hold, onLongPress, onClick } = setup()
    hold(LONG_PRESS_MS)
    fireEvent.pointerLeave(button)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    fireEvent.click(button, { detail: 0 })
    expect(onClick).toHaveBeenCalledTimes(1)
    fireEvent.click(button, { detail: 1 })
    expect(onClick).toHaveBeenCalledTimes(2)
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
