const STORAGE_KEY = 'bit-autologin-settings'

export const store = {
  get: () => GM_getValue(STORAGE_KEY, { username: '', password: '', auto: false }),
  set: (config) => GM_setValue(STORAGE_KEY, config),
}

const STYLES = `
  :host { font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid #2196f3; outline-offset: 3px; }
  #sso-tip { display: flex; width: 100%; gap: 10px; margin-bottom: 24px; }
  .sso-info, .sso-settings { min-height: 36px; padding: 8px 15px; border-radius: 4px;
    background: #fff; border: 1px solid #ddd; display: flex; align-items: center;
    justify-content: center; color: #000; transition: background .2s; }
  .sso-info { flex: 1; gap: 8px; }
  .sso-info:hover, .sso-settings:hover { background: #f5f5f5; }
  .sso-info.error { background: #fff1f0; border-color: #ffa39e; color: #a8071a; }
  .sso-info:disabled { cursor: default; }
  .sso-info.disabled { opacity: .65; }
  .sso-spinner { width: 14px; height: 14px; border: 2px solid #ddd; border-top-color: #2196f3;
    border-radius: 50%; animation: sso-spin 1s linear infinite; flex-shrink: 0; }
  .sso-cancel { margin-left: auto; font-size: 12px; opacity: .7; white-space: nowrap; }
  .sso-overlay { position: fixed; inset: 0; background: #0005; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center; padding: 16px; }
  .sso-dialog { background: #fff; padding: 32px 32px 18px; border-radius: 12px;
    box-shadow: 0 10px 40px #0005; width: 400px; max-width: 100%; max-height: 90vh;
    overflow: auto; animation: sso-scale-in .2s ease; position: relative; }
  .sso-title { margin: 0 28px 20px 0; font-size: 20px; }
  .sso-close { position: absolute; top: 14px; right: 14px; border: none; background: none;
    font-size: 24px; line-height: 1; color: #666; padding: 4px; }
  .sso-field { margin-bottom: 15px; }
  .sso-label { display: block; margin-bottom: 5px; color: #666; }
  .sso-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
  .sso-hint { color: #777; font-size: 12px; display: block; margin-top: 6px; line-height: 1.5; }
  .sso-checkbox-label { display: flex; align-items: center; cursor: pointer; margin: 18px 0; gap: 8px; }
  .sso-checkbox { width: 16px; height: 16px; }
  .sso-actions { display: flex; gap: 10px; justify-content: space-between; }
  .sso-btn { padding: 7px 18px; border-radius: 6px; }
  .sso-btn-clear { border: 1px solid #ff000033; background: white; color: #c00; }
  .sso-btn-primary { border: none; background: #2196f3; color: white; }
  .sso-btn-primary:hover { background: #1976d2; }
  .sso-footnote { margin-top: 16px; text-align: center; font-size: 12px; color: #777; line-height: 1.5; }
  .sso-validation { color: #a8071a; font-size: 12px; min-height: 18px; margin-bottom: 10px; }
  @keyframes sso-spin { to { transform: rotate(360deg); } }
  @keyframes sso-scale-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
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
  bar.innerHTML =
    '<button type="button" class="sso-info" aria-live="polite"></button><button type="button" class="sso-settings">设置</button>'
  root.append(bar)
  const info = bar.querySelector('.sso-info')
  let observer
  let dialogHost
  let restoreFocus
  let lastStatus = { state: '', message: '' }

  function show(state = '', message = '') {
    lastStatus = { state, message }
    const config = store.get()
    info.replaceChildren()
    info.className = `sso-info ${state}`
    info.disabled = state === 'disabled'
    const text = document.createElement('span')
    text.textContent =
      message || (config.username && config.password ? '一键登录' : '请先设置登录信息 →')
    info.append(text)
    if (state === 'loading') {
      const spinner = document.createElement('span')
      spinner.className = 'sso-spinner'
      const cancel = document.createElement('span')
      cancel.className = 'sso-cancel'
      cancel.textContent = '点击取消'
      info.prepend(spinner)
      info.append(cancel)
    }
    info.onclick = () => {
      if (state === 'loading') onCancel()
      else if (config.username && config.password) onLogin()
      else openSettings()
    }
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

  function closeSettings() {
    dialogHost?.remove()
    dialogHost = null
    restoreFocus?.focus()
  }

  function openSettings() {
    closeSettings()
    restoreFocus = root.activeElement || document.activeElement
    dialogHost = document.createElement('div')
    dialogHost.id = 'gm-sso-config'
    const dialogRoot = dialogHost.attachShadow({ mode: 'closed' })
    const dialogStyle = document.createElement('style')
    dialogStyle.textContent = STYLES
    dialogRoot.append(dialogStyle)
    const overlay = document.createElement('div')
    overlay.className = 'sso-overlay'
    overlay.innerHTML = `
      <form class="sso-dialog" role="dialog" aria-modal="true" aria-labelledby="sso-title">
        <button type="button" class="sso-close" aria-label="关闭设置">×</button>
        <h2 class="sso-title" id="sso-title">🔐 BIT Autologin 设置</h2>
        <div class="sso-field"><label class="sso-label" for="gm-sso-username">用户名 (学号)</label>
          <input type="text" id="gm-sso-username" class="sso-input" placeholder="请输入学号" autocomplete="username"></div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-password">密码</label>
          <input type="password" id="gm-sso-password" class="sso-input" placeholder="请输入密码" autocomplete="current-password">
          <small class="sso-hint">凭证保存在油猴的本地存储中，未使用主密码加密。</small></div>
        <label class="sso-checkbox-label"><input type="checkbox" id="gm-sso-auto" class="sso-checkbox">
          <span>以后都自动登录</span></label>
        <div class="sso-validation" role="alert"></div>
        <div class="sso-actions"><button type="button" id="gm-sso-clear" class="sso-btn sso-btn-clear">清除</button>
          <button type="submit" class="sso-btn sso-btn-primary">保存</button></div>
        <div class="sso-footnote">点击油猴图标也可以打开本设置<br>
          由 <a href="https://github.com/windlandneko" target="_blank" rel="noopener noreferrer">windlandneko</a> 编写</div>
      </form>`
    dialogRoot.append(overlay)
    document.body.append(dialogHost)
    const field = (selector) => overlay.querySelector(selector)
    const config = store.get()
    field('#gm-sso-username').value = config.username
    field('#gm-sso-password').value = config.password
    field('#gm-sso-auto').checked = config.auto
    field('.sso-close').onclick = closeSettings
    overlay.onclick = (event) => {
      if (event.target === overlay) closeSettings()
    }
    field('#gm-sso-clear').onclick = () => {
      onCancel()
      store.set({ username: '', password: '', auto: false })
      closeSettings()
      show()
    }
    field('form').onsubmit = (event) => {
      event.preventDefault()
      const next = {
        username: field('#gm-sso-username').value.trim(),
        password: field('#gm-sso-password').value,
        auto: field('#gm-sso-auto').checked,
      }
      if (!next.username || !next.password) {
        field('.sso-validation').textContent = '请填写用户名和密码，或使用“清除”移除配置。'
        return
      }
      onCancel()
      store.set(next)
      closeSettings()
      show()
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
    field('#gm-sso-username').focus()
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
      closeSettings()
      host.remove()
    },
  }
}
