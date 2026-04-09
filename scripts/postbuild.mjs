import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'

await mkdir('dist', { recursive: true })
await cp('manifest.json', 'dist/manifest.json')

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'))
manifest.background.service_worker = 'background.js'
manifest.content_scripts[0].js = ['content.js']
manifest.action.default_popup = 'popup.html'
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2))
