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

test('cached-page navigation aborts pending login and preserves a working UI on return', async (t) => {
  let resolve
  const h = harness({
    fetchImpl: () =>
      new Promise((done) => {
        resolve = done
      }),
  })
  t.after(() => h.close())
  const pending = h.app.login()
  await new Promise((done) => setImmediate(done))
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide', { persisted: true }))
  resolve({ ok: true, json: async () => ({ responsetoken: 'stale' }) })
  await pending
  assert.equal(h.submissions.length, 0)
  assert.equal(h.app.ui.root.host.isConnected, true)
  const retry = h.app.login()
  await new Promise((done) => setImmediate(done))
  resolve({ ok: true, json: async () => ({ responsetoken: 'fresh' }) })
  await retry
  assert.equal(h.submissions.length, 1)
  assert.equal(h.app.ui.status.message, '正在提交登录信息…')
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide'))
  assert.equal(h.app.ui.root.host.isConnected, false)
})

test('settings trap initial Shift-Tab and wait for the overlay closing animation', (t) => {
  const h = harness()
  t.after(() => h.close())
  const root = h.app.ui.openSettings()
  const form = root.querySelector('form')
  form.dispatchEvent(
    new h.dom.window.KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  assert.equal(root.activeElement, root.querySelector('a'))
  const overlay = root.querySelector('.sso-overlay')
  overlay.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  form.dispatchEvent(new h.dom.window.Event('animationend', { bubbles: true }))
  assert.equal(root.host.isConnected, true)
  overlay.dispatchEvent(new h.dom.window.Event('animationend'))
  assert.equal(root.host.isConnected, false)
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

test('settings preserve markup as values; reset removes credentials and preserves modern UI', () => {
  const h = harness()
  const root = h.app.ui.openSettings()
  root.querySelector('#gm-sso-username').value = '<student>'
  root.querySelector('#gm-sso-password').value = '"><script>bad()</script>'
  root.querySelector('form').dispatchEvent(new h.dom.window.Event('submit', { cancelable: true }))
  assert.equal(store.get().password, '"><script>bad()</script>')
  assert.equal(h.dom.window.document.querySelector('script'), null)
  store.set({ ...store.get(), optimizedUI: true })
  const reopened = h.app.ui.openSettings()
  reopened.querySelector('#gm-sso-reset').click()
  assert.equal(store.get().username, '<student>')
  assert.equal(reopened.querySelector('#gm-sso-reset').textContent, '确认？')
  reopened.querySelector('#gm-sso-reset').click()
  assert.deepEqual(store.get(), { username: '', password: '', auto: false, optimizedUI: true })
  assert.equal(document.documentElement.classList.contains('bit-optimized-ui'), true)
  h.close()
})

test('reset confirmation expires after three seconds and requires a fresh confirmation', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  t.after(() => h.close())
  const reset = h.app.ui.openSettings().querySelector('#gm-sso-reset')
  reset.click()
  t.mock.timers.tick(2999)
  assert.equal(reset.textContent, '确认？')
  t.mock.timers.tick(1)
  assert.equal(reset.textContent, '重置')
  assert.equal(store.get().password, 'secret')
  reset.click()
  assert.equal(store.get().password, 'secret')
  t.mock.timers.tick(2999)
  reset.click()
  assert.equal(store.get().password, '')
})

test('closing settings cancels reset confirmation without affecting a reopened dialog', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  t.after(() => h.close())
  const oldReset = h.app.ui.openSettings().querySelector('#gm-sso-reset')
  oldReset.click()
  t.mock.timers.tick(2000)
  const reset = h.app.ui.openSettings().querySelector('#gm-sso-reset')
  assert.equal(reset.textContent, '重置')
  reset.click()
  t.mock.timers.tick(1000)
  assert.equal(oldReset.textContent, '确认？')
  assert.equal(reset.textContent, '确认？')
  t.mock.timers.tick(2000)
  assert.equal(reset.textContent, '重置')
  assert.equal(store.get().password, 'secret')
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

test('optimized UI synchronizes shadow styling without replacing the authentication form', async () => {
  const h = harness()
  const form = document.querySelector('#normalLoginForm')
  store.set({ ...store.get(), optimizedUI: true })
  assert.ok(document.documentElement.classList.contains('bit-optimized-ui'))
  assert.ok(document.querySelector('#bit-optimized-ui'))
  await new Promise((done) => setImmediate(done))
  assert.equal(h.app.ui.root.host.hasAttribute('data-modern'), true)
  store.set({ ...store.get(), optimizedUI: false })
  assert.equal(document.querySelector('#bit-optimized-ui'), null)
  await new Promise((done) => setImmediate(done))
  assert.equal(h.app.ui.root.host.hasAttribute('data-modern'), false)
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
  assert.equal(root.host.hasAttribute('data-modern'), true)
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
  assert.equal(help.parentNode.parentNode, remember.parentNode)
  assert.equal(remember.parentNode.className, 'bit-login-options')
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

test('remember switch follows the active form through errors, tab changes and replacement', async () => {
  const h = harness()
  const card = document.createElement('div')
  card.className = 'login-content'
  card.innerHTML = `
    <div class="wrap-normal-title"><div class="topFunctionColor"><button type="button">7天免认证</button></div></div>
    <div class="ant-tabs-content-holder">
      <div class="ant-tabs-tabpane ant-tabs-tabpane-active">
        <form id="normalLoginForm"><div class="login-normal-item">账号</div><div class="login-normal-item">密码</div><div class="login-normal-button"><button>登录</button></div></form>
      </div>
      <div class="ant-tabs-tabpane">
        <form id="smsLoginForm"><div class="login-normal-item">手机</div><div class="login-normal-item">验证码</div><div class="login-normal-button"><button>登录</button></div></form>
      </div>
    </div>`
  document.body.append(card)
  const remember = card.querySelector('.topFunctionColor')
  const originalParent = remember.parentNode
  const panes = card.querySelectorAll('.ant-tabs-tabpane')
  const normal = panes[0].querySelector('form')
  const sms = panes[1].querySelector('form')
  const settle = () => new Promise((done) => setImmediate(done))
  store.set({ ...store.get(), optimizedUI: true })
  await settle()
  assert.equal(remember.parentNode.parentNode, normal)
  assert.equal(remember.parentNode.nextElementSibling.className, 'login-normal-button')
  const error = document.createElement('div')
  error.textContent = '输入的账号或密码错误，您还可以尝试9次'
  normal.prepend(error)
  await settle()
  assert.equal(normal.firstElementChild, error)
  assert.equal(remember.parentNode.nextElementSibling.className, 'login-normal-button')
  panes[0].classList.remove('ant-tabs-tabpane-active')
  panes[1].classList.add('ant-tabs-tabpane-active')
  await settle()
  assert.equal(remember.parentNode.parentNode, sms)
  const replacement = sms.cloneNode(true)
  replacement.querySelector('.bit-login-options').remove()
  sms.replaceWith(replacement)
  await settle()
  assert.equal(remember.parentNode.parentNode, replacement)
  store.set({ ...store.get(), optimizedUI: false })
  assert.equal(remember.parentNode, originalParent)
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
  const settings = card.querySelector('.bit-settings-button')
  settings.click()
  assert.equal(settings.getAttribute('aria-expanded'), 'true')
  assert.equal(settings.textContent, '收起')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(notice.classList.contains('notice-hide'), true)
  button.click()
  assert.equal(document.querySelector('#gm-sso-config'), null)
  assert.equal(settings.getAttribute('aria-expanded'), 'false')
  assert.equal(settings.textContent, '设置')
  settings.click()
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  settings.click()
  assert.equal(settings.getAttribute('aria-expanded'), 'false')
  h.close()
})

test('registration links stay in the bottom center and restore when the theme is disabled', async () => {
  const h = harness()
  const card = document.createElement('div')
  card.className = 'login-content'
  card.innerHTML =
    '<div id="login-content-right-inner"><div class="login-panel-box"><a>用户注册</a><a>下载i北理</a></div><div class="ant-tabs-content-holder"></div></div>'
  document.body.append(card)
  const links = card.querySelector('.login-panel-box')
  const originalParent = links.parentNode
  store.set({ ...store.get(), optimizedUI: true })
  await new Promise((done) => setImmediate(done))
  assert.equal(links.parentNode.className, 'bit-bottom-links')
  assert.equal(links.closest('.bit-login-options'), null)
  store.set({ ...store.get(), optimizedUI: false })
  assert.equal(links.parentNode, originalParent)
  h.close()
})

test('reopening settings during its closing animation retires the old panel without hiding the new one', () => {
  const h = harness()
  const card = document.createElement('div')
  card.className = 'login-content'
  card.innerHTML =
    '<div id="login-content-right-inner"><div class="ant-tabs-content-holder"></div></div>'
  document.body.append(card)
  store.set({ ...store.get(), optimizedUI: true })
  const first = h.app.ui.openSettings()
  assert.equal(
    first.querySelector('[name="optimizedUI"]').closest('.sso-heading').querySelector('h2')
      .textContent,
    'AutoLogin 设置',
  )
  first
    .querySelector('.sso-overlay')
    .dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  const next = h.app.ui.openSettings()
  assert.equal(first.host.isConnected, false)
  assert.equal(document.querySelectorAll('#gm-sso-config').length, 1)
  first.querySelector('.sso-overlay').dispatchEvent(new h.dom.window.Event('animationend'))
  assert.equal(next.host.isConnected, true)
  assert.equal(card.classList.contains('bit-settings-open'), true)
  assert.equal(card.querySelector('.bit-settings-button').getAttribute('aria-expanded'), 'true')
  h.close()
})

test('modern UI switch applies immediately without saving credential drafts or replacing the dialog', () => {
  const h = harness()
  const card = document.createElement('div')
  card.className = 'login-content'
  card.innerHTML =
    '<div id="login-content-right-inner"><div class="ant-tabs-content-holder"></div></div>'
  document.body.append(card)
  store.set({ ...store.get(), optimizedUI: true })
  const root = h.app.ui.openSettings()
  const username = root.querySelector('[name=username]')
  const password = root.querySelector('[name=password]')
  const auto = root.querySelector('[name=auto]')
  const toggle = root.querySelector('[name=optimizedUI]')
  username.value = 'unsaved-user'
  password.value = 'unsaved-password'
  auto.checked = true
  toggle.click()
  assert.equal(store.get().optimizedUI, false)
  assert.equal(document.documentElement.classList.contains('bit-optimized-ui'), false)
  assert.equal(root.host.parentNode, document.body)
  assert.equal(root.host.hasAttribute('data-modern'), false)
  assert.equal(h.app.ui.root.host.hasAttribute('data-modern'), false)
  assert.equal(root.activeElement, toggle)
  assert.equal(username.value, 'unsaved-user')
  assert.equal(password.value, 'unsaved-password')
  assert.equal(auto.checked, true)
  assert.equal(store.get().username, 'student')
  assert.equal(store.get().password, 'secret')
  assert.equal(store.get().auto, false)
  toggle.click()
  assert.equal(store.get().optimizedUI, true)
  assert.equal(root.host.parentNode, card)
  assert.equal(root.host.className, 'inline-settings')
  assert.equal(username.value, 'unsaved-user')
  assert.equal(document.querySelectorAll('#gm-sso-config').length, 1)
  const overlay = root.querySelector('.sso-overlay')
  overlay.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
  overlay.dispatchEvent(new h.dom.window.Event('animationend'))
  assert.equal(store.get().optimizedUI, true)
  assert.equal(store.get().username, 'student')
  assert.equal(h.requests(), 0)
  h.close()
})
