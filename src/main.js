import { createUI, store } from './ui.js'
import {
  loginRoute,
  readPageState,
  pageBlockReason,
  requestRisk,
  buildPayload,
  submitPayload,
  encodeVpnHost,
} from './protocol.js'

const ATTEMPT_KEY = 'bit-sso-attempt-v2'
const COOLDOWN = 10 * 60 * 1000

export function startApp(pageWindow) {
  const route = loginRoute(location.href)
  let controller = null
  let submitted = false
  const markAttempt = () => sessionStorage.setItem(ATTEMPT_KEY, Date.now())

  function cancel() {
    controller?.abort()
    controller = null
    markAttempt()
    ui.show('', '已取消，点击重新登录')
  }

  async function login() {
    if (!route || controller || submitted) return
    const config = store.get()
    if (!config.username || !config.password) return ui.openSettings()
    const active = new AbortController()
    controller = active
    const signal = AbortSignal.any([active.signal, AbortSignal.timeout(25000)])
    try {
      const state = readPageState(document)
      const reason = pageBlockReason(state)
      if (reason) throw new Error(reason)
      if (route.vpn) {
        const expected = await encodeVpnHost(
          'sso.bit.edu.cn',
          pageWindow.__vpn_host_crypt_key,
          pageWindow.__vpn_host_crypt_iv,
        )
        if (route.prefix.split('/').at(-1) !== expected)
          throw new Error('此 WebVPN 地址不是北理工 SSO 入口')
      }
      ui.show('loading', '正在登录…')
      const risk = await requestRisk(route, pageWindow, signal)
      const payload = await buildPayload(state, config, risk)
      signal.throwIfAborted()
      const current = readPageState(document)
      if (current.execution !== state.execution || pageBlockReason(current))
        throw new Error('认证页面已变化，请检查当前验证步骤后重试')
      markAttempt()
      ui.show('disabled', '正在跳转…')
      submitPayload(document, route, payload)
      submitted = true
    } catch (error) {
      if (controller !== active) return
      ui.show(
        'error',
        signal.reason?.name === 'TimeoutError' ? '请求超时，请手动重试' : error.message,
      )
    } finally {
      if (controller === active) controller = null
    }
  }

  const ui = createUI(login, cancel)
  GM_registerMenuCommand('⚙️ BIT AutoLogin 设置', ui.openSettings)
  if (route) {
    ui.mount()
    const reason = pageBlockReason(readPageState(document))
    if (reason) ui.show('error', reason)
    else if (Date.now() - Number(sessionStorage.getItem(ATTEMPT_KEY) || 0) < COOLDOWN)
      ui.show('', '已暂停自动重试；需要时点击登录')
    else if (store.get().auto) void login()
  }
  return {
    ui,
    login,
    cancel,
    destroy() {
      controller?.abort()
      controller = null
      ui.destroy()
    },
  }
}

// Keep initialization separate from the exported flow so tests can import it.
if (typeof window !== 'undefined') {
  const app = startApp(unsafeWindow)
  window.addEventListener('pagehide', () => app.destroy(), { once: true })
}
