import { setPanelButton } from './panel.js'
import { mountCaptchaDialog } from './captcha-dialog.js'
import { setOptimizedUI } from './theme.js'
import { helperStyles } from './styles/index.js'

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

export function createUI(onLogin, onCancel) {
  const host = document.createElement('div')
  host.id = 'bit-sso-helper'
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = helperStyles
  root.append(style)
  const bar = document.createElement('div')
  bar.id = 'sso-tip'
  bar.innerHTML = `
    <div class="sso-info" aria-live="polite">
      ${SPINNER}<span class="sso-message"></span><span class="sso-cancel">点击取消</span>
    </div>
    <button type="button" class="sso-settings" aria-label="设置" title="设置">设置</button>`
  root.append(bar)
  const info = bar.querySelector('.sso-info')
  const messageText = bar.querySelector('.sso-message')
  let observer
  let cleanupCaptcha
  let tipTimer
  let resetTimer
  let dialogHost
  let closingLayer
  let finishClosing
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
    host.toggleAttribute(
      'data-modern',
      document.documentElement.classList.contains('bit-optimized-ui'),
    )
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

  const toggleSettings = () => (dialogHost ? closeSettings() : openSettings())
  const dismissSettings = () => closeSettings(false)

  function mount() {
    cleanupCaptcha = mountCaptchaDialog(document)
    document.addEventListener('bit-toggle-settings', toggleSettings)
    document.addEventListener('bit-close-settings', dismissSettings)
    setOptimizedUI(store.get().optimizedUI)
    show()
    placeBar()
    // Angular can replace the entire login component after switching methods.
    observer = new document.defaultView.MutationObserver(placeBar)
    observer.observe(document.body, { childList: true, subtree: true })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  function closeSettings(animate = true) {
    clearTimeout(resetTimer)
    finishClosing?.()
    if (!dialogHost) return
    const closing = dialogHost
    setPanelButton(document.querySelector('.bit-settings-button'), '设置')
    let closeTimer
    const layer = closingLayer
    const onAnimationEnd = (event) => {
      if (event.target === layer) remove()
    }
    const remove = () => {
      clearTimeout(closeTimer)
      layer.removeEventListener('animationend', onAnimationEnd)
      if (finishClosing === remove) finishClosing = undefined
      if (!dialogHost || dialogHost === closing)
        closing.parentElement?.classList.remove('bit-settings-open')
      closing.remove()
    }
    closing.inert = true
    if (animate) {
      layer.style.removeProperty('animation')
      layer.classList.add('closing')
      finishClosing = remove
      closeTimer = setTimeout(remove, 250)
      layer.addEventListener('animationend', onAnimationEnd)
    } else remove()
    dialogHost = null
    restoreFocus?.focus()
  }

  function openSettings() {
    closeSettings(false)
    document.querySelector('.bit-notice-button[aria-expanded="true"]')?.click()
    dialogHost = document.createElement('div')
    dialogHost.id = 'gm-sso-config'
    const dialogRoot = dialogHost.attachShadow({ mode: 'closed' })
    dialogRoot.append(style.cloneNode(true))
    const overlay = document.createElement('div')
    overlay.className = 'sso-overlay'
    closingLayer = overlay
    overlay.innerHTML = `
      <form class="sso-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sso-title">
        <div class="sso-heading">
          <h2 class="sso-title" id="sso-title">AutoLogin 设置</h2>
          <label class="sso-checkbox-label sso-modern-toggle"><span class="sso-checkbox-text">现代化UI</span>
            <input type="checkbox" role="switch" name="optimizedUI" class="sso-checkbox"></label>
        </div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-username">用户名 (学号)</label>
          <ion-icon name="name-icon" aria-hidden="true"></ion-icon><input type="text" id="gm-sso-username" name="username" class="sso-input" placeholder="请输入学号" autocomplete="username"></div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-password">密码</label>
          <ion-icon name="password-icon" aria-hidden="true"></ion-icon><input type="password" id="gm-sso-password" name="password" class="sso-input" placeholder="请输入密码" autocomplete="current-password">
          </div>
        <label class="sso-checkbox-label"><span class="sso-checkbox-text">自动登录</span>
          <input type="checkbox" role="switch" id="gm-sso-auto" name="auto" class="sso-checkbox"></label>
        <div class="sso-actions"><button type="submit" class="sso-btn sso-btn-primary">保存</button></div>
        <div class="sso-footnote"><button type="button" id="gm-sso-reset" class="sso-btn sso-btn-reset">重置</button>
          <span class="sso-credit">Made by <a href="https://github.com/windlandneko" target="_blank" rel="noopener noreferrer">windlandneko</a> with ❤️</span></div>
      </form>`
    dialogRoot.append(overlay)
    function placeDialog() {
      dialogHost.parentElement?.classList.remove('bit-settings-open')
      const content = document.querySelector('.login-content .ant-tabs-content-holder')
      const card =
        document.documentElement.classList.contains('bit-optimized-ui') &&
        content?.closest('.login-content')
      dialogHost.classList.toggle('inline-settings', !!card)
      dialogHost.toggleAttribute('data-modern', !!card)
      if (card) {
        const settingsButton = card.querySelector('.bit-settings-button')
        setPanelButton(settingsButton, '设置', true)
        card.classList.add('bit-settings-open')
        card.append(dialogHost)
        restoreFocus = settingsButton
      } else {
        document.body.append(dialogHost)
        restoreFocus = bar.querySelector('.sso-settings')
      }
    }
    placeDialog()
    const form = overlay.querySelector('form')
    const { username, password, auto, optimizedUI } = form.elements
    const config = store.get()
    username.value = config.username
    password.value = config.password
    auto.checked = config.auto
    optimizedUI.checked = !!config.optimizedUI
    optimizedUI.onchange = () => {
      // Only persist appearance; retain unsaved credentials in the same form.
      overlay.style.animation = 'none'
      form.style.animation = 'none'
      store.set({ ...store.get(), optimizedUI: optimizedUI.checked })
      placeBar()
      placeDialog()
      optimizedUI.focus({ preventScroll: true })
    }
    overlay.onclick = (event) => {
      if (event.target === overlay) closeSettings()
    }
    const reset = form.querySelector('#gm-sso-reset')
    let confirmingReset = false
    reset.onclick = () => {
      if (!confirmingReset) {
        confirmingReset = true
        reset.textContent = '确认？'
        resetTimer = setTimeout(() => {
          confirmingReset = false
          reset.textContent = '重置'
        }, 3000)
        return
      }
      onCancel()
      closeSettings(false)
      store.set({ ...store.get(), username: '', password: '', auto: false })
      show('error', '登录信息已重置', 1000)
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
      if (
        dialogRoot.activeElement === (event.shiftKey ? first : last) ||
        (event.shiftKey && dialogRoot.activeElement === form)
      ) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      }
    }
    form.focus({ preventScroll: true })
    return dialogRoot
  }

  bar.querySelector('.sso-settings').onclick = toggleSettings
  return {
    root,
    mount,
    show,
    openSettings,
    get status() {
      return lastStatus
    },
    destroy() {
      cleanupCaptcha?.()
      document.removeEventListener('bit-toggle-settings', toggleSettings)
      document.removeEventListener('bit-close-settings', dismissSettings)
      setOptimizedUI(false)
      observer?.disconnect()
      clearTimeout(tipTimer)
      closeSettings(false)
      host.remove()
    },
  }
}
