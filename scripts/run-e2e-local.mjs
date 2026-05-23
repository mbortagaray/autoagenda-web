import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const defaultEnvFile = process.platform === 'win32'
  ? 'C:\\tmp\\autoagenda-e2e.env'
  : '.env.e2e'

const envFile = process.env.E2E_ENV_FILE || defaultEnvFile

if (existsSync(envFile)) {
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1)
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

const result = spawnSync('npx', ['playwright', 'test'], {
  env: process.env,
  shell: true,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
