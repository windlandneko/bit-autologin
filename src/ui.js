import { setOptimizedUI } from './theme.js'

const STORAGE_KEY = 'bit-autologin-settings'

export const store = {
  get: () =>
    GM_getValue(STORAGE_KEY, { username: '', password: '', auto: false, optimizedUI: true }),
  set(config) {
    GM_setValue(STORAGE_KEY, config)
    setOptimizedUI(config.optimizedUI)
  },
}

const SPINNER = `<svg class="sso-spinner" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M512 36a476 476 0 0 1 476 476" fill="none" stroke="currentColor" stroke-width="72" stroke-linecap="round"/>
</svg>`

const STYLES = `
  :host-context(.bit-optimized-ui) #sso-tip { margin-bottom: 0; }
  :host-context(.bit-optimized-ui) .sso-info:not(.error):not(.success),
  :host-context(.bit-optimized-ui) .sso-settings { background: var(--card); border-color: var(--input);
    color: var(--foreground); border-radius: 8px; }
  :host-context(.bit-optimized-ui) :is(.sso-info, .sso-settings) { height: 36px; flex: 1; box-sizing: border-box; border-radius: calc(var(--radius) - 2px); }
  :host-context(.bit-optimized-ui) .sso-info:hover, :host-context(.bit-optimized-ui) .sso-settings:hover { background: var(--muted); }
  :host-context(.bit-optimized-ui) .sso-dialog { background: var(--card); border: 1px solid var(--border); }
  :host-context(.bit-optimized-ui) .sso-title { color: var(--foreground); }
  :host-context(.bit-optimized-ui) :is(.sso-label, .sso-checkbox-text) { color: var(--muted-foreground); }
  :host-context(.bit-optimized-ui) .sso-checkbox-text { font: var(--switch-label-font); }
  :host-context(.bit-optimized-ui) .sso-input { background: var(--field-background); border-color: var(--border); color: var(--foreground); }
  :host-context(.bit-optimized-ui) .sso-btn-primary { background: var(--primary); color: var(--primary-foreground); border-radius: calc(var(--radius) - 2px); font-weight: 500; }
  :host-context(.bit-optimized-ui) .sso-btn-primary:hover { background: color-mix(in oklch, var(--primary) 90%, transparent); }
  :host-context(.bit-optimized-ui) .sso-btn-clear { background: transparent; color: #f87171; }
  :host-context(.bit-optimized-ui) .sso-settings { flex: 0 0 36px; padding: 0; }
  .sso-settings svg { display: none; }
  :host-context(.bit-optimized-ui) .sso-settings svg:not(.close-icon) { display: block; }
  :host-context(.bit-optimized-ui) .sso-settings span { display: none; }
  @keyframes sso-reveal { from { clip-path: circle(0 at 100% 0); } to { clip-path: circle(150% at 100% 0); } }
  :host(.inline-settings) .sso-overlay { position: absolute; background: var(--card); animation: sso-reveal 180ms ease-out; }
  @keyframes sso-conceal { from { clip-path: circle(150% at 100% 0); } to { clip-path: circle(0 at 100% 0); } }
  :host(.inline-settings) .sso-overlay.closing { animation: sso-conceal 200ms ease-in forwards; }
  :host(.inline-settings) .sso-overlay.closing .sso-dialog { animation: none; }
  :host(.inline-settings) .sso-dialog { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; max-width: none; box-sizing: border-box; padding: 8px 24px 24px; border: 0; border-radius: 0; box-shadow: none; animation: none; }
  :host(.inline-settings) .sso-title { text-align: center; font-size: 16px; line-height: 20px; margin: 0; }
  :host(.inline-settings) .sso-field { position: absolute; left: 24px; right: 24px; top: var(--input-top); margin: 0; }
  :host(.inline-settings) .sso-field + .sso-field { top: calc(var(--input-top) + 52px); }
  :host(.inline-settings) .sso-label { position: absolute; clip-path: inset(100%); }
  .sso-field ion-icon { display: none; }
  :host(.inline-settings) .sso-field ion-icon { display: block; position: absolute; left: 13px; top: 11px; width: 14px; height: 14px; color: var(--foreground); pointer-events: none; }
  :host(.inline-settings) .sso-input { font: var(--login-input-font); height: 36px; padding: 3px 12px 3px 34px; border-radius: calc(var(--radius) - 2px); background: var(--field-background); border-color: var(--input); box-shadow: 0 1px 2px #0001; }
  :host-context(.bit-optimized-ui) .sso-input:is(:autofill, :-webkit-autofill) { -webkit-text-fill-color: var(--foreground) !important; caret-color: var(--foreground); }
  :host(.inline-settings) .sso-input::placeholder { color: var(--muted-foreground); opacity: 1; }
  :host(.inline-settings) .sso-input:focus { outline: none; border-color: var(--muted-foreground); box-shadow: 0 0 0 3px color-mix(in oklch, var(--muted-foreground) 50%, transparent); }
  :host(.inline-settings) .sso-checkbox-label { position: absolute; left: 24px; top: calc(var(--input-top) + 104px); margin: 0; height: 20px; }
  :host(.inline-settings) .sso-checkbox-label:has([name="optimizedUI"]) { left: auto; right: 24px; }
  :host(.inline-settings) .sso-actions { position: absolute; top: var(--submit-top); left: 24px; right: 24px; display: grid; grid-template-columns: 1fr; }
  :host(.inline-settings) .sso-btn { height: 36px; }
  :host(.inline-settings) .sso-footnote { position: absolute; bottom: 8px; left: 20px; right: 20px; height: 32px; margin: 0; }
  :host(.inline-settings) a { color: var(--muted-foreground); text-decoration: none; text-underline-offset: 4px; }
  :host(.inline-settings) a:hover { color: var(--foreground); text-decoration: underline; }
  :host-context(.bit-optimized-ui) #sso-tip .sso-settings { position: absolute; top: 20px; right: 20px; z-index: 50; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 150ms, opacity 180ms; }
  .sso-settings .close-icon { display: none; }
  :host-context(.bit-settings-open) .sso-settings svg:not(.close-icon) { display: none; }
  :host-context(.bit-settings-open) .sso-settings .close-icon { display: block; }
  :host-context(.bit-optimized-ui) #sso-tip .sso-settings:hover { background: var(--muted); }
  :host .sso-footnote .sso-btn-clear { height: auto; padding: 0; border: 0; background: transparent; color: #ef4444; font-size: 12px; }
  .sso-footnote .sso-btn-clear:hover { text-decoration: underline; text-underline-offset: 4px; }
  .sso-checkbox { appearance: none; position: relative; flex: 0 0 32px; width: 32px !important; height: 18px !important; border: 1px solid transparent; border-radius: 999px; background: var(--input, #ddd); transition: background 150ms; cursor: pointer; }
  .sso-checkbox::before { content: ''; position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 150ms; }
  .sso-checkbox:checked { background: var(--primary, #171717); }
  .sso-checkbox:checked::before { transform: translateX(14px); background: var(--primary-foreground, #fff); }
  .sso-checkbox:focus-visible { outline: 2px solid var(--muted-foreground, #999); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { :host(.inline-settings) .sso-overlay { animation-duration: 1ms; } }
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
  .sso-dialog:focus { outline: none; }
  .sso-title { margin: 0 0 20px; color: #333; font-size: 20px; }
  .sso-field { margin-bottom: 15px; }
  .sso-label { display: block; margin-bottom: 5px; color: #666; font-size: 14px; }
  .sso-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
    box-sizing: border-box; font-size: 14px; }
  .sso-hint, .sso-footnote { color: #999; font-size: 12px; }
  .sso-checkbox-label { display: flex; gap: 8px; align-items: center; cursor: pointer; margin-bottom: 20px; }
  .sso-checkbox { margin: 0; }
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
  .sso-footnote { display: flex; align-items: center; justify-content: space-between; margin-top: 24px; line-height: 1.4; }
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
    <button type="button" class="sso-settings" aria-label="设置" title="设置"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg><svg class="close-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg><span>设置</span></button>`
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
    const ready = (config.username && config.password) || config.optimizedUI
    info.className = `sso-info ${state || (ready ? 'clickable' : 'disabled')}`
    info.classList.toggle('clickable', state === 'loading' || (!state && !!ready))
    messageText.textContent = message || (ready ? '一键登录' : '请先设置登录信息→')
    info.onclick = state === 'loading' ? onCancel : !state && ready ? onLogin : null
    if (timeout) tipTimer = setTimeout(() => show(), timeout)
  }

  function placeBar() {
    const panel =
      document.querySelector('#bit-login-actions') ||
      document.querySelector('.moreloginbtnBox') ||
      document.querySelector('#normalLoginForm, #login-content-right-inner')
    if (panel && !panel.contains(host)) {
      host.style.cssText = 'display:block;width:100%'
      panel.prepend(host)
    } else if (!panel && host.isConnected) {
      host.remove()
    }
  }

  function mount() {
    setOptimizedUI(store.get().optimizedUI)
    show()
    placeBar()
    // Angular can replace the entire login component after switching methods.
    observer = new document.defaultView.MutationObserver(placeBar)
    observer.observe(document.body, { childList: true, subtree: true })
  }

  function closeSettings(animate = true) {
    if (!dialogHost) return
    const closing = dialogHost
    bar.querySelector('.sso-settings').ariaLabel = '设置'
    const remove = () => {
      closing.parentElement?.classList.remove('bit-settings-open')
      closing.remove()
    }
    if (animate) {
      const layer = closingLayer
      layer.classList.add('closing')
      layer.addEventListener('animationend', (event) => {
        if (event.target === layer) remove()
      })
    } else remove()
    dialogHost = null
    restoreFocus?.focus()
  }

  function openSettings() {
    closeSettings(false)
    document.querySelector('.bit-notice-button[aria-expanded="true"]')?.click()
    restoreFocus = root.activeElement || document.activeElement
    dialogHost = document.createElement('div')
    dialogHost.id = 'gm-sso-config'
    const dialogRoot = dialogHost.attachShadow({ mode: 'closed' })
    dialogRoot.append(style.cloneNode(true))
    const overlay = document.createElement('div')
    overlay.className = 'sso-overlay'
    closingLayer = overlay
    overlay.innerHTML = `
      <form class="sso-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sso-title">
        <h2 class="sso-title" id="sso-title">BIT Autologin 设置</h2>
        <div class="sso-field"><label class="sso-label" for="gm-sso-username">用户名 (学号)</label>
          <ion-icon name="name-icon" aria-hidden="true"></ion-icon><input type="text" id="gm-sso-username" name="username" class="sso-input" placeholder="请输入学号" autocomplete="username"></div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-password">密码</label>
          <ion-icon name="password-icon" aria-hidden="true"></ion-icon><input type="password" id="gm-sso-password" name="password" class="sso-input" placeholder="请输入密码" autocomplete="current-password">
          </div>
        <label class="sso-checkbox-label"><span class="sso-checkbox-text">自动登录</span>
          <input type="checkbox" role="switch" id="gm-sso-auto" name="auto" class="sso-checkbox"></label>
        <label class="sso-checkbox-label"><span class="sso-checkbox-text">现代化UI</span>
          <input type="checkbox" role="switch" name="optimizedUI" class="sso-checkbox"></label>
        <div class="sso-actions"><button type="submit" class="sso-btn sso-btn-primary">保存</button></div>
        <div class="sso-footnote"><button type="button" id="gm-sso-clear" class="sso-btn sso-btn-clear">清除</button>
          <a href="https://github.com/windlandneko/bit-autologin" target="_blank" rel="noopener noreferrer">Github</a></div>
      </form>`
    dialogRoot.append(overlay)
    const content = document.querySelector('.login-content .ant-tabs-content-holder')
    const card =
      document.documentElement.classList.contains('bit-optimized-ui') &&
      content?.closest('.login-content')
    if (card) {
      dialogHost.className = 'inline-settings'
      const panelTop =
        card.querySelector('.bit-login-header').getBoundingClientRect().bottom -
        card.getBoundingClientRect().top +
        24
      const inputTop =
        content.getBoundingClientRect().top - card.getBoundingClientRect().top - panelTop
      dialogHost.style.cssText = `position:absolute;inset:${panelTop}px 0 0;z-index:40;--input-top:${inputTop}px;--submit-top:${inputTop + 140}px`
      bar.querySelector('.sso-settings').ariaLabel = '返回登录'
      card.classList.add('bit-settings-open')
      card.append(dialogHost)
    } else document.body.append(dialogHost)
    const form = overlay.querySelector('form')
    const { username, password, auto, optimizedUI } = form.elements
    const config = store.get()
    username.value = config.username
    password.value = config.password
    auto.checked = config.auto
    optimizedUI.checked = !!config.optimizedUI
    overlay.onclick = (event) => {
      if (event.target === overlay) closeSettings()
    }
    const clear = form.querySelector('#gm-sso-clear')
    let confirmingClear = false
    clear.onclick = () => {
      if (!confirmingClear) {
        confirmingClear = true
        clear.textContent = '确认清除？'
        return
      }
      onCancel()
      closeSettings(false)
      store.set({ username: '', password: '', auto: false, optimizedUI: false })
      show('error', '登录信息已清除', 1000)
    }
    form.onsubmit = (event) => {
      event.preventDefault()
      const next = {
        username: username.value.trim(),
        password: password.value,
        auto: auto.checked,
        optimizedUI: optimizedUI.checked,
      }
      onCancel()
      closeSettings(next.optimizedUI)
      store.set(next)
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
    form.focus({ preventScroll: true })
    return dialogRoot
  }

  bar.querySelector('.sso-settings').onclick = () => (dialogHost ? closeSettings() : openSettings())
  return {
    root,
    mount,
    show,
    openSettings,
    get status() {
      return lastStatus
    },
    destroy() {
      setOptimizedUI(false)
      observer?.disconnect()
      clearTimeout(tipTimer)
      closeSettings(false)
      host.remove()
    },
  }
}
