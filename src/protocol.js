export function loginRoute(href) {
  const url = new URL(href)
  if (url.protocol !== 'https:') return null
  if (url.hostname === 'sso.bit.edu.cn' && /^\/cas\/login\/?$/.test(url.pathname)) {
    return { url, prefix: '', vpn: false }
  }
  const match = url.pathname.match(/^(\/https?\/[0-9a-f]+)\/cas\/login\/?$/i)
  if (url.hostname === 'webvpn.bit.edu.cn' && match) {
    return { url, prefix: match[1], vpn: true }
  }
  return null
}

export function readPageState(document) {
  const text = (id) => document.getElementById(id)?.textContent.trim() || ''
  return {
    key: text('login-croypto'),
    execution: text('login-page-flowkey'),
    type: text('current-login-type'),
    rule: text('login-rule-type'),
    second: text('sso-second'),
    error: text('login-error-code'),
    captchaUrl: text('captcha-url'),
    captchaInvisible: text('recaptcha-invisible'),
    captchaVendor: text('recaptchaVendor'),
    riskEngine: text('riskSystemSwitch'),
    siteId: text('siteId'),
    targetSystem: text('targetSystem'),
  }
}

export function pageBlockReason(state) {
  if (state.second && state.second !== 'false') return '请先在原页面完成二次验证'
  if (state.type && state.type !== 'UsernamePassword')
    return '当前是其他认证方式，请使用原页面完成验证'
  if (state.rule && state.rule !== 'normal') return '当前认证流程需要在原页面继续'
  if (state.error) return `服务端返回认证提示（${state.error}），请在原页面处理后重试`
  if (state.captchaUrl || state.captchaInvisible === 'true')
    return '当前需要验证码，请在原页面完成验证'
  if (state.captchaVendor && state.captchaVendor !== 'system')
    return '当前需要交互式验证，请在原页面完成'
  if (!state.key || !state.execution) return '未找到当前认证参数，请刷新认证页面'
  if (state.riskEngine !== 'USTC') return '认证风险模块已变化，请使用原页面登录'
  return ''
}

// Web Crypto has no AES-ECB. For each padded block, CBC with a zero IV has
// the same first ciphertext block. Discard Web Crypto's extra padding block.
export async function encryptField(base64Key, plaintext) {
  const keyBytes = Uint8Array.fromBase64(base64Key)
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt'])
  const input = new TextEncoder().encode(plaintext)
  const pad = 16 - (input.length % 16)
  const padded = new Uint8Array(input.length + pad)
  padded.set(input)
  padded.fill(pad, input.length)
  const result = new Uint8Array(padded.length)
  for (let offset = 0; offset < padded.length; offset += 16) {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: new Uint8Array(16) },
      key,
      padded.slice(offset, offset + 16),
    )
    result.set(new Uint8Array(encrypted).subarray(0, 16), offset)
  }
  return result.toBase64()
}

export async function encodeVpnHost(
  host,
  keyText = 'wrdvpnisthebest!',
  ivText = 'wrdvpnisthebest!',
) {
  const encoder = new TextEncoder()
  const iv = encoder.encode(ivText)
  if (iv.length !== 16) throw new Error('WebVPN 加密参数无效')
  const key = await crypto.subtle.importKey('raw', encoder.encode(keyText), 'AES-CBC', false, [
    'encrypt',
  ])
  const input = encoder.encode(host)
  const padded = new Uint8Array(Math.ceil(input.length / 16) * 16)
  padded.fill(48)
  padded.set(input)
  const result = new Uint8Array(padded.length)
  let feedback = iv
  for (let offset = 0; offset < padded.length; offset += 16) {
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, key, feedback),
    )
    const block = padded.slice(offset, offset + 16).map((byte, index) => byte ^ encrypted[index])
    result.set(block, offset)
    feedback = block
  }
  return iv.toHex() + result.subarray(0, input.length).toHex()
}

export async function requestRisk(route, pageWindow, signal) {
  // The site's fingerprint script can load after DOMContentLoaded.
  while (!pageWindow.generateFingerprintObject) {
    signal.throwIfAborted()
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  signal.throwIfAborted()
  const { promise, reject } = Promise.withResolvers()
  const abort = () => reject(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  try {
    const fingerprint = await Promise.race([pageWindow.generateFingerprintObject(), promise])
    signal.throwIfAborted()
    const token = await requestRiskToken(route, fingerprint, signal)
    return {
      token,
      groupId: fingerprint.localgroupId === 'error' ? '' : fingerprint.localgroupId,
    }
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export async function requestRiskToken(route, fingerprint, signal) {
  const url = new URL(`${route.prefix}/ustc-rba-front/fp`, route.url.origin)
  const response = await fetch(url.href, {
    method: 'POST',
    credentials: 'include',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fingerprint),
  })
  if (!response.ok) throw new Error(`风险认证接口返回 HTTP ${response.status}`)
  const data = await response.json()
  if (typeof data.responsetoken !== 'string' || !data.responsetoken) {
    throw new Error('未取得风险认证令牌，请使用原页面继续验证')
  }
  return data.responsetoken
}

export async function buildPayload(state, { username, password }, risk) {
  const [encryptedPassword, captcha, encryptedRisk] = await Promise.all([
    encryptField(state.key, password),
    encryptField(state.key, '{}'),
    encryptField(state.key, JSON.stringify(risk)),
  ])
  return {
    username: username.trim(),
    password: encryptedPassword,
    croypto: state.key,
    execution: state.execution,
    type: 'UsernamePassword',
    _eventId: 'submit',
    geolocation: '',
    captcha_code: '',
    captcha_payload: captcha,
    risk_payload: encryptedRisk,
    targetSystem: state.targetSystem,
    siteId: state.siteId,
    riskEngine: 'true',
  }
}

export function submitPayload(document, route, payload) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = route.url.href
  form.hidden = true
  for (const [name, value] of Object.entries(payload)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  // A direct HTTP form navigation, not interaction with the site's controls.
  // The browser owns redirects, HttpOnly cookies and any MFA response page.
  try {
    document.defaultView.HTMLFormElement.prototype.submit.call(form)
  } catch (error) {
    form.remove()
    throw error
  }
}
