import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bestDshVersionInDlxCache, dshVersionAtLeast, isProcessAlive, maskPath, pnpmCacheRoot, psQuote, quoteCmdArg, resolveDshHome, toEnglish } from '../src/common.ts'

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

test('pnpmCacheRoot resolves the platform cache root', () => {
  assert.equal(pnpmCacheRoot('darwin', {}, '/Users/me'), join('/Users/me', 'Library', 'Caches', 'pnpm'))
  assert.equal(pnpmCacheRoot('linux', { XDG_CACHE_HOME: '/xdg' }, '/home/me'), join('/xdg', 'pnpm'))
  assert.equal(pnpmCacheRoot('linux', {}, '/home/me'), join('/home/me', '.cache', 'pnpm'))
})

test('pnpmCacheRoot uses LOCALAPPDATA on win32', (t) => {
  if (process.platform !== 'win32') {
    t.skip('win32-only path')
    return
  }
  assert.equal(pnpmCacheRoot('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me'), 'C:\\Users\\me\\AppData\\Local\\pnpm-cache')
  assert.equal(pnpmCacheRoot('win32', {}, 'C:\\Users\\me'), 'C:\\Users\\me\\AppData\\Local\\pnpm-cache')
})

test('bestDshVersionInDlxCache scans dlx slots and picks the newest dsh', () => {
  const root = join(tmpdir(), 'dsh-dlx-test-' + process.pid)
  try {
    const mk = (v: string): void => {
      const dir = join(root, 'hash-' + v, 'tmp', 'node_modules', '@deepseek-ai', 'dsh')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: v }))
    }
    mk('0.1.0-rc.8')
    mk('0.1.1-rc.2')
    mk('0.1.0-rc.7')
    // slots without dsh are ignored
    mkdirSync(join(root, 'hash-other', 'tmp', 'node_modules', 'some-pkg'), { recursive: true })
    assert.equal(bestDshVersionInDlxCache(root), '0.1.1-rc.2')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('bestDshVersionInDlxCache returns undefined when the cache is absent', () => {
  assert.equal(bestDshVersionInDlxCache(join(tmpdir(), 'dsh-dlx-none-' + process.pid)), undefined)
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
