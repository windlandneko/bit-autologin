// Delegate to the site's existing actions, including its validation/loading state.
export function mountCaptchaDialog(document) {
  let enterHandled = false
  function stopEnter(event) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  function onKeyup(event) {
    if (event.key !== 'Enter' || !enterHandled) return
    enterHandled = false
    stopEnter(event)
  }
  function onKeydown(event) {
    if (event.key === 'Enter' && event.repeat && enterHandled) {
      stopEnter(event)
      return
    }
    if (
      event.key !== 'Enter' ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.repeat ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    const input = event.target.closest('input')
    const dialog = input?.closest('rg-captcha-code-web-dialog')
    const confirm = dialog?.querySelector('.btn-confirm')
    if (!confirm) return
    enterHandled = true
    stopEnter(event)
    if (
      !confirm.disabled &&
      !confirm.matches('[disabled], [aria-disabled="true"], [aria-busy="true"]')
    )
      confirm.click()
  }
  function onClick(event) {
    if (!event.target.matches('.cdk-overlay-backdrop')) return
    const panes = event.target.parentElement.querySelectorAll('.cdk-overlay-pane')
    panes[panes.length - 1]?.querySelector('rg-captcha-code-web-dialog .btn-cancel')?.click()
  }
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('keyup', onKeyup, true)
  document.addEventListener('click', onClick)
  return () => {
    document.removeEventListener('keydown', onKeydown, true)
    document.removeEventListener('keyup', onKeyup, true)
    document.removeEventListener('click', onClick)
  }
}
