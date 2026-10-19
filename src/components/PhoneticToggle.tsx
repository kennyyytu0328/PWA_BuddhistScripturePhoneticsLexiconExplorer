import type { PhoneticMode } from '../lib/types'

const LABEL: Record<PhoneticMode, string> = {
  zhuyin: '注音',
  pinyin: '拼音',
  iast: '梵文',
  none: '無音標',
}

interface Props {
  mode: PhoneticMode
  onCycle: () => void
}

export function PhoneticToggle({ mode, onCycle }: Props) {
  return (
    <button type="button" className="phonetic-toggle" data-testid="phonetic-toggle" data-mode={mode} onClick={onCycle}>
      {LABEL[mode]}
    </button>
  )
}
