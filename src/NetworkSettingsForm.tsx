import type { ExtensionSettings } from './types'

type NetworkSettingsFormProps = {
  title: string
  settings: ExtensionSettings
  defaultSettings: ExtensionSettings
  onChange: (settings: ExtensionSettings) => void
  onSave: () => void
  saved: boolean
  showSentinelOracle?: boolean
}

function NetworkSettingsForm({
  title,
  settings,
  defaultSettings,
  onChange,
  onSave,
  saved,
  showSentinelOracle,
}: NetworkSettingsFormProps) {
  return (
    <section className="network-section">
      <h2>{title}</h2>
      <label>
        <span>Consensus contract</span>
        <input value={settings.consensus} onChange={(e) => onChange({ ...settings, consensus: e.target.value })} />
      </label>
      <label>
        <span>RPC endpoint</span>
        <input value={settings.rpc} onChange={(e) => onChange({ ...settings, rpc: e.target.value })} />
      </label>
      <label>
        <span>Relayer URL</span>
        <input value={settings.relayerUrl} onChange={(e) => onChange({ ...settings, relayerUrl: e.target.value })} />
      </label>
      {showSentinelOracle && (
        <label>
          <span>Sentinel Oracle contract</span>
          <input
            value={settings.sentinelOracle ?? ''}
            onChange={(e) => onChange({ ...settings, sentinelOracle: e.target.value })}
          />
        </label>
      )}
      <div className="button-row">
        <button onClick={() => onSave()}>Save</button>
        <button className="button-secondary" onClick={() => onChange(defaultSettings)}>Reset to default</button>
      </div>
      {saved && <p>Saved</p>}
    </section>
  )
}

export default NetworkSettingsForm
