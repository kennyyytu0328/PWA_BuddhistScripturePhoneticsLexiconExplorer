import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { FollowProgress } from './FollowProgress'

afterEach(cleanup)

it('is hidden from assistive tech and scales by the fraction', () => {
  render(<FollowProgress fraction={0.5} />)
  const bar = screen.getByTestId('follow-progress')
  expect(bar.getAttribute('aria-hidden')).toBe('true')
  expect(bar.style.transform).toBe('scaleX(0.5)')
})
