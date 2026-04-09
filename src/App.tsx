import { useEffect, useState } from 'react'
import './App.css'
import { DEFAULT_SETTINGS } from './constants'
import { getSettings, setSettings } from './storage'
import type { ExtensionSettings } from './types'

function App() {
  const [settings, setLocalSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getSettings().then(setLocalSettings)
  }, [])

  async function save() {
    await setSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <main className="popup-root">
      <h1>Safenet Beta</h1>
      <label>
        <span>Consensus contract</span>
        <input value={settings.consensus} onChange={(e) => setLocalSettings({ ...settings, consensus: e.target.value })} />
      </label>
      <label>
        <span>RPC endpoint</span>
        <input value={settings.rpc} onChange={(e) => setLocalSettings({ ...settings, rpc: e.target.value })} />
      </label>
      <label>
        <span>Relayer URL</span>
        <input value={settings.relayerUrl} onChange={(e) => setLocalSettings({ ...settings, relayerUrl: e.target.value })} />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.autoRun}
          onChange={(e) => setLocalSettings({ ...settings, autoRun: e.target.checked })}
        />
        <span>Auto-run once transaction details are available</span>
      </label>
      <button onClick={() => void save()}>Save</button>
      {saved && <p>Saved</p>}
    </main>
  )
}

export default App
