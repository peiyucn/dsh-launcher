import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { canTransition, dshInstallDir, dshVersionAtLeast, installedDshVersion, isProcessAlive, managedSourceDir, maskPath, pnpmSupportsDangerouslyAllowAllBuilds, psQuote, quoteCmdArg, resolveDshHome, toEnglish, windowsPnpmCandidates } from '../src/common.ts'

test('canTransition allows only valid server phase transitions', () => {
  assert.equal(canTransition('stopped', 'starting'), true)
  assert.equal(canTransition('starting', 'running'), true)
  assert.equal(canTransition('starting', 'stopping'), true)
  assert.equal(canTransition('starting', 'stopped'), true)
  assert.equal(canTransition('running', 'stopping'), true)
  assert.equal(canTransition('stopping', 'stopped'), true)
  assert.equal(canTransition('stopped', 'running'), false)
  assert.equal(canTransition('running', 'starting'), false)
  assert.equal(canTransition('running', 'stopped'), false)
  assert.equal(canTransition('stopped', 'stopping'), false)
})

test('dshVersionAtLeast compares prerelease versions numerically', () => {
  assert.equal(dshVersionAtLeast('0.1.0-rc.8', '0.1.0-rc.8'), true)
  assert.equal(dshVersionAtLeast('0.1.0-rc.10', '0.1.0-rc.8'), true)
  assert.equal(dshVersionAtLeast('0.1.0-rc.7', '0.1.0-rc.8'), false)
  assert.equal(dshVersionAtLeast('', '0.1.0-rc.8'), false)
  assert.equal(dshVersionAtLeast('0.2.0', '0.1.0-rc.8'), true)
})

test('maskPath abbreviates long Windows paths to drive + last segment', () => {
  assert.equal(maskPath('C:\\Users\\me\\dsh-launcher-panel.log'), 'C:\\…\\dsh-launcher-panel.log')
})

test('maskPath abbreviates long Unix paths', () => {
  assert.equal(maskPath('/home/me/project/x.log'), '…/x.log')
})

test('maskPath leaves short paths intact', () => {
  assert.equal(maskPath('C:\\a\\b'), 'C:\\a\\b')
})

test('maskPath returns empty for empty input', () => {
  assert.equal(maskPath(''), '')
})

test('quoteCmdArg quotes args containing special characters', () => {
  assert.equal(quoteCmdArg('a b'), '"a b"')
  assert.equal(quoteCmdArg('a&b'), '"a&b"')
  assert.equal(quoteCmdArg('a|b'), '"a|b"')
})

test('quoteCmdArg leaves plain args unquoted', () => {
  assert.equal(quoteCmdArg('plain'), 'plain')
})

test('psQuote doubles single quotes', () => {
  assert.equal(psQuote("it's"), "it''s")
  assert.equal(psQuote('plain'), 'plain')
})

test('toEnglish strips non-ASCII and parentheticals', () => {
  assert.equal(toEnglish('DeepSeek V3 Chat API（对话）'), 'DeepSeek V3 Chat API')
  assert.equal(toEnglish('全是中文'), '')
})

test('isProcessAlive reports own pid alive and an impossible pid dead', () => {
  assert.equal(isProcessAlive(process.pid), true)
  assert.equal(isProcessAlive(999999999), false)
})

test('dshInstallDir resolves the platform data dir', () => {
  assert.equal(dshInstallDir('darwin', {}, '/Users/me'), join('/Users/me', 'Library', 'Application Support', 'dsh-launcher-panel', 'install'))
  assert.equal(dshInstallDir('linux', { XDG_DATA_HOME: '/xdg' }, '/home/me'), join('/xdg', 'dsh-launcher-panel', 'install'))
  assert.equal(dshInstallDir('linux', {}, '/home/me'), join('/home/me', '.local', 'share', 'dsh-launcher-panel', 'install'))
})

test('dshInstallDir uses LOCALAPPDATA on win32', (t) => {
  if (process.platform !== 'win32') {
    t.skip('win32-only path')
    return
  }
  assert.equal(dshInstallDir('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me'), join('C:\\Users\\me\\AppData\\Local', 'dsh-launcher-panel', 'install'))
})

test('pnpmSupportsDangerouslyAllowAllBuilds gates on pnpm 10.16+', () => {
  assert.equal(pnpmSupportsDangerouslyAllowAllBuilds('11.22.0'), true)
  assert.equal(pnpmSupportsDangerouslyAllowAllBuilds('10.16.0'), true)
  assert.equal(pnpmSupportsDangerouslyAllowAllBuilds('10.15.0'), false)
  assert.equal(pnpmSupportsDangerouslyAllowAllBuilds('9.15.4'), false)
  assert.equal(pnpmSupportsDangerouslyAllowAllBuilds(''), false)
})

test('managedSourceDir is a sibling of the managed install dir', () => {
  const install = dshInstallDir('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me')
  assert.equal(managedSourceDir('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me'), join(dirname(install), 'source'))
})

test('installedDshVersion reads the managed install version', () => {
  const root = join(tmpdir(), 'dsh-install-test-' + process.pid)
  try {
    const dir = join(root, 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.1-rc.2' }))
    assert.equal(installedDshVersion(root), '0.1.1-rc.2')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('installedDshVersion returns undefined when absent', () => {
  assert.equal(installedDshVersion(join(tmpdir(), 'dsh-install-none-' + process.pid)), undefined)
})

test('windowsPnpmCandidates lists the npm-global and pnpm shims', () => {
  const out = windowsPnpmCandidates({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' })
  assert.deepEqual(out, [
    join('C:\\Users\\me\\AppData\\Roaming', 'npm', 'pnpm.cmd'),
    join('C:\\Users\\me\\AppData\\Local', 'pnpm', 'pnpm.cmd'),
  ])
  assert.deepEqual(windowsPnpmCandidates({}), [])
})

test('resolveDshHome prefers DSH_HOME and falls back to ~/.dsh', () => {
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = 'C:\\custom\\dsh'
  assert.equal(resolveDshHome(), 'C:\\custom\\dsh')
  delete process.env.DSH_HOME
  assert.ok(resolveDshHome().endsWith('.dsh'))
  if (prev === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prev
})
