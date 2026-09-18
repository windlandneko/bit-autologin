import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { mountCaptchaDialog } from '../src/captcha-dialog.js'

function setup(t) {
  const dom = new JSDOM(`<div class="cdk-overlay-container"><div class="cdk-overlay-backdrop"></div>
    <div class="cdk-global-overlay-wrapper"><div class="cdk-overlay-pane"><rg-captcha-code-web-dialog>
    <input class="captcha-input"><button class="btn-cancel">取消</button>
    <button class="btn-confirm">确定</button>
    </rg-captcha-code-web-dialog></div></div></div><input id="outside">`)
  const document = dom.window.document
  const cleanup = mountCaptchaDialog(document)
  t.after(() => {
    cleanup()
    dom.window.close()
  })
  const input = document.querySelector('input')
  const confirm = document.querySelector('.btn-confirm')
  const cancel = document.querySelector('.btn-cancel')
  const counts = { confirm: 0, cancel: 0 }
  confirm.onclick = () => counts.confirm++
  cancel.onclick = () => counts.cancel++
  function enter(options = {}, target = input) {
    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...options,
    })
    target.dispatchEvent(event)
    return event
  }
  return { document, input, confirm, counts, enter, cleanup }
}

test('captcha Enter uses the existing confirm action and prevents default form submission', (t) => {
  const h = setup(t)
  assert.equal(h.enter().defaultPrevented, true)
  assert.equal(h.counts.confirm, 1)
})

test('captcha Enter ignores composition, repeats, modifiers, unrelated inputs and disabled/loading actions', (t) => {
  const h = setup(t)
  for (const options of [
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { ctrlKey: true },
    { shiftKey: true },
    { key: 'Escape' },
  ])
    h.enter(options)
  h.enter({}, h.document.querySelector('#outside'))
  h.confirm.disabled = true
  h.enter()
  h.confirm.disabled = false
  h.confirm.setAttribute('disabled', '')
  h.enter()
  h.confirm.removeAttribute('disabled')
  h.confirm.setAttribute('aria-busy', 'true')
  h.enter()
  assert.equal(h.counts.confirm, 0)
})

test('only the captcha backdrop cancels; clicks inside or behind another dialog do not', (t) => {
  const h = setup(t)
  h.input.click()
  assert.equal(h.counts.cancel, 0)
  const backdrop = h.document.querySelector('.cdk-overlay-backdrop')
  backdrop.click()
  assert.equal(h.counts.cancel, 1)
  const pane = h.document.createElement('div')
  pane.className = 'cdk-overlay-pane'
  backdrop.parentElement.append(pane)
  backdrop.click()
  assert.equal(h.counts.cancel, 1)
})

test('captcha listeners are removed during teardown', (t) => {
  const h = setup(t)
  h.cleanup()
  h.enter()
  h.document.querySelector('.cdk-overlay-backdrop').click()
  assert.deepEqual(h.counts, { confirm: 0, cancel: 0 })
})

test('Enter cannot toggle the switch after confirmation restores focus', (t) => {
  const h = setup(t)
  const next = h.document.createElement('button')
  next.setAttribute('role', 'switch')
  next.setAttribute('aria-checked', 'true')
  h.document.body.append(next)
  let leaked = 0
  next.addEventListener('keyup', () => {
    leaked++
    next.setAttribute('aria-checked', 'false')
  })
  h.document.addEventListener('keydown', () => leaked++)
  h.confirm.onclick = () => {
    h.counts.confirm++
    h.input.closest('rg-captcha-code-web-dialog').remove()
    next.focus()
  }
  h.enter()
  h.enter({ repeat: true }, next)
  const keyup = new h.document.defaultView.KeyboardEvent('keyup', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  })
  next.dispatchEvent(keyup)
  assert.equal(keyup.defaultPrevented, true)
  assert.equal(h.counts.confirm, 1)
  assert.equal(leaked, 0)
  assert.equal(next.getAttribute('aria-checked'), 'true')
  h.enter({}, next)
  assert.equal(leaked, 1)
})
