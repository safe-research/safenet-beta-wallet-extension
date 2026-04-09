import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'

await mkdir('dist', { recursive: true })
await cp('manifest.json', 'dist/manifest.json')

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'))
manifest.background.service_worker = 'background.js'
manifest.content_scripts[0].js = ['content.js']
manifest.action.default_popup = 'popup.html'

// Append short commit SHA to name so the installed version is identifiable
// at a glance in brave://extensions / chrome://extensions.
const sha = process.env.GIT_SHA ?? (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
})()
if (sha) manifest.name = `${manifest.name} (${sha})`

await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2))
