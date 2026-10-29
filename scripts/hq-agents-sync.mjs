// #96: bundles .claude/agents/*.md into netlify/lib/hqAgents.json so the hq-desk function
// (and the /hq page) read the SAME employee files the Terminal sessions use. Runs on prebuild;
// the JSON is committed too, so a function deploy never depends on this having run.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, '.claude/agents')
const ORDER = ['michael', 'alex', 'vince', 'tim', 'wes']
const out = {}
for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
  const raw = readFileSync(join(dir, f), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`${f}: missing frontmatter`)
  const fm = Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
  const role = (m[2].match(/^# .*?·\s*(.+?),/m) || [])[1] || ''
  out[fm.name] = { name: fm.name, role, description: fm.description, status: fm.status || '', body: m[2].trim() }
}
const missing = ORDER.filter((k) => !out[k])
if (missing.length) throw new Error('missing agent files: ' + missing.join(', '))
const sorted = Object.fromEntries(ORDER.map((k) => [k, out[k]]))
writeFileSync(join(root, 'netlify/lib/hqAgents.json'), JSON.stringify(sorted, null, 2) + '\n')
console.log('[hq-agents] wrote', ORDER.length, 'agents')
