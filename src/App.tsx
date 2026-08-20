import { useEffect, useState } from 'react'
import './App.css'
import NetworkSettingsForm from './NetworkSettingsForm'
import { BETA_NETWORK, Q3_NETWORK } from './constants'
import { getSettings, setSettings } from './storage'
import type { ExtensionSettings, NetworkId } from './types'

function App() {
  const [settings, setLocalSettings] = useState<Record<NetworkId, ExtensionSettings>>({
    beta: BETA_NETWORK.defaultSettings,
    q3: Q3_NETWORK.defaultSettings,
  })
  const [saved, setSaved] = useState<Record<NetworkId, boolean>>({ beta: false, q3: false })

  useEffect(() => {
    void Promise.all([getSettings('beta'), getSettings('q3')]).then(([beta, q3]) => {
      setLocalSettings({ beta, q3 })
    })
  }, [])

  async function save(networkId: NetworkId) {
    await setSettings(settings[networkId], networkId)
    setSaved((prev) => ({ ...prev, [networkId]: true }))
    setTimeout(() => setSaved((prev) => ({ ...prev, [networkId]: false })), 1500)
  }

  return (
    <main className="popup-root">
      <h1>Safenet</h1>
      <NetworkSettingsForm
        title={BETA_NETWORK.label}
        settings={settings.beta}
        defaultSettings={BETA_NETWORK.defaultSettings}
        onChange={(beta) => setLocalSettings((prev) => ({ ...prev, beta }))}
        onSave={() => void save('beta')}
        saved={saved.beta}
      />
      <NetworkSettingsForm
        title={Q3_NETWORK.label}
        settings={settings.q3}
        defaultSettings={Q3_NETWORK.defaultSettings}
        onChange={(q3) => setLocalSettings((prev) => ({ ...prev, q3 }))}
        onSave={() => void save('q3')}
        saved={saved.q3}
        showSentinelOracle
      />
    </main>
  )
}

export default App
