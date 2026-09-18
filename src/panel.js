export function setPanelButton(button, label, expanded = false) {
  if (!button || button.getAttribute('aria-expanded') === String(expanded)) return
  button.setAttribute('aria-expanded', String(expanded))
  button.textContent = expanded ? '收起' : label
  button.ariaLabel = expanded ? `收起${label}` : label
}
