import { AEGIS_PRESETS, type AegisPreset } from './constants'
import type { ExtensionSettings } from './types'

type NetworkSettingsFormProps = {
  title: string
  settings: ExtensionSettings
  onChange: (settings: ExtensionSettings) => void
  onSave: () => void
  saved: boolean
}

const PRESET_LABELS: Record<AegisPreset, string> = { testnet: 'Testnet', prod: 'Prod' }

function matchingPreset(settings: ExtensionSettings): AegisPreset | null {
  const keys = Object.keys(settings) as (keyof ExtensionSettings)[]
  const match = (Object.keys(AEGIS_PRESETS) as AegisPreset[]).find((preset) =>
    keys.every((key) => settings[key].toLowerCase() === AEGIS_PRESETS[preset][key].toLowerCase()),
  )
  return match ?? null
}

function NetworkSettingsForm({ title, settings, onChange, onSave, saved }: NetworkSettingsFormProps) {
  const preset = matchingPreset(settings)
  return (
    <section className="network-section">
      <h2>{title}</h2>
      <p className="preset-hint">{preset ? `${PRESET_LABELS[preset]} defaults` : 'Custom settings'}</p>
      <label>
        <span>Consensus contract</span>
        <input value={settings.consensus} onChange={(e) => onChange({ ...settings, consensus: e.target.value })} />
      </label>
      <label>
        <span>Sentinel Oracle contract</span>
        <input
          value={settings.sentinelOracle}
          onChange={(e) => onChange({ ...settings, sentinelOracle: e.target.value })}
        />
      </label>
      <label>
        <span>RPC endpoint</span>
        <input value={settings.rpc} onChange={(e) => onChange({ ...settings, rpc: e.target.value })} />
      </label>
      <label>
        <span>Relayer URL</span>
        <input value={settings.relayerUrl} onChange={(e) => onChange({ ...settings, relayerUrl: e.target.value })} />
      </label>
      <label>
        <span>Explorer URL</span>
        <input value={settings.explorerUrl} onChange={(e) => onChange({ ...settings, explorerUrl: e.target.value })} />
      </label>
      <div className="button-row">
        <button className="button-secondary" onClick={() => onChange(AEGIS_PRESETS.testnet)}>Load testnet defaults</button>
        <button className="button-secondary" onClick={() => onChange(AEGIS_PRESETS.prod)}>Load prod defaults</button>
      </div>
      <button onClick={() => onSave()}>Save</button>
      {saved && <p>Saved</p>}
    </section>
  )
}

export default NetworkSettingsForm
