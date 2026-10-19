import { LoadError } from './components/LoadError'
import { Reader } from './components/Reader'
import { useReaderData } from './hooks/useReaderData'

export default function App() {
  const { state, reload } = useReaderData()
  // While loading the screen is bare stone-950 (REQ-RDR-029).
  if (state.status === 'loading') return null
  if (state.status === 'error') return <LoadError onReload={reload} />
  return <Reader data={state.data} />
}
