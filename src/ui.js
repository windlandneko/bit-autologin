const STORAGE_KEY = 'bit-autologin-settings'

export const store = {
  get: () => GM_getValue(STORAGE_KEY, { username: '', password: '', auto: false }),
  set: (config) => GM_setValue(STORAGE_KEY, config),
}

const SPINNER = `<svg class="sso-spinner" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M512 36a476 476 0 0 1 476 476" fill="none" stroke="currentColor" stroke-width="72" stroke-linecap="round"/>
</svg>`

const STYLES = `
  @keyframes sso-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes sso-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sso-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes sso-scale-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes sso-scale-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }

  #sso-tip { display: flex; width: 100%; gap: 10px; margin-bottom: 32px;
    font: 14px sans-serif; user-select: none; }
  .sso-info, .sso-settings { height: 2.3em; padding: 0 15px; border-radius: 4px;
    background: #fff; border: 1px solid #fff; display: flex; align-items: center;
    justify-content: center; color: #000; transition: background 0.2s ease; }
  .sso-info { flex: 1; gap: 8px; }
  .sso-info.clickable, .sso-settings { cursor: pointer; }
  .sso-info.clickable:hover, .sso-settings:hover { background: rgba(255,255,255,0.9); }
  .sso-info.success { --status-color: rgba(76,175,80,0.9); }
  .sso-info.error { --status-color: rgba(255,77,79,0.9); }
  .sso-info.success, .sso-info.error { background: var(--status-color); border-color: var(--status-color); color: #fff; }
  .sso-info.disabled { opacity: 0.5; cursor: not-allowed; }
  .sso-spinner { width: 14px; height: 14px; animation: sso-spin 1s linear infinite; }
  .sso-info:not(.loading) :is(.sso-spinner, .sso-cancel) { display: none; }
  .sso-cancel { margin-left: auto; opacity: 0.7; font-size: 12px; }

  .sso-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 999999;
    display: flex; align-items: center; justify-content: center; animation: sso-fade-in 0.2s ease; }
  .sso-overlay.closing { animation: sso-fade-out 0.15s ease forwards; }
  .sso-dialog { background: #fff; padding: 32px 32px 18px; border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3); width: 400px; max-width: 90vw; user-select: none;
    animation: sso-scale-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .sso-overlay.closing .sso-dialog { animation: sso-scale-out 0.15s ease forwards; }
  .sso-title { margin: 0 0 20px; color: #333; font-size: 20px; }
  .sso-field { margin-bottom: 15px; }
  .sso-label { display: block; margin-bottom: 5px; color: #666; font-size: 14px; }
  .sso-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
    box-sizing: border-box; font-size: 14px; }
  .sso-hint, .sso-footnote { color: #999; font-size: 12px; }
  .sso-checkbox-label { display: flex; align-items: center; cursor: pointer; margin-bottom: 20px; }
  .sso-checkbox { margin-right: 8px; width: 16px; height: 16px; }
  .sso-checkbox-text { color: #666; font-size: 14px; }
  .sso-actions { display: flex; gap: 10px; justify-content: space-between; }
  .sso-btn { padding: 6px 18px; border-radius: 6px; cursor: pointer; font-size: 14px;
    transition: background 0.2s ease; }
  .sso-btn-clear { border: 1px solid #ff000033; background: #fff; color: #ff0000; }
  .sso-btn-clear:hover { background: #ff00000a; }
  .sso-btn-clear:active { background: #ff000018; }
  .sso-btn-primary { border: none; background: #2196F3; color: #fff; }
  .sso-btn-primary:hover { background: #1976D2; }
  .sso-btn-primary:active { background: #1565C0; }
  .sso-footnote { margin-top: 16px; text-align: center; line-height: 1.4; }
`

export function createUI(onLogin, onCancel) {
  const host = document.createElement('div')
  host.id = 'bit-sso-helper'
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLES
  root.append(style)
  const bar = document.createElement('div')
  bar.id = 'sso-tip'
  bar.innerHTML = `
    <div class="sso-info" aria-live="polite">
      ${SPINNER}<span class="sso-message"></span><span class="sso-cancel">点击取消</span>
    </div>
    <div class="sso-settings">设置</div>`
  root.append(bar)
  const info = bar.querySelector('.sso-info')
  const messageText = bar.querySelector('.sso-message')
  let observer
  let tipTimer
  let dialogHost
  let closingLayer
  let restoreFocus
  let lastStatus = { state: '', message: '' }

  function show(state = '', message = '', timeout) {
    clearTimeout(tipTimer)
    lastStatus = { state, message }
    const config = store.get()
    const ready = config.username && config.password
    info.className = `sso-info ${state || (ready ? 'clickable' : 'disabled')}`
    info.classList.toggle('clickable', state === 'loading' || (!state && !!ready))
    messageText.textContent = message || (ready ? '一键登录' : '请先设置登录信息→')
    info.onclick = state === 'loading' ? onCancel : !state && ready ? onLogin : null
    if (timeout) tipTimer = setTimeout(() => show(), timeout)
  }

  function placeBar() {
    const panel = document.querySelector(
      '#normalLoginForm, .moreloginbtnBox, .login-content-right-inner',
    )
    if (panel && !panel.contains(host)) {
      host.style.cssText = 'display:block;width:100%;position:relative;z-index:10'
      panel.prepend(host)
    } else if (!host.isConnected) {
      host.style.cssText =
        'position:fixed;bottom:16px;right:16px;width:min(430px,calc(100vw - 32px));z-index:2147483646'
      document.body.append(host)
    }
  }

  function mount() {
    show()
    placeBar()
    // Angular can replace the entire login component after switching methods.
    observer = new document.defaultView.MutationObserver(placeBar)
    observer.observe(document.body, { childList: true, subtree: true })
  }

  function closeSettings(animate = true) {
    if (!dialogHost) return
    const closing = dialogHost
    if (animate) {
      const layer = closingLayer
      layer.classList.add('closing')
      layer.addEventListener('animationend', () => closing.remove(), { once: true })
    } else closing.remove()
    dialogHost = null
    restoreFocus?.focus()
  }

  function openSettings() {
    closeSettings(false)
    restoreFocus = root.activeElement || document.activeElement
    dialogHost = document.createElement('div')
    dialogHost.id = 'gm-sso-config'
    const dialogRoot = dialogHost.attachShadow({ mode: 'closed' })
    dialogRoot.append(style.cloneNode(true))
    const overlay = document.createElement('div')
    overlay.className = 'sso-overlay'
    closingLayer = overlay
    overlay.innerHTML = `
      <form class="sso-dialog" role="dialog" aria-modal="true" aria-labelledby="sso-title">
        <h2 class="sso-title" id="sso-title">🔐 BIT Autologin 设置</h2>
        <div class="sso-field"><label class="sso-label" for="gm-sso-username">用户名 (学号)</label>
          <input type="text" id="gm-sso-username" name="username" class="sso-input" placeholder="请输入学号" autocomplete="username"></div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-password">密码</label>
          <input type="password" id="gm-sso-password" name="password" class="sso-input" placeholder="请输入密码" autocomplete="current-password">
          <small class="sso-hint">密码存储在本地浏览器中</small></div>
        <label class="sso-checkbox-label"><input type="checkbox" id="gm-sso-auto" name="auto" class="sso-checkbox">
          <span class="sso-checkbox-text">以后都自动登录</span></label>
        <div class="sso-actions"><button type="button" id="gm-sso-clear" class="sso-btn sso-btn-clear">清除</button>
          <button type="submit" class="sso-btn sso-btn-primary">保存</button></div>
        <div class="sso-footnote">点击油猴图标也可以打开本设置<br>
          由 <a href="https://github.com/windlandneko" target="_blank" rel="noopener noreferrer">windlandneko</a> 编写</div>
      </form>`
    dialogRoot.append(overlay)
    document.body.append(dialogHost)
    const form = overlay.querySelector('form')
    const { username, password, auto } = form.elements
    const config = store.get()
    username.value = config.username
    password.value = config.password
    auto.checked = config.auto
    overlay.onclick = (event) => {
      if (event.target === overlay) closeSettings()
    }
    form.querySelector('#gm-sso-clear').onclick = () => {
      onCancel()
      store.set({ username: '', password: '', auto: false })
      closeSettings()
      show('error', '登录信息已清除', 1000)
    }
    form.onsubmit = (event) => {
      event.preventDefault()
      const next = {
        username: username.value.trim(),
        password: password.value,
        auto: auto.checked,
      }
      onCancel()
      store.set(next)
      closeSettings()
      show('success', '登录信息已保存', 1000)
    }
    overlay.onkeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSettings()
      }
      if (event.key !== 'Tab') return
      const elements = [...overlay.querySelectorAll('button, input, a[href]')]
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && dialogRoot.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && dialogRoot.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    username.focus()
    return dialogRoot
  }

  bar.querySelector('.sso-settings').onclick = openSettings
  return {
    root,
    mount,
    show,
    openSettings,
    get status() {
      return lastStatus
    },
    destroy() {
      observer?.disconnect()
      clearTimeout(tipTimer)
      closeSettings(false)
      host.remove()
    },
  }
}
