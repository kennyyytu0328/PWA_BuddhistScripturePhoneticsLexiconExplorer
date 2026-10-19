import { useCallback, useEffect, useState } from 'react'
import { loadReaderData } from '../lib/loadData'
import type { ReaderData } from '../lib/types'

export type ReaderDataState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ReaderData }

const LOADING: ReaderDataState = { status: 'loading' }

export function useReaderData() {
  const [state, setState] = useState<ReaderDataState>(LOADING)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadReaderData().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data })
      },
      (error: unknown) => {
        console.error('Failed to load reader data:', error)
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => {
    setState(LOADING)
    setAttempt((n) => n + 1)
  }, [])

  return { state, reload }
}
