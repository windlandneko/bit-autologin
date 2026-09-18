import { loginRoute } from './protocol.js'

const STYLE_ID = 'bit-optimized-ui'

const CSS = `
  /* Neutral tokens and spacing from shadcn/ui new-york-v4, login-03. */
  html.bit-optimized-ui { color-scheme: light;
    --switch-label-font: 400 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --login-input-font: 500 14px/28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --background: oklch(1 0 0); --foreground: oklch(.145 0 0);
    --card: oklch(1 0 0); --muted: oklch(.97 0 0); --muted-foreground: oklch(.556 0 0);
    --border: oklch(.922 0 0); --primary: oklch(.205 0 0); --primary-foreground: oklch(.985 0 0);
    --field-background: transparent; --input: oklch(.922 0 0); --radius: .625rem; background: var(--muted); }
  html.bit-optimized-ui[data-bit-theme="dark"] { color-scheme: dark;
    --background: oklch(.145 0 0); --foreground: oklch(.985 0 0);
    --card: oklch(.205 0 0); --muted: oklch(.269 0 0); --muted-foreground: oklch(.708 0 0);
    --border: oklch(1 0 0 / 10%); --primary: oklch(.922 0 0); --primary-foreground: oklch(.205 0 0);
    --input: oklch(1 0 0 / 15%); --field-background: color-mix(in oklch, var(--input) 30%, transparent); }
  html.bit-optimized-ui body { background: var(--muted) !important; color: var(--foreground);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  html.bit-optimized-ui #contentContainer { position: relative !important; min-height: 100svh;
    height: auto !important; padding: 40px 32px; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 24px; background: var(--muted) !important; }
  html.bit-optimized-ui .pc-background-none { background: var(--muted) !important; }
  html.bit-optimized-ui .login-title { display: none; }
  html.bit-optimized-ui .normal-title { display: none; }
  html.bit-optimized-ui .wrap-normal-title { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; }
  html.bit-optimized-ui .login-title-img { position: static !important; height: 40px !important; max-width: 100%; object-fit: contain; }
  html.bit-optimized-ui .login-content { position: relative !important; inset: auto !important;
    transform: none !important; display: block !important;
    width: min(420px, 100%) !important; height: auto !important; min-height: 0 !important;
    margin: 0 !important; padding: 0 !important; background-color: var(--card) !important; background-size: 0 0 !important;
    border: 1px solid var(--border); border-radius: 12px !important; overflow: hidden;
    box-shadow: 0 1px 3px #0001; backdrop-filter: none !important; }
  html.bit-optimized-ui .login-content::before { display: none !important; }
  html.bit-optimized-ui .bit-login-brand { position: relative; display: flex; align-items: center; justify-content: center; }
  html.bit-optimized-ui .bit-brand-emblem { width: 40px; height: 40px; overflow: hidden; flex: 0 0 40px; }
  html.bit-optimized-ui .bit-brand-emblem .login-title-img { width: auto !important; max-width: none !important; }
  html.bit-optimized-ui .bit-login-brand { gap: 6px; color: var(--foreground); white-space: nowrap; }
  html.bit-optimized-ui .bit-brand-name { font-size: 20px; font-weight: 500; }
  html.bit-optimized-ui .bit-brand-subtitle { font-size: 12px; }
  html.bit-optimized-ui .bit-login-header { width: 100%; text-align: center; margin-bottom: 8px; }
  html.bit-optimized-ui .bit-login-header h1 { margin: 0 0 8px; font-size: 24px; line-height: 32px; font-weight: 600; color: var(--foreground) !important; }
  html.bit-optimized-ui #bit-login-actions { display: flex; align-items: center; gap: 10px; margin: 24px 0; }
  html.bit-optimized-ui #bit-login-actions > #bit-sso-helper { flex: 1; min-width: 0; }
  html.bit-optimized-ui .bit-login-separator { display: flex; gap: 12px; align-items: center; color: var(--muted-foreground); font-size: 14px; }
  html.bit-optimized-ui .bit-login-separator::before, html.bit-optimized-ui .bit-login-separator::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  html.bit-optimized-ui .toogle-button { position: absolute; bottom: 16px; left: 16px; }
  html.bit-optimized-ui .toggle-button-container { position: static !important; }
  html.bit-optimized-ui .login-content-left { position: absolute !important; z-index: 20;
    display: block !important; inset: 68px 8px 8px !important; width: auto !important; height: auto !important;
    min-height: 0 !important; padding: 24px 24px 48px; overflow: hidden; box-sizing: border-box;
    background: transparent !important; border-radius: 4px;
    clip-path: inset(calc(100% - 32px) calc(100% - 48px) 0 0 round 6px);
    transition: clip-path 200ms ease, background-color 150ms; pointer-events: none; }
  html.bit-optimized-ui .login-content:has(.bit-notice-button:hover) .login-content-left,
  html.bit-optimized-ui .login-content.bit-notice-open .login-content-left { background: var(--muted) !important; }
  html.bit-optimized-ui .login-content.bit-notice-open .login-content-left { clip-path: inset(0 round 4px); pointer-events: auto; }
  html.bit-optimized-ui .login-content-left .notice-content { width: 100% !important; min-width: 0 !important; max-width: 100% !important; height: 100%; overflow: auto; box-sizing: border-box; overflow-wrap: anywhere; color: var(--foreground) !important; background: transparent !important; padding: 0 !important; opacity: 0; transition: opacity 100ms; }
  html.bit-optimized-ui .login-content.bit-notice-open .login-content-left .notice-content { opacity: 1; transition-delay: 80ms; }
  html.bit-optimized-ui .login-content-left::after { display: none !important; }
  html.bit-optimized-ui .notice-content-item { width: auto !important; min-width: 0 !important; padding: 0 !important; }
  html.bit-optimized-ui .noticTitle { padding: 0 !important; margin: 0 0 24px !important; text-align: left; }
  html.bit-optimized-ui .notice-content p { line-height: 1.8; margin-bottom: 12px; }
  html.bit-optimized-ui .notice-content a { color: var(--foreground) !important; text-decoration: none; text-underline-offset: 3px; }
  html.bit-optimized-ui #login-content-right { position: static !important;  float: none !important;
    width: auto !important; min-width: 0 !important; min-height: 0 !important; padding: 20px 24px 64px !important;
    background: var(--card) !important; box-sizing: border-box; align-self: stretch; display: flex; align-items: center; }
  html.bit-optimized-ui .login-content-right-wrapper,
  html.bit-optimized-ui #login-content-right-inner { width: 100% !important; }
  html.bit-optimized-ui .normal-row { padding: 0 !important; }
  html.bit-optimized-ui app-auth-panel-new > .ant-row { padding: 0 !important; }
  html.bit-optimized-ui #contentContainer .topFunctionColor { position: static; transform: none; border: 0; padding: 0; background: transparent; color: var(--muted-foreground) !important; }
  html.bit-optimized-ui .login-content-right-wrapper, html.bit-optimized-ui #login-content-right-inner { min-height: 0 !important; }

  html.bit-optimized-ui #contentContainer .filterColor,
  html.bit-optimized-ui #contentContainer .eyes-icon,
  html.bit-optimized-ui #contentContainer ion-icon { color: var(--foreground) !important; }
  html.bit-optimized-ui :is(.newNotice, .newHideNotice) { display: none !important; }
  html.bit-optimized-ui .bit-notice-button,
  html.bit-optimized-ui .bit-theme-button,
  html.bit-optimized-ui #contentContainer .topFunctionColor { display: inline-flex; align-items: center; justify-content: center;
    gap: 8px; height: 32px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--foreground) !important; font-family: inherit; font-size: 12px; box-shadow: none; line-height: 1; box-sizing: border-box; }
  html.bit-optimized-ui .bit-notice-button,
  html.bit-optimized-ui .bit-theme-button { position: absolute; z-index: 2; cursor: pointer; font-size: 12px; }
  html.bit-optimized-ui .bit-notice-button { left: 8px; bottom: 8px; z-index: 30; width: 48px; height: 32px; padding: 0; background: transparent; border: 0; border-radius: 6px; transition: color 150ms, transform 200ms ease; }
  html.bit-optimized-ui #contentContainer .bit-notice-button { color: var(--muted-foreground) !important; }
  html.bit-optimized-ui #contentContainer .bit-notice-button:hover { color: var(--foreground) !important; }
  html.bit-optimized-ui .bit-notice-button[aria-expanded="true"] { transform: translate(8px, -8px); }
  html.bit-optimized-ui .bit-theme-button { position: absolute; top: 20px; left: 20px; z-index: 60; width: 32px; padding: 0; border: 0; background: transparent; }
  html.bit-optimized-ui #contentContainer .topFunctionColor,
  html.bit-optimized-ui #contentContainer .topFunctionColor * { user-select: none; cursor: pointer; box-shadow: none !important; }
  html.bit-optimized-ui #contentContainer .topFunctionColor,
  html.bit-optimized-ui #contentContainer .topFunctionColor > span { font: var(--switch-label-font) !important; color: var(--muted-foreground) !important; }
  html.bit-optimized-ui .topFunctionColor .ant-switch-handle::before { box-shadow: none !important; }
  html.bit-optimized-ui .topFunctionColor nz-switch { display: flex; align-items: center; }
  html.bit-optimized-ui .topFunctionColor .ant-switch { margin: 0 !important; top: auto !important; box-shadow: none !important; vertical-align: middle; }
  html.bit-optimized-ui .bit-notice-button[hidden] { display: none; }
  html.bit-optimized-ui .bit-theme-button:hover { background: var(--muted); }
  html.bit-optimized-ui .topFunctionColor .ant-switch:not(.ant-switch-checked) { background: var(--input) !important; }
  html.bit-optimized-ui .topFunctionColor .ant-switch { width: 32px; min-width: 32px; height: 18px; border: 1px solid transparent; border-radius: 999px; }
  html.bit-optimized-ui .topFunctionColor .ant-switch-handle { top: 1px; left: 1px; width: 14px; height: 14px; }
  html.bit-optimized-ui .topFunctionColor .ant-switch-handle::before { border-radius: 50%; }
  html.bit-optimized-ui .topFunctionColor .ant-switch-checked .ant-switch-handle { left: 15px; }
  html.bit-optimized-ui .ant-switch-checked { background: var(--primary) !important; }
  html.bit-optimized-ui .ant-switch-checked .ant-switch-handle::before { background: var(--primary-foreground); }
  html.bit-optimized-ui #contentContainer .ant-tabs-nav::before { border-color: var(--border) !important; }
  html.bit-optimized-ui #contentContainer .ant-tabs-tab { color: var(--muted-foreground); font-size: 13px !important; font-weight: normal !important; }
  html.bit-optimized-ui #contentContainer .ant-tabs-tab-active .ant-tabs-tab-btn { color: var(--foreground) !important; }
  html.bit-optimized-ui #contentContainer .ant-tabs-ink-bar { background: var(--foreground) !important; }
  html.bit-optimized-ui .ant-tabs { overflow: visible !important; }
  html.bit-optimized-ui .ant-tabs-content { margin: 0 !important; display: block !important; transform: none !important; transition: none !important; min-height: 216px; }
  html.bit-optimized-ui .ant-tabs-content:has(.ant-tabs-tabpane-active .scanBox) { min-height: 0; }
  html.bit-optimized-ui .ant-tabs-nav { min-height: 40px; margin-bottom: 16px !important; }
  html.bit-optimized-ui .ant-tabs-nav-wrap { overflow: visible !important; }
  html.bit-optimized-ui .ant-tabs-nav-wrap::before,
  html.bit-optimized-ui .ant-tabs-nav-wrap::after,
  html.bit-optimized-ui .ant-tabs-nav-operations,
  html.bit-optimized-ui .ant-tabs-ink-bar { display: none !important; }
  html.bit-optimized-ui .ant-tabs-nav-list { width: 100%; transform: none !important; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 8px; }
  html.bit-optimized-ui #contentContainer .ant-tabs-tab { margin: 0 !important; padding: 10px 0 0; border-bottom: 2px solid transparent; }
  html.bit-optimized-ui #contentContainer .ant-tabs-tab-active { border-bottom-color: var(--foreground); }
  html.bit-optimized-ui .auth-tab-title-text { font-size: inherit !important; }
  html.bit-optimized-ui .ant-tabs-tab-btn { font-size: inherit !important; font-weight: 400 !important; line-height: 20px !important; }
  html.bit-optimized-ui .ant-tabs-tabpane { transition: none !important; }
  html.bit-optimized-ui .ant-tabs-tabpane:not(.ant-tabs-tabpane-active) { display: none !important; }
  html.bit-optimized-ui :is(#normalLoginForm, #smsLoginForm, #mailLoginForm, #webauthnLoginForm) { display: grid; grid-template-rows: 36px 36px 20px 36px; gap: 16px; }
  html.bit-optimized-ui .login-normal-item { margin: 0 !important; }
  html.bit-optimized-ui .login-normal-button { grid-row: 4; margin: 0 !important; }
  html.bit-optimized-ui .ant-tabs-content-holder { position: relative; min-height: 216px; }
  html.bit-optimized-ui .ant-tabs-tabpane-active .scanBox { margin-top: 0; }
  html.bit-optimized-ui .ant-tabs-content-holder:has(.scanBox) .ant-tabs-tabpane-active:has(.scanBox) { transform: translateY(-8px); }
  html.bit-optimized-ui #contentContainer .ant-tabs-content-holder > .topFunctionColor { position: static; display: flex; justify-content: center; margin-top: 8px; height: 20px; border: 0; background: transparent; padding: 0; }
  html.bit-optimized-ui #contentContainer .ant-tabs-content-holder:has(.ant-tabs-tabpane-active .item-input-group) > .topFunctionColor { position: absolute; top: 104px; left: 0; margin: 0; z-index: 1; }
  html.bit-optimized-ui #contentContainer .item-input-group:has(app-sms-code) { padding-right: 5px; }
  html.bit-optimized-ui #contentContainer .item-input-group:has(app-sms-code) .ant-input-suffix { align-items: center; margin-left: 8px; }
  html.bit-optimized-ui #contentContainer app-sms-code,
  html.bit-optimized-ui #contentContainer app-sms-code .input-decorator-icon { display: flex; align-items: center; height: 28px; margin: 0; line-height: 1; }
  html.bit-optimized-ui #contentContainer app-sms-code :is(.font-class-text-button, .wait-send-again-text) { display: inline-flex; align-items: center; justify-content: center; height: auto; padding: 2px 8px; line-height: 18px; box-sizing: border-box; border: 1px solid var(--border); border-radius: calc(var(--radius) - 4px); background: var(--muted); color: var(--foreground) !important; font-size: 12px; text-decoration: none !important; white-space: nowrap; transition: background-color 150ms, color 150ms, border-color 150ms; }
  html.bit-optimized-ui #contentContainer app-sms-code .wait-send-again-text { color: var(--muted-foreground) !important; font-size: 12px !important; font-weight: 400 !important; font-variant-numeric: tabular-nums; cursor: default; }
  html.bit-optimized-ui #smsLoginForm .login-normal-action { position: static; grid-row: 5; width: 100%; margin: 0 !important; line-height: 20px; }
  html.bit-optimized-ui #smsLoginForm .login-normal-describe { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 8px; }
  html.bit-optimized-ui #smsLoginForm .tips { flex: 1 1 100%; white-space: normal; overflow-wrap: anywhere; }
  html.bit-optimized-ui #smsLoginForm .tips :is(label, span) { color: var(--muted-foreground) !important; font-size: 12px !important; font-weight: 400 !important; line-height: 20px; }
  html.bit-optimized-ui #smsLoginForm .verification-code-error-color { font-size: 12px !important; font-weight: 400 !important; }
  html.bit-optimized-ui #contentContainer app-sms-code .font-class-text-button:hover { text-decoration: none !important; background: color-mix(in oklch, var(--foreground) 12%, var(--card)); }
  html.bit-optimized-ui #contentContainer .item-input-group { min-height: 36px; height: 36px !important; box-sizing: border-box;
    padding: 3px 12px; align-items: center; border: 1px solid var(--input) !important; border-radius: calc(var(--radius) - 2px) !important;
    background: var(--field-background) !important; box-shadow: 0 1px 2px #0001; }
  html.bit-optimized-ui #contentContainer .item-input-group:focus-within {
    border-color: var(--muted-foreground) !important; box-shadow: 0 0 0 3px color-mix(in oklch, var(--muted-foreground) 50%, transparent); }
  html.bit-optimized-ui #contentContainer .login-button:hover { background: color-mix(in oklch, var(--primary) 90%, transparent) !important; }
  html.bit-optimized-ui .bit-login-footer { position: absolute; bottom: 8px; left: 20px; right: 20px; height: 32px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; font-size: 12px; }
  html.bit-optimized-ui .bit-login-footer :is(.login-panel-box, .last-action, .passkey-use) { position: static !important; width: auto !important; margin: 0 !important; padding: 0 !important; }
  html.bit-optimized-ui .bit-login-footer .login-panel-box { grid-column: 2; grid-row: 1; }
  html.bit-optimized-ui .bit-login-footer :is(.last-action, .passkey-use) { grid-column: 3; grid-row: 1; justify-self: end; white-space: nowrap; }
  html.bit-optimized-ui .bit-login-footer .ant-btn-link { height: auto; padding: 0; border: 0; }
  html.bit-optimized-ui .bit-login-footer > [hidden] { display: none !important; }
  html.bit-optimized-ui #contentContainer .bit-login-footer :is(span, a, button) { font-size: 12px !important; font-weight: 400; }
  html.bit-optimized-ui #contentContainer .eyes-icon { position: absolute !important; right: 6px !important; top: 50% !important; transform: translateY(-50%); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  html.bit-optimized-ui #contentContainer .eyes-icon :is(i, svg) { color: var(--muted-foreground) !important; display: block; line-height: 1; }
  html.bit-optimized-ui #contentContainer .eyes-icon:hover :is(i, svg) { color: var(--foreground) !important; }
  html.bit-optimized-ui #contentContainer .passwordInput input.ant-input { padding-right: 28px !important; }
  html.bit-optimized-ui .login-notice-list { flex-wrap: nowrap !important; white-space: nowrap; margin: 0 !important; padding: 0 !important; }
  html.bit-optimized-ui #contentContainer .ant-input-prefix { flex: 0 0 14px; width: 14px; margin-right: 8px; }
  html.bit-optimized-ui #contentContainer .ant-input-prefix ion-icon { width: 14px; height: 14px; font-size: 14px; }
  html.bit-optimized-ui #contentContainer .ant-input { font: var(--login-input-font) !important; background: transparent !important;
    height: 28px !important; line-height: 28px !important; padding: 0 !important; font-size: 14px !important; color: var(--foreground) !important; caret-color: var(--foreground); box-shadow: none !important; }
  html.bit-optimized-ui #contentContainer .ant-input:is(:autofill, :-webkit-autofill) { -webkit-text-fill-color: var(--foreground) !important; caret-color: var(--foreground); }
  html.bit-optimized-ui #contentContainer .ant-input::placeholder { color: var(--muted-foreground) !important; }
  html.bit-optimized-ui #contentContainer .login-button { height: 36px; border-radius: calc(var(--radius) - 2px) !important;
    background: var(--primary) !important; border: 0 !important; color: var(--primary-foreground) !important;
    font-size: 14px; font-weight: 500; box-shadow: none !important; }
  html.bit-optimized-ui #contentContainer .login-button.disabled,
  html.bit-optimized-ui #contentContainer .login-button:disabled { opacity: .5; }
  html.bit-optimized-ui #contentContainer rg-copyright { position: static !important; order: 2; width: auto; max-width: 100%; }
  html.bit-optimized-ui #contentContainer .phone-copyright { position: static !important;
    color: var(--muted-foreground) !important; text-align: center; line-height: 1.8; padding: 0 !important; }
  html.bit-optimized-ui #contentContainer :is(a, .forgetPassword, .light-app) { color: var(--muted-foreground) !important; text-decoration: none !important; text-underline-offset: 4px; transition: color 150ms; cursor: pointer; }
  html.bit-optimized-ui #contentContainer :is(a, .forgetPassword, .light-app):hover { color: var(--foreground) !important; text-decoration: underline !important; }
  @media (prefers-reduced-motion: reduce) { html.bit-optimized-ui .login-content-left { transition: none; } }
  @media (max-width: 480px) {
    html.bit-optimized-ui #contentContainer { padding: 24px 12px; justify-content: flex-start; }
    html.bit-optimized-ui #login-content-right { padding: 20px 20px 64px !important; }
    html.bit-optimized-ui .ant-tabs-nav-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    html.bit-optimized-ui #contentContainer .ant-tabs-tab { justify-content: center; }
    html.bit-optimized-ui .bit-login-footer { grid-template-columns: 1fr auto; left: 64px; right: 16px; gap: 4px; height: auto; min-height: 32px; }
    html.bit-optimized-ui .bit-login-footer .login-panel-box { grid-column: 1; }
    html.bit-optimized-ui .bit-login-footer :is(.last-action, .passkey-use) { grid-column: 2; white-space: normal; text-align: right; }
    html.bit-optimized-ui #contentContainer .phone-copyright { white-space: normal; font-size: 11px; }
  }
`

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
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
  const media = document.defaultView.matchMedia('(prefers-color-scheme: dark)')
  const storage = document.defaultView.sessionStorage
  let mode = storage.getItem('bit-autologin-theme')
  const themeButton = document.createElement('button')
  themeButton.type = 'button'
  themeButton.className = 'bit-theme-button'
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

  const noticeButton = document.createElement('button')
  noticeButton.type = 'button'
  noticeButton.className = 'bit-notice-button'
  noticeButton.textContent = '公告'
  noticeButton.ariaLabel = '公告'
  noticeButton.onclick = () => {
    const card = noticeButton.closest('.login-content')
    const expanded = card.classList.toggle('bit-notice-open')
    const nativeExpanded = !!card.querySelector('.login-content-left:not(.notice-hide)')
    if (expanded !== nativeExpanded) card.querySelector('.newNotice, .newHideNotice')?.click()
    sync()
  }
  function toggleRemember(event) {
    const wrapper = event.target.closest('.topFunctionColor')
    if (wrapper && !event.target.closest('button')) wrapper.querySelector('button')?.click()
  }
  document.addEventListener('click', toggleRemember)
  const brand = document.createElement('div')
  brand.className = 'bit-login-brand'
  brand.innerHTML =
    '<div class="bit-brand-emblem"></div><span class="bit-brand-name">数智北理</span><span class="bit-brand-subtitle">| 统一身份认证</span>'
  const emblem = brand.firstElementChild
  const header = document.createElement('div')
  header.className = 'bit-login-header'
  header.innerHTML =
    '<h1>统一身份认证</h1><div id="bit-login-actions"></div><div class="bit-login-separator" role="separator">Or</div>'
  const footer = document.createElement('div')
  footer.className = 'bit-login-footer'
  const tabLabels = { 通行密钥认证: '通行密钥', 用户名密码: '用户密码', 短信验证码: '手机验证码' }
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
    if (footer.parentNode !== card) card.append(footer)
    if (noticeButton.parentNode !== card) card.append(noticeButton)
    if (themeButton.parentNode !== card) card.append(themeButton)
    for (const element of card.querySelectorAll('.last-action, .passkey-use, .login-panel-box')) {
      if (moved.has(element)) continue
      const marker = document.createComment('login-footer')
      element.before(marker)
      moved.set(element, marker)
      footer.append(element)
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
    const value = String(expanded)
    if (noticeButton.getAttribute('aria-expanded') !== value) {
      noticeButton.setAttribute('aria-expanded', value)
      noticeButton.textContent = expanded ? '收起' : '公告'
    }
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
    if (remember && holder && remember.parentNode !== holder) holder.append(remember)
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
    footer.remove()
    brand.remove()
    header.remove()
    themeButton.remove()
    noticeButton.closest('.login-content')?.classList.remove('bit-notice-open')
    noticeButton.remove()
    style.remove()
    delete document.documentElement.dataset.bitTheme
  }
}
