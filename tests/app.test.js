import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { startApp } from '../src/main.js'
import { store } from '../src/ui.js'

function harness({ auto = false, second = '', fetchImpl, recent = false } = {}) {
  const dom = new JSDOM(
    `<body><div hidden>
    <p id="login-croypto">${Buffer.alloc(16, 7).toString('base64')}</p>
    <p id="login-page-flowkey">flow-test</p><p id="current-login-type">UsernamePassword</p>
    <p id="login-rule-type">normal</p><p id="sso-second">${second}</p>
    <p id="riskSystemSwitch">USTC</p><p id="siteId">sourceId</p><p id="targetSystem">sso</p><p id="recaptchaVendor">system</p>
    </div><form id="normalLoginForm"></form></body>`,
    { url: 'https://sso.bit.edu.cn/cas/login' },
  )
  if (recent) dom.window.sessionStorage.setItem('bit-sso-attempt-v2', String(Date.now()))
  let stored = { username: 'student', password: 'secret', auto }
  const submissions = []
  let requests = 0
  const keys = [
    'MutationObserver',
    'document',
    'location',
    'sessionStorage',
    'GM_getValue',
    'GM_setValue',
    'GM_registerMenuCommand',
    'fetch',
  ]
  const originals = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  Object.assign(globalThis, {
    MutationObserver: dom.window.MutationObserver,
    document: dom.window.document,
    location: dom.window.location,
    sessionStorage: dom.window.sessionStorage,
    GM_getValue: () => stored,
    GM_setValue: (_, value) => {
      stored = value
    },
    GM_registerMenuCommand() {},
    fetch: async (...args) => {
      requests++
      return fetchImpl
        ? fetchImpl(...args)
        : { ok: true, json: async () => ({ responsetoken: 'token' }) }
    },
  })
  dom.window.HTMLFormElement.prototype.submit = function () {
    submissions.push(Object.fromEntries(new dom.window.FormData(this)))
  }
  const pageWindow = { generateFingerprintObject: async () => ({ localgroupId: 'device-test' }) }
  const app = startApp(pageWindow)
  return {
    dom,
    app,
    submissions,
    requests: () => requests,
    close() {
      app.destroy()
      dom.window.close()
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

test('bare SSO entry supports one direct login, duplicate clicks cannot submit twice', async () => {
  const h = harness()
  await Promise.all([h.app.login(), h.app.login()])
  assert.equal(h.requests(), 1)
  assert.equal(h.submissions.length, 1)
  assert.ok(h.dom.window.sessionStorage.getItem('bit-sso-attempt-v2'))
  h.close()
})

test('MFA response does not start network requests even with automatic login enabled', async () => {
  const h = harness({ auto: true, second: 'true' })
  await h.app.login()
  assert.equal(h.requests(), 0)
  assert.match(h.app.ui.status.message, /二次验证/)
  h.close()
})

test('cancel prevents a late non-abortable response from submitting; auto preference stays unchanged', async () => {
  let resolve
  const h = harness({
    fetchImpl: () =>
      new Promise((done) => {
        resolve = done
      }),
  })
  store.set({ username: 'student', password: 'secret', auto: true })
  const task = h.app.login()
  await new Promise((done) => setImmediate(done))
  h.app.cancel()
  resolve({ ok: true, json: async () => ({ responsetoken: 'token' }) })
  await task
  assert.equal(h.submissions.length, 0)
  assert.equal(store.get().auto, true)
  h.close()
})

test('changing flow state during request prevents stale submission', async () => {
  const h = harness({
    fetchImpl: async () => {
      h.dom.window.document.getElementById('login-page-flowkey').textContent = 'new-flow'
      return { ok: true, json: async () => ({ responsetoken: 'token' }) }
    },
  })
  await h.app.login()
  assert.equal(h.submissions.length, 0)
  assert.match(h.app.ui.status.message, /页面已变化/)
  h.close()
})

test('settings preserve credentials containing markup as values; clear removes stored credentials', () => {
  const h = harness()
  const root = h.app.ui.openSettings()
  root.querySelector('#gm-sso-username').value = '<student>'
  root.querySelector('#gm-sso-password').value = '"><script>bad()</script>'
  root.querySelector('form').dispatchEvent(new h.dom.window.Event('submit', { cancelable: true }))
  assert.equal(store.get().password, '"><script>bad()</script>')
  assert.equal(h.dom.window.document.querySelector('script'), null)
  const reopened = h.app.ui.openSettings()
  reopened.querySelector('#gm-sso-clear').click()
  assert.deepEqual(store.get(), { username: '', password: '', auto: false })
  h.close()
})

test('UI survives Angular replacing the form; settings dialog supports Escape', async () => {
  const h = harness()
  h.dom.window.document.getElementById('normalLoginForm').remove()
  await new Promise((done) => setImmediate(done))
  assert.ok(h.dom.window.document.getElementById('bit-sso-helper'))
  const root = h.app.ui.openSettings()
  root
    .querySelector('.sso-overlay')
    .dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(h.dom.window.document.getElementById('gm-sso-config'), null)
  h.close()
})

test('recent attempt pauses automatic reload loops but permits an explicit login', async () => {
  const h = harness({ auto: true, recent: true })
  assert.equal(h.requests(), 0)
  assert.match(h.app.ui.status.message, /暂停自动重试/)
  await h.app.login()
  assert.equal(h.submissions.length, 1)
  h.close()
})

test('combined timeout prevents submission and allows a manual retry', async (t) => {
  const timeout = new AbortController()
  t.mock.method(AbortSignal, 'timeout', () => timeout.signal)
  const h = harness({
    fetchImpl: async (_, { signal }) => {
      timeout.abort(new DOMException('timeout', 'TimeoutError'))
      signal.throwIfAborted()
    },
  })
  t.after(() => h.close())
  await h.app.login()
  assert.equal(h.submissions.length, 0)
  assert.match(h.app.ui.status.message, /请求超时/)
  AbortSignal.timeout.mock.mockImplementation(() => new AbortController().signal)
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ responsetoken: 'retry' }) })
  await h.app.login()
  assert.equal(h.submissions.length, 1)
})
