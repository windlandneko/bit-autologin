import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { startApp } from '../src/main.js'
import { store } from '../src/ui.js'

function harness({ auto = false, second = '', fetchImpl } = {}) {
  const dom = new JSDOM(
    `<body><div hidden>
    <p id="login-croypto">${Buffer.alloc(16, 7).toString('base64')}</p>
    <p id="login-page-flowkey">flow-test</p><p id="current-login-type">UsernamePassword</p>
    <p id="login-rule-type">normal</p><p id="sso-second">${second}</p>
    <p id="riskSystemSwitch">USTC</p><p id="siteId">sourceId</p><p id="targetSystem">sso</p><p id="recaptchaVendor">system</p>
    </div><form id="normalLoginForm"></form></body>`,
    { url: 'https://sso.bit.edu.cn/cas/login' },
  )
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  let stored = { username: 'student', password: 'secret', auto }
  const submissions = []
  let requests = 0
  const keys = [
    'MutationObserver',
    'document',
    'location',
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
    GM_getValue: (key, fallback) => (key === 'bit-autologin-settings' ? stored : fallback),
    GM_setValue: (key, value) => {
      if (key === 'bit-autologin-settings') stored = value
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
  assert.equal(store.get().username, '<student>')
  assert.equal(reopened.querySelector('#gm-sso-clear').textContent, '确认清除？')
  reopened.querySelector('#gm-sso-clear').click()
  assert.deepEqual(store.get(), { username: '', password: '', auto: false, optimizedUI: false })
  h.close()
})

test('UI survives Angular replacing the form; settings dialog supports Escape', async () => {
  const h = harness()
  h.dom.window.document.getElementById('normalLoginForm').remove()
  await new Promise((done) => setImmediate(done))
  assert.equal(h.dom.window.document.getElementById('bit-sso-helper'), null)
  const form = h.dom.window.document.createElement('form')
  form.id = 'normalLoginForm'
  h.dom.window.document.body.append(form)
  await new Promise((done) => setImmediate(done))
  assert.ok(form.querySelector('#bit-sso-helper'))
  const root = h.app.ui.openSettings()
  root
    .querySelector('.sso-overlay')
    .dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  root.querySelector('.sso-overlay').dispatchEvent(new h.dom.window.Event('animationend'))
  assert.equal(h.dom.window.document.getElementById('gm-sso-config'), null)
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

test('optimized UI can be toggled without replacing the authentication form', () => {
  const h = harness()
  const form = document.querySelector('#normalLoginForm')
  store.set({ ...store.get(), optimizedUI: true })
  assert.ok(document.documentElement.classList.contains('bit-optimized-ui'))
  assert.ok(document.querySelector('#bit-optimized-ui'))
  store.set({ ...store.get(), optimizedUI: false })
  assert.equal(document.querySelector('#bit-optimized-ui'), null)
  assert.equal(document.documentElement.classList.contains('bit-optimized-ui'), false)
  assert.equal(document.querySelector('#normalLoginForm'), form)
  assert.equal(h.requests(), 0)
  h.close()
})

test('optimized UI does not style other campus pages', () => {
  const h = harness()
  h.dom.reconfigure({ url: 'https://lexue.bit.edu.cn/' })
  store.set({ ...store.get(), optimizedUI: true })
  assert.equal(document.querySelector('#bit-optimized-ui'), null)
  assert.equal(document.documentElement.classList.contains('bit-optimized-ui'), false)
  h.close()
})

test('theme override persists for the session and disabling restores the logo', () => {
  const h = harness()
  const container = document.createElement('div')
  container.innerHTML =
    '<div class="login-title"><img class="login-title-img"></div><div class="login-content"><div id="login-content-right-inner"><div class="wrap-normal-title"></div></div></div>'
  document.body.append(container)
  const logo = container.querySelector('img')
  const originalParent = logo.parentNode
  store.set({ ...store.get(), optimizedUI: true })
  assert.equal(logo.parentNode.className, 'bit-brand-emblem')
  const button = document.querySelector('.bit-theme-button')
  assert.equal(document.documentElement.dataset.bitTheme, 'light')
  assert.equal(h.dom.window.sessionStorage.getItem('bit-autologin-theme'), null)
  const icon = button.innerHTML
  button.click()
  assert.equal(document.documentElement.dataset.bitTheme, 'dark')
  assert.equal(h.dom.window.sessionStorage.getItem('bit-autologin-theme'), 'dark')
  assert.equal(button.innerHTML, icon)
  store.set({ ...store.get(), optimizedUI: false })
  assert.equal(logo.parentNode, originalParent)
  assert.equal(document.querySelector('.bit-theme-button'), null)
  store.set({ ...store.get(), optimizedUI: true })
  assert.equal(document.documentElement.dataset.bitTheme, 'dark')
  h.close()
})

test('optimized settings reuse the card and close with Escape', () => {
  const h = harness()
  const card = document.createElement('div')
  card.className = 'login-content'
  card.innerHTML =
    '<div id="login-content-right-inner"><div class="ant-tabs-content-holder"></div></div>'
  document.body.append(card)
  store.set({ ...store.get(), optimizedUI: true })
  const root = h.app.ui.openSettings()
  assert.equal(card.querySelector('#gm-sso-config').className, 'inline-settings')
  assert.equal(root.querySelector('[name=username]').value, 'student')
  assert.equal(root.activeElement, root.querySelector('form'))
  const overlay = root.querySelector('.sso-overlay')
  overlay.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  overlay.dispatchEvent(new h.dom.window.Event('animationend'))
  assert.equal(card.querySelector('#gm-sso-config'), null)
  h.close()
})

test('cached tab helpers survive detachment and theme teardown restores exact positions', async () => {
  const h = harness()
  const card = document.createElement('div')
  card.className = 'login-content'
  card.innerHTML =
    '<div id="login-content-right-inner"><div class="wrap-normal-title"><b>title</b><div class="topFunctionColor"></div><i>after</i></div><div class="ant-tabs-content-holder"><div class="ant-tabs-tabpane ant-tabs-tabpane-active"><form><div class="passkey-use"><a>如何创建通行密钥？</a></div></form></div></div></div>'
  document.body.append(card)
  const pane = card.querySelector('.ant-tabs-tabpane')
  const holder = pane.parentNode
  const form = pane.querySelector('form')
  const help = pane.querySelector('.passkey-use')
  const remember = card.querySelector('.topFunctionColor')
  const next = remember.nextSibling
  const parent = remember.parentNode
  store.set({ ...store.get(), optimizedUI: true })
  pane.remove()
  await new Promise((done) => setImmediate(done))
  assert.equal(help.hidden, true)
  holder.append(pane)
  await new Promise((done) => setImmediate(done))
  assert.equal(help.isConnected, true)
  assert.equal(help.hidden, false)
  pane.classList.remove('ant-tabs-tabpane-active')
  await new Promise((done) => setImmediate(done))
  store.set({ ...store.get(), optimizedUI: false })
  assert.equal(help.parentNode, form)
  assert.equal(help.hidden, false)
  assert.equal(remember.parentNode, parent)
  assert.equal(remember.nextSibling, next)
  h.close()
})

test('modern UI blocks only the native orientation reload event and restores it on disable', () => {
  const h = harness()
  let orientations = 0
  let resizes = 0
  document.addEventListener('pl_event', () => orientations++)
  h.dom.window.addEventListener('resize', () => resizes++)
  store.set({ ...store.get(), optimizedUI: true })
  document.dispatchEvent(new h.dom.window.Event('pl_event'))
  h.dom.window.dispatchEvent(new h.dom.window.Event('resize'))
  assert.equal(orientations, 0)
  assert.equal(resizes, 1)
  store.set({ ...store.get(), optimizedUI: false })
  document.dispatchEvent(new h.dom.window.Event('pl_event'))
  assert.equal(orientations, 1)
  h.close()
})

test('announcement stays collapsed during native initialization and settings closes it', () => {
  const h = harness()
  const container = document.createElement('div')
  container.innerHTML =
    '<div class="login-content"><div class="login-content-left"></div><button class="newNotice"></button><div id="login-content-right-inner"><div class="ant-tabs-content-holder"></div></div></div>'
  document.body.append(container)
  const card = container.firstElementChild
  const notice = card.querySelector('.login-content-left')
  card.querySelector('.newNotice').onclick = () => notice.classList.toggle('notice-hide')
  store.set({ ...store.get(), optimizedUI: true })
  const button = card.querySelector('.bit-notice-button')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(card.classList.contains('bit-notice-open'), false)
  button.click()
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(notice.classList.contains('notice-hide'), false)
  h.app.ui.openSettings()
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(notice.classList.contains('notice-hide'), true)
  h.close()
})
