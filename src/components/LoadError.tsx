interface Props {
  onReload: () => void
}

export function LoadError({ onReload }: Props) {
  return (
    <div className="load-error" data-testid="load-error">
      <p>經文載入失敗</p>
      <button type="button" className="pill-button" data-testid="reload-button" onClick={onReload}>
        重新載入
      </button>
    </div>
  )
}
