import assert from 'node:assert/strict'
import { createCipheriv } from 'node:crypto'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  encryptField,
  encodeVpnHost,
  buildPayload,
  readPageState,
  pageBlockReason,
  loginRoute,
  submitPayload,
  requestRiskToken,
  requestRisk,
} from '../src/protocol.js'

export const fixtureState = {
  key: Buffer.alloc(16, 7).toString('base64'),
  execution: 'flow-test',
  type: 'UsernamePassword',
  rule: 'normal',
  second: '',
  error: '',
  captchaVendor: 'system',
  riskEngine: 'USTC',
  siteId: 'sourceId',
  targetSystem: 'sso',
}

for (const length of [16, 24, 32]) {
  test(`AES-${length * 8} matches independent ECB implementation across UTF-8 and padding boundaries`, async () => {
    const key = Buffer.alloc(length, 7)
    for (const value of [
      '',
      'a'.repeat(15),
      'a'.repeat(16),
      'a'.repeat(17),
      '密码🔑&+='.repeat(8),
    ]) {
      const cipher = createCipheriv(`aes-${length * 8}-ecb`, key, null)
      const expected = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString(
        'base64',
      )
      assert.equal(await encryptField(key.toString('base64'), value), expected)
    }
  })
}

test('legacy WebVPN host mapping agrees with AES-CFB and accepts only known login routes', async () => {
  const key = Buffer.from('wrdvpnisthebest!')
  const cipher = createCipheriv('aes-128-cfb', key, key)
  const expected =
    key.toString('hex') +
    Buffer.concat([cipher.update('sso.bit.edu.cn'), cipher.final()]).toString('hex')
  assert.equal(await encodeVpnHost('sso.bit.edu.cn'), expected)
  assert.ok(loginRoute(`https://webvpn.bit.edu.cn/https/${expected}/cas/login`))
  for (const url of [
    'http://sso.bit.edu.cn/cas/login',
    'https://sso.bit.edu.cn.evil.test/cas/login',
    'https://jwms.bit.edu.cn/cas/login',
    'https://sso.bit.edu.cn/cas/logout',
  ]) {
    assert.equal(loginRoute(url), null)
  }
})

test('known challenges and changed protocol states stop credential submission', async () => {
  for (const change of [
    { second: 'true' },
    { type: 'email' },
    { rule: 'second' },
    { error: '1030028' },
    { captchaUrl: '/captcha' },
    { captchaInvisible: 'true' },
    { captchaVendor: 'geetest' },
    { execution: '' },
    { riskEngine: 'UNKNOWN' },
  ]) {
    const state = { ...fixtureState, ...change }
    assert.ok(pageBlockReason(state))
  }
})

test('risk endpoint sends authenticated JSON and rejects missing tokens', async (t) => {
  const route = loginRoute('https://sso.bit.edu.cn/cas/login')
  const fingerprint = { userAgent: 'test', localgroupId: 'device-test' }
  let captured
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    captured = { url, init }
    return { ok: true, json: async () => ({ responsetoken: 'valid-token' }) }
  })
  assert.equal(await requestRiskToken(route, fingerprint), 'valid-token')
  assert.equal(captured.url, 'https://sso.bit.edu.cn/ustc-rba-front/fp')
  assert.equal(captured.init.credentials, 'include')
  assert.equal(captured.init.redirect, 'error')
  for (const response of [
    { ok: false, status: 403 },
    { ok: true, json: async () => ({}) },
  ]) {
    globalThis.fetch.mock.mockImplementation(async () => response)
    await assert.rejects(requestRiskToken(route, fingerprint))
  }
})

test('direct POST preserves service/renew and execution; no cleartext password is inserted', async () => {
  const url =
    'https://sso.bit.edu.cn/cas/login?service=https%3A%2F%2Flexue.bit.edu.cn%2Flogin%2Findex.php%3Fx%3D1%26y%3D2&renew=true'
  const dom = new JSDOM('<body></body>', { url })
  const payload = await buildPayload(
    fixtureState,
    { username: 'student', password: 'secret' },
    { token: 'risk-token', groupId: '' },
  )
  let submitted
  dom.window.HTMLFormElement.prototype.submit = function () {
    submitted = {
      action: this.action,
      method: this.method,
      data: Object.fromEntries(new dom.window.FormData(this)),
    }
  }
  submitPayload(dom.window.document, loginRoute(url), payload)
  assert.equal(submitted.action, url)
  assert.equal(submitted.method, 'post')
  assert.equal(submitted.data.execution, 'flow-test')
  assert.equal(submitted.data.riskEngine, 'true')
  assert.notEqual(submitted.data.password, 'secret')
  assert.equal(dom.window.document.forms.length, 1)
  dom.window.close()
})

test('page metadata parsing never treats account text as HTML', () => {
  const dom = new JSDOM(
    '<p id="login-croypto">key</p><p id="login-page-flowkey">exec</p><p id="sso-second">true</p>',
  )
  assert.equal(readPageState(dom.window.document).execution, 'exec')
  assert.equal(readPageState(dom.window.document).second, 'true')
  dom.window.close()
})

test('fingerprint failure stops authentication instead of sending fabricated data', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {})
  const page = {
    generateFingerprintObject: async () => {
      throw new Error('fingerprint failed')
    },
  }
  await assert.rejects(
    requestRisk(loginRoute('https://sso.bit.edu.cn/cas/login'), page, new AbortController().signal),
    /fingerprint failed/,
  )
  assert.equal(fetch.mock.callCount(), 0)
})

test('pending native fingerprint can be cancelled without submitting a risk request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {})
  const controller = new AbortController()
  const page = { generateFingerprintObject: () => new Promise(() => {}) }
  const pending = requestRisk(
    loginRoute('https://sso.bit.edu.cn/cas/login'),
    page,
    controller.signal,
  )
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 0)
})

test('waits for the native fingerprint script before requesting a risk token', async (t) => {
  const route = loginRoute('https://sso.bit.edu.cn/cas/login')
  const page = {}
  let sent
  t.mock.method(globalThis, 'fetch', async (_, init) => {
    sent = JSON.parse(init.body)
    return { ok: true, json: async () => ({ responsetoken: 'token' }) }
  })
  const pending = requestRisk(route, page, new AbortController().signal)
  page.generateFingerprintObject = async () => ({ localgroupId: 'native-device' })
  assert.deepEqual(await pending, { token: 'token', groupId: 'native-device' })
  assert.deepEqual(sent, { localgroupId: 'native-device' })
})
