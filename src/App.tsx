import { useEffect, useState } from 'react'
import './App.css'
import NetworkSettingsForm from './NetworkSettingsForm'
import { AEGIS_NETWORK } from './constants'
import { getSettings, setSettings } from './storage'
import type { ExtensionSettings } from './types'

function App() {
  const [settings, setLocalSettings] = useState<ExtensionSettings>(AEGIS_NETWORK.defaultSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getSettings(AEGIS_NETWORK.id).then(setLocalSettings)
  }, [])

  async function save() {
    try {
      await setSettings(settings, AEGIS_NETWORK.id)
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch {
      setError('Invalid settings - check addresses and URLs')
    }
  }

  return (
    <main className="popup-root">
      <h1>Safenet</h1>
      <NetworkSettingsForm
        title={AEGIS_NETWORK.label}
        settings={settings}
        onChange={setLocalSettings}
        onSave={() => void save()}
        saved={saved}
      />
      {error && <p className="error">{error}</p>}
    </main>
  )
}

export default App
