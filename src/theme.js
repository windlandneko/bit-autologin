import { setPanelButton } from './panel.js'
import { loginRoute } from './protocol.js'
import { themeStyles } from './styles/index.js'

function createElement(tag, className, html = '') {
  const element = document.createElement(tag)
  element.className = className
  element.innerHTML = html
  if (tag === 'button') element.type = 'button'
  return element
}

let cleanup

export function setOptimizedUI(enabled) {
  const active = enabled && !!loginRoute(location.href)
  document.documentElement.classList.toggle('bit-optimized-ui', active)
  if (!active) {
    cleanup?.()
    cleanup = undefined
    return
  }
  if (cleanup) return

  const style = document.createElement('style')
  style.id = 'bit-optimized-ui'
  style.textContent = themeStyles
  document.head.append(style)
  const media = document.defaultView.matchMedia('(prefers-color-scheme: dark)')
  const storage = document.defaultView.sessionStorage
  let mode = storage.getItem('bit-autologin-theme')
  const themeButton = createElement('button', 'bit-theme-button')
  // Tabler IconCircleHalf2 (MIT), as used by the shadcn theme toggle.
  themeButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 3l0 18"/><path d="M12 9l4.65 -4.65"/><path d="M12 14.3l7.37 -7.37"/><path d="M12 19.6l8.85 -8.85"/>
  </svg>`
  function applyMode() {
    const resolved = mode || (media.matches ? 'dark' : 'light')
    document.documentElement.dataset.bitTheme = resolved
    themeButton.ariaLabel = resolved === 'dark' ? '切换浅色模式' : '切换深色模式'
    themeButton.title = themeButton.ariaLabel
  }
  themeButton.onclick = () => {
    mode = document.documentElement.dataset.bitTheme === 'dark' ? 'light' : 'dark'
    storage.setItem('bit-autologin-theme', mode)
    applyMode()
  }
  const preventNativeResizeReload = (event) => event.stopImmediatePropagation()
  document.addEventListener('pl_event', preventNativeResizeReload, true)
  media.addEventListener('change', applyMode)
  applyMode()

  const noticeButton = createElement('button', 'bit-notice-button')
  setPanelButton(noticeButton, '公告')
  let noticeCloseTimer
  noticeButton.onclick = () => {
    const card = noticeButton.closest('.login-content')
    document.dispatchEvent(new document.defaultView.Event('bit-close-settings'))
    clearTimeout(noticeCloseTimer)
    const expanded = card.classList.toggle('bit-notice-open')
    card.classList.toggle('bit-notice-closing', !expanded)
    if (!expanded)
      noticeCloseTimer = setTimeout(() => card.classList.remove('bit-notice-closing'), 220)
    const nativeExpanded = !!card.querySelector('.login-content-left:not(.notice-hide)')
    if (expanded !== nativeExpanded) card.querySelector('.newNotice, .newHideNotice')?.click()
    sync()
  }
  const settingsButton = createElement('button', 'bit-settings-button')
  setPanelButton(settingsButton, '设置')
  settingsButton.onclick = () =>
    document.dispatchEvent(new document.defaultView.Event('bit-toggle-settings'))
  const settingsPreview = createElement('div', 'bit-settings-preview')
  settingsPreview.setAttribute('aria-hidden', 'true')
  function toggleRemember(event) {
    const wrapper = event.target.closest('.topFunctionColor')
    if (wrapper && !event.target.closest('button')) wrapper.querySelector('button')?.click()
  }
  document.addEventListener('click', toggleRemember)
  const brand = createElement(
    'div',
    'bit-login-brand',
    '<div class="bit-brand-emblem"></div><span class="bit-brand-name">数智北理</span><span class="bit-brand-subtitle">| 统一身份认证</span>',
  )
  const emblem = brand.firstElementChild
  const header = createElement(
    'div',
    'bit-login-header',
    '<h1>统一身份认证</h1><div id="bit-login-actions"></div><div class="bit-login-separator" role="separator">Or</div>',
  )
  const footer = createElement('div', 'bit-login-footer')
  const bottomLinks = createElement('div', 'bit-bottom-links')
  const actionRow = createElement('div', 'bit-login-options')
  actionRow.append(footer)
  const cardActions = [bottomLinks, settingsButton, settingsPreview, noticeButton, themeButton]
  const tabLabels = {
    用户名密码: '密码登录',
    用户密码: '密码登录',
    短信验证码: '短信验证',
    手机验证码: '短信验证',
    通行密钥认证: '通行密钥',
    邮件验证码: '邮件验证',
    邮箱验证码: '邮件验证',
    i北理扫码: '扫码登录',
  }
  const renamedTabs = new Map()
  const moved = new Map()
  let remember
  let rememberMarker
  let logo
  let logoMarker
  function sync() {
    const card = document.querySelector('.login-content')
    if (!card) return
    for (const label of card.querySelectorAll('.auth-tab-title-text')) {
      const replacement = tabLabels[label.textContent]
      if (!replacement) continue
      renamedTabs.set(label, label.textContent)
      label.textContent = replacement
    }
    for (const element of cardActions) {
      if (element.parentNode !== card) card.append(element)
    }
    for (const element of card.querySelectorAll('.last-action, .passkey-use, .login-panel-box')) {
      if (moved.has(element)) continue
      const marker = document.createComment('login-footer')
      element.before(marker)
      moved.set(element, marker)
      const target = element.matches('.login-panel-box') ? bottomLinks : footer
      target.append(element)
    }
    for (const [element, marker] of moved) {
      if (!marker.isConnected) {
        element.hidden = true
        continue
      }
      const pane = marker.parentElement.closest('.ant-tabs-tabpane')
      element.hidden = !!pane && !pane.classList.contains('ant-tabs-tabpane-active')
    }
    noticeButton.hidden = !document.querySelector('.newNotice, .newHideNotice')
    const expanded = card.classList.contains('bit-notice-open')
    setPanelButton(noticeButton, '公告', expanded)
    const title = card.querySelector('#login-content-right-inner')
    if (title && header.parentNode !== title) title.prepend(header)
    if (brand.parentNode !== card.parentNode) card.before(brand)
    if (!remember) {
      remember = card.querySelector('.topFunctionColor')
      if (remember) {
        rememberMarker = document.createComment('remember-position')
        remember.before(rememberMarker)
      }
    }
    const holder = card.querySelector('.ant-tabs-content-holder')
    const activeForm = holder?.querySelector(
      '.ant-tabs-tabpane-active :is(#normalLoginForm, #smsLoginForm, #mailLoginForm, #webauthnLoginForm)',
    )
    const submitRow = activeForm?.querySelector('.login-normal-button')
    const rememberParent = submitRow?.parentNode === activeForm ? activeForm : holder
    if (rememberParent && actionRow.parentNode !== rememberParent) {
      if (rememberParent === activeForm) submitRow.before(actionRow)
      else rememberParent.append(actionRow)
    }
    if (remember && remember.parentNode !== actionRow) actionRow.prepend(remember)
    if (!logo) {
      logo = document.querySelector('.login-title-img')
      if (logo) {
        logoMarker = document.createComment('logo-position')
        logo.before(logoMarker)
      }
    }
    if (logo && logo.parentNode !== emblem) emblem.append(logo)
  }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
  sync()
  cleanup = () => {
    observer.disconnect()
    clearTimeout(noticeCloseTimer)
    document.removeEventListener('pl_event', preventNativeResizeReload, true)
    for (const [label, original] of renamedTabs) label.textContent = original
    document.removeEventListener('click', toggleRemember)
    media.removeEventListener('change', applyMode)
    if (logo) logoMarker.replaceWith(logo)
    if (remember) rememberMarker.replaceWith(remember)
    for (const [element, marker] of moved) {
      element.hidden = false
      marker.replaceWith(element)
    }
    noticeButton
      .closest('.login-content')
      ?.classList.remove('bit-notice-open', 'bit-notice-closing')
    for (const element of [...cardActions, actionRow, brand, header, style]) element.remove()
    delete document.documentElement.dataset.bitTheme
  }
}
