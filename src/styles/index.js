import shared from './shared.css?raw'
import tokens from './tokens.css?raw'
import page from './page.css?raw'
import controls from './controls.css?raw'
import login from './login.css?raw'
import settings from './settings.css?raw'
import helper from './helper.css?raw'
import captcha from './captcha.css?raw'

export const themeStyles = [shared, tokens, page, controls, login, captcha].join('\n')
export const helperStyles = [shared, settings, helper].join('\n')
