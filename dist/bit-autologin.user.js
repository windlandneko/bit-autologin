// ==UserScript==
// @name         [BIT AutoLogin] 一键登录北理工统一身份认证
// @namespace    https://bit.edu.cn/
// @version      2.1.1
// @description  自动登录所有需要北理工统一身份认证的网站！
// @author       windlandneko
// @homepageURL  https://github.com/windlandneko/bit-autologin
// @supportURL   https://github.com/windlandneko/bit-autologin/issues
// @match        https://*.bit.edu.cn/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-end
// @noframes
// @license      MIT
// ==/UserScript==
(function() {
	//#region src/panel.js
	function setPanelButton(button, label, expanded = false) {
		if (!button || button.getAttribute("aria-expanded") === String(expanded)) return;
		button.setAttribute("aria-expanded", String(expanded));
		button.textContent = expanded ? "收起" : label;
		button.ariaLabel = expanded ? `收起${label}` : label;
	}
	//#endregion
	//#region src/captcha-dialog.js
	function mountCaptchaDialog(document) {
		let enterHandled = false;
		function stopEnter(event) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
		function onKeyup(event) {
			if (event.key !== "Enter" || !enterHandled) return;
			enterHandled = false;
			stopEnter(event);
		}
		function onKeydown(event) {
			if (event.key === "Enter" && event.repeat && enterHandled) {
				stopEnter(event);
				return;
			}
			if (event.key !== "Enter" || event.isComposing || event.keyCode === 229 || event.repeat || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
			const confirm = (event.target.closest("input")?.closest("rg-captcha-code-web-dialog"))?.querySelector(".btn-confirm");
			if (!confirm) return;
			enterHandled = true;
			stopEnter(event);
			if (!confirm.disabled && !confirm.matches("[disabled], [aria-disabled=\"true\"], [aria-busy=\"true\"]")) confirm.click();
		}
		function onClick(event) {
			if (!event.target.matches(".cdk-overlay-backdrop")) return;
			const panes = event.target.parentElement.querySelectorAll(".cdk-overlay-pane");
			panes[panes.length - 1]?.querySelector("rg-captcha-code-web-dialog .btn-cancel")?.click();
		}
		document.addEventListener("keydown", onKeydown, true);
		document.addEventListener("keyup", onKeyup, true);
		document.addEventListener("click", onClick);
		return () => {
			document.removeEventListener("keydown", onKeydown, true);
			document.removeEventListener("keyup", onKeyup, true);
			document.removeEventListener("click", onClick);
		};
	}
	//#endregion
	//#region src/protocol.js
	function loginRoute(href) {
		const url = new URL(href);
		if (url.protocol !== "https:") return null;
		if (url.hostname === "sso.bit.edu.cn" && /^\/cas\/login\/?$/.test(url.pathname)) return {
			url,
			prefix: "",
			vpn: false
		};
		const match = url.pathname.match(/^(\/https?\/[0-9a-f]+)\/cas\/login\/?$/i);
		if (url.hostname === "webvpn.bit.edu.cn" && match) return {
			url,
			prefix: match[1],
			vpn: true
		};
		return null;
	}
	function readPageState(document) {
		const text = (id) => document.getElementById(id)?.textContent.trim() || "";
		return {
			key: text("login-croypto"),
			execution: text("login-page-flowkey"),
			type: text("current-login-type"),
			rule: text("login-rule-type"),
			second: text("sso-second"),
			error: text("login-error-code"),
			captchaUrl: text("captcha-url"),
			captchaInvisible: text("recaptcha-invisible"),
			captchaVendor: text("recaptchaVendor"),
			riskEngine: text("riskSystemSwitch"),
			siteId: text("siteId"),
			targetSystem: text("targetSystem")
		};
	}
	function pageBlockReason(state) {
		if (state.second && state.second !== "false") return "请先在原页面完成二次验证";
		if (state.type && state.type !== "UsernamePassword") return "当前是其他认证方式，请在原页面完成验证";
		if (state.rule && state.rule !== "normal") return "请在原页面完成验证";
		if (state.error) return `服务端返回认证提示（${state.error}），请在原页面处理后重试`;
		if (state.captchaUrl || state.captchaInvisible === "true") return "当前需要验证码，请在原页面完成验证";
		if (state.captchaVendor && state.captchaVendor !== "system") return "当前需要交互式验证，请在原页面完成";
		if (!state.key || !state.execution) return "未找到当前认证参数，请刷新页面";
		if (state.riskEngine !== "USTC") return "认证风险模块已变化，请在原页面登录";
		return "";
	}
	async function encryptField(base64Key, plaintext) {
		const keyBytes = Uint8Array.fromBase64(base64Key);
		const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["encrypt"]);
		const input = new TextEncoder().encode(plaintext);
		const pad = 16 - input.length % 16;
		const padded = new Uint8Array(input.length + pad);
		padded.set(input);
		padded.fill(pad, input.length);
		const result = new Uint8Array(padded.length);
		for (let offset = 0; offset < padded.length; offset += 16) {
			const encrypted = await crypto.subtle.encrypt({
				name: "AES-CBC",
				iv: /* @__PURE__ */ new Uint8Array(16)
			}, key, padded.slice(offset, offset + 16));
			result.set(new Uint8Array(encrypted).subarray(0, 16), offset);
		}
		return result.toBase64();
	}
	async function encodeVpnHost(host, keyText = "wrdvpnisthebest!", ivText = "wrdvpnisthebest!") {
		const encoder = new TextEncoder();
		const iv = encoder.encode(ivText);
		if (iv.length !== 16) throw new Error("WebVPN 加密参数无效");
		const key = await crypto.subtle.importKey("raw", encoder.encode(keyText), "AES-CBC", false, ["encrypt"]);
		const input = encoder.encode(host);
		const padded = new Uint8Array(Math.ceil(input.length / 16) * 16);
		padded.fill(48);
		padded.set(input);
		const result = new Uint8Array(padded.length);
		let feedback = iv;
		for (let offset = 0; offset < padded.length; offset += 16) {
			const encrypted = new Uint8Array(await crypto.subtle.encrypt({
				name: "AES-CBC",
				iv: /* @__PURE__ */ new Uint8Array(16)
			}, key, feedback));
			const block = padded.slice(offset, offset + 16).map((byte, index) => byte ^ encrypted[index]);
			result.set(block, offset);
			feedback = block;
		}
		return iv.toHex() + result.subarray(0, input.length).toHex();
	}
	async function requestRisk(route, pageWindow, signal) {
		while (!pageWindow.generateFingerprintObject) {
			signal.throwIfAborted();
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		signal.throwIfAborted();
		const { promise, reject } = Promise.withResolvers();
		const abort = () => reject(signal.reason);
		signal.addEventListener("abort", abort, { once: true });
		try {
			const fingerprint = await Promise.race([pageWindow.generateFingerprintObject(), promise]);
			signal.throwIfAborted();
			return {
				token: await requestRiskToken(route, fingerprint, signal),
				groupId: fingerprint.localgroupId === "error" ? "" : fingerprint.localgroupId
			};
		} finally {
			signal.removeEventListener("abort", abort);
		}
	}
	async function requestRiskToken(route, fingerprint, signal) {
		const url = new URL(`${route.prefix}/ustc-rba-front/fp`, route.url.origin);
		const response = await fetch(url.href, {
			method: "POST",
			credentials: "include",
			redirect: "error",
			signal,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(fingerprint)
		});
		if (!response.ok) throw new Error(`风险认证接口返回 HTTP ${response.status}`);
		const data = await response.json();
		if (typeof data.responsetoken !== "string" || !data.responsetoken) throw new Error("未取得风险认证令牌，请在原页面完成验证");
		return data.responsetoken;
	}
	async function buildPayload(state, { username, password }, risk) {
		const [encryptedPassword, captcha, encryptedRisk] = await Promise.all([
			encryptField(state.key, password),
			encryptField(state.key, "{}"),
			encryptField(state.key, JSON.stringify(risk))
		]);
		return {
			username: username.trim(),
			password: encryptedPassword,
			croypto: state.key,
			execution: state.execution,
			type: "UsernamePassword",
			_eventId: "submit",
			geolocation: "",
			captcha_code: "",
			captcha_payload: captcha,
			risk_payload: encryptedRisk,
			targetSystem: state.targetSystem,
			siteId: state.siteId,
			riskEngine: "true"
		};
	}
	function submitPayload(document, route, payload) {
		const form = document.createElement("form");
		form.method = "POST";
		form.action = route.url.href;
		form.hidden = true;
		for (const [name, value] of Object.entries(payload)) {
			const input = document.createElement("input");
			input.type = "hidden";
			input.name = name;
			input.value = value;
			form.append(input);
		}
		document.body.append(form);
		try {
			document.defaultView.HTMLFormElement.prototype.submit.call(form);
		} catch (error) {
			form.remove();
			throw error;
		}
	}
	//#endregion
	//#region src/styles/shared.css?raw
	var shared_default = "/* Shared by the page and both shadow roots, including the unstyled page mode. */\nhtml.bit-optimized-ui,\n:host {\n  --font-ui:\n    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'PingFang SC',\n    'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC',\n    'Source Han Sans SC', 'Noto Sans', Arial, sans-serif;\n  --switch-width: 32px;\n  --switch-height: 18px;\n  --switch-thumb: 14px;\n}\n";
	//#endregion
	//#region src/styles/tokens.css?raw
	var tokens_default = "html.bit-optimized-ui {\n  /* Neutral tokens and spacing from shadcn/ui new-york-v4, login-03. */\n  color-scheme: light;\n  --control-height: 38px;\n  --input-size: 14px;\n  --field-gap: 12px;\n  --footer-gap: 8px;\n  --footer-width: 48px;\n  --footer-height: 32px;\n  --panel-inset: 68px var(--footer-gap) var(--footer-gap);\n  --field-shadow: 0 1px 2px #0001;\n  --field-focus-shadow: 0 0 0 3px color-mix(in oklch, var(--muted-foreground) 50%, transparent);\n  --switch-label-font: 400 14px/1.5 var(--font-ui);\n  --login-input-font: 400 var(--input-size)/1.5 var(--font-ui);\n  --background: oklch(1 0 0);\n  --foreground: oklch(0.145 0 0);\n  --card: oklch(1 0 0);\n  --muted: oklch(0.97 0 0);\n  --muted-foreground: oklch(0.556 0 0);\n  --border: oklch(0.922 0 0);\n  --primary: oklch(0.205 0 0);\n  --primary-foreground: oklch(0.985 0 0);\n  --field-background: transparent;\n  --input: oklch(0.922 0 0);\n  --radius: 0.625rem;\n  background: var(--muted);\n  @media (max-width: 480px), (pointer: coarse) {\n    --control-height: 44px;\n    --input-size: 16px;\n  }\n  @media (pointer: coarse) {\n    --footer-height: 44px;\n  }\n  &[data-bit-theme='dark'] {\n    color-scheme: dark;\n    --background: oklch(0.145 0 0);\n    --foreground: oklch(0.985 0 0);\n    --card: oklch(0.205 0 0);\n    --muted: oklch(0.269 0 0);\n    --muted-foreground: oklch(0.708 0 0);\n    --border: oklch(1 0 0 / 10%);\n    --primary: oklch(0.922 0 0);\n    --primary-foreground: oklch(0.205 0 0);\n    --input: oklch(1 0 0 / 15%);\n    --field-background: color-mix(in oklch, var(--input) 30%, transparent);\n  }\n}\n";
	//#endregion
	//#region src/styles/page.css?raw
	var page_default = "html.bit-optimized-ui {\n  & body {\n    background: var(--muted) !important;\n    color: var(--foreground);\n    font-family: var(--font-ui);\n    font-size: 14px;\n    line-height: 1.5;\n    -webkit-text-size-adjust: 100%;\n    text-size-adjust: 100%;\n  }\n  & #contentContainer {\n    position: relative !important;\n    min-height: 100svh;\n    height: auto !important;\n    padding: 40px 32px;\n    box-sizing: border-box;\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    gap: 24px;\n    background: var(--muted) !important;\n  }\n  & #contentContainer :is(input, button, select, textarea) {\n    font-family: var(--font-ui);\n  }\n  & .pc-background-none {\n    background: var(--muted) !important;\n  }\n  & .login-title,\n  & .normal-title {\n    display: none;\n  }\n  & .wrap-normal-title {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 20px;\n    align-items: center;\n  }\n  & .login-title-img {\n    position: static !important;\n    height: 40px !important;\n    max-width: 100%;\n    object-fit: contain;\n  }\n  & .login-content {\n    position: relative !important;\n    inset: auto !important;\n    transform: none !important;\n    display: block !important;\n    width: min(440px, 100%) !important;\n    box-sizing: border-box;\n    height: auto !important;\n    min-height: 0 !important;\n    margin: 0 !important;\n    padding: 0 !important;\n    background-color: var(--card) !important;\n    background-size: 0 0 !important;\n    border: 1px solid var(--border);\n    border-radius: 12px !important;\n    overflow: hidden;\n    box-shadow: 0 1px 3px #0001;\n    backdrop-filter: none !important;\n  }\n  & .login-content::before {\n    display: none !important;\n  }\n  & .bit-brand-emblem {\n    width: 40px;\n    height: 40px;\n    overflow: hidden;\n    flex: 0 0 40px;\n  }\n  & .bit-brand-emblem .login-title-img {\n    width: auto !important;\n    max-width: none !important;\n  }\n  & .bit-login-brand {\n    position: relative;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 6px;\n    color: var(--foreground);\n    flex-wrap: wrap;\n    max-width: 100%;\n  }\n  & .bit-brand-name {\n    font-size: 20px;\n    font-weight: 600;\n  }\n  & .bit-brand-subtitle {\n    font-size: 12px;\n  }\n  & .bit-login-header {\n    width: 100%;\n    text-align: center;\n    margin-bottom: 8px;\n  }\n  & .bit-login-header h1 {\n    margin: 0 0 8px;\n    font-size: 24px;\n    line-height: 32px;\n    font-weight: 600;\n    color: var(--foreground) !important;\n  }\n  & #bit-login-actions {\n    display: flex;\n    align-items: center;\n    gap: 10px;\n    margin: 24px 0;\n  }\n  & #bit-login-actions > #bit-sso-helper {\n    flex: 1;\n    min-width: 0;\n  }\n  & .bit-login-separator {\n    display: flex;\n    gap: 12px;\n    align-items: center;\n    color: var(--muted-foreground);\n    font-size: 14px;\n  }\n  & .bit-login-separator::before,\n  & .bit-login-separator::after {\n    content: '';\n    flex: 1;\n    height: 1px;\n    background: var(--border);\n  }\n  & .toogle-button {\n    position: absolute;\n    bottom: 16px;\n    left: 16px;\n  }\n  & .toggle-button-container {\n    position: static !important;\n  }\n  & .login-content-left,\n  & .bit-settings-preview {\n    position: absolute !important;\n    z-index: 20;\n    display: block !important;\n    inset: var(--panel-inset) !important;\n    width: auto !important;\n    height: auto !important;\n    min-height: 0 !important;\n    padding: 24px 24px 48px;\n    overflow: hidden;\n    box-sizing: border-box;\n    background: transparent !important;\n    border-radius: 4px;\n    clip-path: inset(calc(100% - 32px) calc(100% - 48px) 0 0 round 6px);\n    transition:\n      clip-path 200ms ease,\n      background-color 150ms;\n    pointer-events: none;\n  }\n  & .bit-settings-preview {\n    clip-path: inset(calc(100% - 32px) 0 0 calc(100% - 48px) round 6px);\n  }\n  & .login-content:has(.bit-settings-button:hover) .bit-settings-preview,\n  & .login-content:has(.bit-notice-button:hover) .login-content-left,\n  & .login-content.bit-notice-open .login-content-left {\n    background: var(--muted) !important;\n  }\n  & #gm-sso-config.inline-settings {\n    position: absolute;\n    inset: var(--panel-inset);\n    z-index: 20;\n  }\n  & .login-content.bit-notice-open .login-content-left {\n    clip-path: inset(0 round 4px);\n    pointer-events: auto;\n  }\n  & .login-content-left .notice-content {\n    width: 100% !important;\n    min-width: 0 !important;\n    max-width: 100% !important;\n    height: 100%;\n    overflow: auto;\n    box-sizing: border-box;\n    overflow-wrap: anywhere;\n    color: var(--foreground) !important;\n    background: transparent !important;\n    padding: 0 !important;\n    opacity: 0;\n    transition: opacity 100ms;\n  }\n  & .login-content.bit-notice-open .login-content-left .notice-content {\n    opacity: 1;\n    transition-delay: 80ms;\n  }\n  & .login-content-left::after {\n    display: none !important;\n  }\n  & .notice-content-item {\n    width: auto !important;\n    min-width: 0 !important;\n    padding: 0 !important;\n  }\n  & .noticTitle {\n    padding: 0 !important;\n    margin: 0 0 24px !important;\n    text-align: left;\n  }\n  & .notice-content p {\n    line-height: 1.8;\n    margin-bottom: 12px;\n  }\n  & .notice-content a {\n    color: var(--foreground) !important;\n    text-decoration: none;\n    text-underline-offset: 3px;\n  }\n  & #login-content-right {\n    position: static !important;\n    float: none !important;\n    width: auto !important;\n    min-width: 0 !important;\n    min-height: 0 !important;\n    padding: 20px 24px 64px !important;\n    background: var(--card) !important;\n    box-sizing: border-box;\n    align-self: stretch;\n    display: flex;\n    align-items: center;\n  }\n  & .normal-row,\n  & app-auth-panel-new > .ant-row {\n    padding: 0 !important;\n  }\n  & #contentContainer .topFunctionColor {\n    position: static;\n    transform: none;\n  }\n  & .login-content-right-wrapper,\n  & #login-content-right-inner {\n    width: 100% !important;\n    min-height: 0 !important;\n  }\n}\n";
	//#endregion
	//#region src/styles/controls.css?raw
	var controls_default = "html.bit-optimized-ui {\n  & #contentContainer .filterColor,\n  & #contentContainer .eyes-icon,\n  & #contentContainer ion-icon {\n    color: var(--foreground) !important;\n  }\n  & :is(.newNotice, .newHideNotice) {\n    display: none !important;\n  }\n  & .bit-notice-button,\n  & .bit-settings-button,\n  & .bit-theme-button,\n  & #contentContainer .topFunctionColor {\n    display: inline-flex;\n    align-items: center;\n    justify-content: center;\n    gap: 8px;\n    height: 32px;\n    padding: 0 12px;\n    border: 1px solid var(--border);\n    border-radius: var(--radius);\n    background: var(--background);\n    color: var(--foreground) !important;\n    font-family: inherit;\n    font-size: 12px;\n    box-shadow: none;\n    line-height: 1;\n    box-sizing: border-box;\n  }\n  & .bit-notice-button,\n  & .bit-settings-button,\n  & .bit-theme-button {\n    position: absolute;\n    cursor: pointer;\n  }\n  & :is(.bit-notice-button, .bit-settings-button) {\n    bottom: var(--footer-gap);\n    z-index: 30;\n    width: var(--footer-width);\n    height: var(--footer-height);\n    padding: 0;\n    background: transparent;\n    border: 0;\n    border-radius: 6px;\n    transition:\n      color 150ms,\n      transform 200ms ease;\n  }\n  & #contentContainer :is(.bit-notice-button, .bit-settings-button) {\n    color: var(--muted-foreground) !important;\n  }\n  & #contentContainer :is(.bit-notice-button, .bit-settings-button):hover {\n    color: var(--foreground) !important;\n  }\n  & .bit-notice-button {\n    left: var(--footer-gap);\n  }\n  & .bit-settings-button {\n    right: var(--footer-gap);\n  }\n  & .bit-settings-button[aria-expanded='true'] {\n    transform: translate(calc(-1 * var(--footer-gap)), calc(-1 * var(--footer-gap)));\n  }\n  & .bit-notice-button[aria-expanded='true'] {\n    transform: translate(var(--footer-gap), calc(-1 * var(--footer-gap)));\n  }\n  /* Keep the opposite action below the panel throughout opening and closing. */\n  & .bit-settings-open > .bit-notice-button,\n  & .bit-notice-open > .bit-settings-button,\n  & .bit-notice-closing:not(.bit-settings-open) > .bit-settings-button {\n    z-index: 10;\n    pointer-events: none;\n  }\n  & .bit-theme-button {\n    top: 20px;\n    right: 20px;\n    z-index: 60;\n    width: 32px;\n    padding: 0;\n    border: 0;\n    background: transparent;\n  }\n  & #contentContainer .topFunctionColor,\n  & #contentContainer .topFunctionColor * {\n    user-select: none;\n    cursor: pointer;\n    box-shadow: none !important;\n  }\n  & #contentContainer .topFunctionColor,\n  & #contentContainer .topFunctionColor > span {\n    font: var(--switch-label-font) !important;\n    color: var(--muted-foreground) !important;\n  }\n  & .topFunctionColor nz-switch {\n    display: flex;\n    align-items: center;\n  }\n  & .bit-notice-button[hidden] {\n    display: none;\n  }\n  & .bit-theme-button:hover {\n    background: var(--muted);\n  }\n  & .topFunctionColor .ant-switch:not(.ant-switch-checked) {\n    background: var(--input) !important;\n  }\n  & .topFunctionColor .ant-switch {\n    margin: 0 !important;\n    top: auto !important;\n    box-shadow: none !important;\n    vertical-align: middle;\n    width: var(--switch-width);\n    min-width: var(--switch-width);\n    height: var(--switch-height);\n    border: 1px solid transparent;\n    border-radius: 999px;\n  }\n  & .topFunctionColor .ant-switch-handle {\n    top: 1px;\n    left: 1px;\n    width: var(--switch-thumb);\n    height: var(--switch-thumb);\n  }\n  & .topFunctionColor .ant-switch-handle::before {\n    box-shadow: none !important;\n    border-radius: 50%;\n  }\n  & .topFunctionColor .ant-switch-checked .ant-switch-handle {\n    left: calc(var(--switch-width) - var(--switch-thumb) - 3px);\n  }\n  & .ant-switch-checked {\n    background: var(--primary) !important;\n  }\n  & .ant-switch-checked .ant-switch-handle::before {\n    background: var(--primary-foreground);\n  }\n}\n\n@media (pointer: coarse) {\n  html.bit-optimized-ui .bit-theme-button {\n    width: 44px;\n    height: 44px;\n    top: 14px;\n    right: 14px;\n  }\n}\n";
	//#endregion
	//#region src/styles/login.css?raw
	var login_default = "html.bit-optimized-ui {\n  & #contentContainer .ant-tabs-nav::before {\n    border-color: var(--border) !important;\n  }\n  & #contentContainer .ant-tabs-tab-active .ant-tabs-tab-btn {\n    color: var(--foreground) !important;\n  }\n  & .ant-tabs {\n    overflow: visible !important;\n  }\n  & .ant-tabs-content {\n    margin: 0 !important;\n    display: block !important;\n    transform: none !important;\n    transition: none !important;\n    min-height: 216px;\n  }\n  & .ant-tabs-content:has(.ant-tabs-tabpane-active .scanBox) {\n    min-height: 0;\n  }\n  & .ant-tabs-nav {\n    min-height: 40px;\n    margin-bottom: 16px !important;\n  }\n  & .ant-tabs-nav-wrap {\n    overflow: visible !important;\n  }\n  & .ant-tabs-nav-wrap::before,\n  & .ant-tabs-nav-wrap::after,\n  & .ant-tabs-nav-operations,\n  & .ant-tabs-ink-bar {\n    display: none !important;\n  }\n  & .ant-tabs-nav-list {\n    width: 100%;\n    transform: none !important;\n    display: flex;\n    flex-wrap: wrap;\n    justify-content: space-between;\n    gap: 4px 8px;\n  }\n  & #contentContainer .ant-tabs-tab {\n    color: var(--muted-foreground);\n    font-size: 13px !important;\n    font-weight: normal !important;\n    margin: 0 !important;\n    padding: 10px 0 0;\n    border-bottom: 2px solid transparent;\n  }\n  & #contentContainer .ant-tabs-tab-active {\n    border-bottom-color: var(--foreground);\n  }\n  & .auth-tab-title-text {\n    font-size: inherit !important;\n  }\n  & .ant-tabs-tab-btn {\n    font-size: inherit !important;\n    font-weight: 400 !important;\n    line-height: 20px !important;\n  }\n  & .ant-tabs-tabpane {\n    transition: none !important;\n  }\n  & .ant-tabs-tabpane:not(.ant-tabs-tabpane-active) {\n    display: none !important;\n  }\n  & :is(#normalLoginForm, #smsLoginForm, #mailLoginForm, #webauthnLoginForm) {\n    display: flex;\n    flex-direction: column;\n    gap: var(--field-gap);\n  }\n  & .login-normal-item {\n    height: auto !important;\n    min-height: 0;\n    margin: 0 !important;\n    padding-block: 0 !important;\n  }\n  & .login-normal-button {\n    order: 2;\n    margin: 4px 0 0 !important;\n  }\n  & .ant-tabs-content-holder {\n    position: relative;\n    min-height: 216px;\n  }\n  & .ant-tabs-tabpane-active .scanBox {\n    margin-top: 0;\n  }\n  & .ant-tabs-content-holder:has(.scanBox) .ant-tabs-tabpane-active:has(.scanBox) {\n    transform: translateY(-8px);\n  }\n  & #contentContainer .ant-tabs-content-holder .topFunctionColor {\n    position: static !important;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 8px;\n    margin: 8px 0 0 !important;\n    min-height: 20px;\n    height: auto;\n    border: 0;\n    background: transparent;\n    padding: 0;\n  }\n  & #contentContainer .ant-tabs-tabpane-active form > .topFunctionColor {\n    order: 1;\n    justify-content: flex-start;\n    margin: 0 !important;\n  }\n  & #contentContainer .item-input-group:has(app-sms-code) {\n    padding-right: 5px;\n  }\n  & #contentContainer .item-input-group:has(app-sms-code) .ant-input-suffix {\n    align-items: center;\n    margin-left: 8px;\n  }\n  & #contentContainer app-sms-code,\n  & #contentContainer app-sms-code .input-decorator-icon {\n    display: flex;\n    align-items: center;\n    height: 28px;\n    margin: 0;\n    line-height: 1;\n  }\n  & #contentContainer app-sms-code :is(.font-class-text-button, .wait-send-again-text) {\n    display: inline-flex;\n    align-items: center;\n    justify-content: center;\n    height: auto;\n    padding: 2px 8px;\n    line-height: 18px;\n    box-sizing: border-box;\n    border: 1px solid var(--border);\n    border-radius: calc(var(--radius) - 4px);\n    background: var(--muted);\n    color: var(--foreground) !important;\n    font-size: 12px;\n    text-decoration: none !important;\n    white-space: nowrap;\n    transition:\n      background-color 150ms,\n      color 150ms,\n      border-color 150ms;\n  }\n  & #contentContainer app-sms-code .wait-send-again-text {\n    color: var(--muted-foreground) !important;\n    font-size: 12px !important;\n    font-weight: 400 !important;\n    font-variant-numeric: tabular-nums;\n    cursor: default;\n  }\n  & #smsLoginForm .login-normal-action {\n    position: static;\n    order: 3;\n    width: 100%;\n    margin: 0 !important;\n    line-height: 20px;\n  }\n  & #smsLoginForm .login-normal-describe {\n    display: flex;\n    flex-wrap: wrap;\n    justify-content: flex-end;\n    gap: 4px 8px;\n  }\n  & #smsLoginForm .tips {\n    flex: 1 1 100%;\n    white-space: normal;\n    overflow-wrap: anywhere;\n  }\n  & #smsLoginForm .tips :is(label, span) {\n    color: var(--muted-foreground) !important;\n    font-size: 12px !important;\n    font-weight: 400 !important;\n    line-height: 20px;\n  }\n  & #smsLoginForm .verification-code-error-color {\n    font-size: 12px !important;\n    font-weight: 400 !important;\n  }\n  & #contentContainer app-sms-code .font-class-text-button:hover {\n    text-decoration: none !important;\n    background: color-mix(in oklch, var(--foreground) 12%, var(--card));\n  }\n  & #contentContainer .item-input-group {\n    min-height: var(--control-height);\n    height: var(--control-height) !important;\n    box-sizing: border-box;\n    padding: 3px 12px;\n    align-items: center;\n    border: 1px solid var(--input) !important;\n    border-radius: calc(var(--radius) - 2px) !important;\n    background: var(--field-background) !important;\n    box-shadow: var(--field-shadow);\n  }\n  & #contentContainer .item-input-group:focus-within {\n    border-color: var(--muted-foreground) !important;\n    box-shadow: var(--field-focus-shadow);\n  }\n  & #contentContainer .login-button:hover {\n    background: color-mix(in oklch, var(--primary) 90%, transparent) !important;\n  }\n  & .bit-bottom-links {\n    position: absolute;\n    bottom: 8px;\n    left: 64px;\n    right: 64px;\n    z-index: 1;\n    min-height: 32px;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 4px 8px;\n    font-size: 12px;\n    line-height: 1.5;\n    text-align: center;\n  }\n  & .bit-bottom-links .login-panel-box {\n    position: static !important;\n    width: auto !important;\n    margin: 0 !important;\n    padding: 0 !important;\n    display: flex;\n    flex-wrap: wrap;\n    align-items: center;\n    justify-content: center;\n    gap: 4px 8px;\n  }\n  & #contentContainer :is(.bit-bottom-links, .bit-login-footer) :is(a, span, button) {\n    font-size: 12px !important;\n    font-weight: 400;\n  }\n  & :is(.bit-bottom-links, .bit-login-footer) > [hidden] {\n    display: none !important;\n  }\n  & .bit-login-options {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    flex-wrap: wrap;\n    gap: 8px 12px;\n    order: 1;\n    min-width: 0;\n  }\n  & .ant-tabs-content-holder:has(.ant-tabs-tabpane-active .scanBox) > .bit-login-options {\n    justify-content: center;\n  }\n  & .bit-login-footer:not(:has(> :not([hidden]))) {\n    display: none;\n  }\n  & #contentContainer .bit-login-options > .topFunctionColor {\n    margin: 0 !important;\n    flex: 0 0 auto;\n  }\n  & .bit-login-footer {\n    display: flex;\n    align-items: center;\n    justify-content: flex-end;\n    flex-wrap: wrap;\n    gap: 4px 12px;\n    flex: 1;\n    min-width: 0;\n    font-size: 12px;\n    line-height: 1.5;\n    text-align: right;\n  }\n  & .bit-login-footer :is(.login-panel-box, .last-action, .passkey-use) {\n    position: static !important;\n    width: auto !important;\n    margin: 0 !important;\n    padding: 0 !important;\n    overflow-wrap: anywhere;\n  }\n  & .bit-login-footer .ant-btn-link {\n    height: auto;\n    padding: 0;\n    border: 0;\n  }\n  /* Ant buttons wrap their text in an inline-block, which blocks decoration propagation. */\n  & .bit-login-footer .ant-btn-link > span {\n    text-decoration: inherit;\n  }\n  & #contentContainer .eyes-icon {\n    position: absolute !important;\n    right: 6px !important;\n    top: 50% !important;\n    transform: translateY(-50%);\n    width: 20px;\n    height: 20px;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    cursor: pointer;\n  }\n  & #contentContainer .eyes-icon :is(i, svg) {\n    color: var(--muted-foreground) !important;\n    display: block;\n    line-height: 1;\n  }\n  & #contentContainer .eyes-icon:hover :is(i, svg) {\n    color: var(--foreground) !important;\n  }\n  & #contentContainer .passwordInput input.ant-input {\n    padding-right: 28px !important;\n  }\n  & .login-notice-list {\n    flex-wrap: nowrap !important;\n    white-space: nowrap;\n    margin: 0 !important;\n    padding: 0 !important;\n  }\n  & #contentContainer .ant-input-prefix {\n    flex: 0 0 14px;\n    width: 14px;\n    margin-right: 8px;\n  }\n  & #contentContainer .ant-input-prefix ion-icon {\n    width: 14px;\n    height: 14px;\n    font-size: 14px;\n  }\n  & #contentContainer .ant-input {\n    font: var(--login-input-font) !important;\n    background: transparent !important;\n    height: 28px !important;\n    line-height: 28px !important;\n    padding: 0 !important;\n    min-width: 0;\n    color: var(--foreground) !important;\n    caret-color: var(--foreground);\n    box-shadow: none !important;\n  }\n  & #contentContainer .ant-input:is(:autofill, :-webkit-autofill) {\n    -webkit-text-fill-color: var(--foreground) !important;\n    caret-color: var(--foreground);\n  }\n  & #contentContainer .ant-input::placeholder {\n    color: var(--muted-foreground) !important;\n  }\n  & #contentContainer .login-button {\n    height: var(--control-height);\n    border-radius: calc(var(--radius) - 2px) !important;\n    background: var(--primary) !important;\n    border: 0 !important;\n    color: var(--primary-foreground) !important;\n    font-size: 14px;\n    font-weight: 500;\n    box-shadow: none !important;\n  }\n  & #contentContainer .login-button ion-icon {\n    color: var(--primary-foreground) !important;\n  }\n  & #contentContainer .login-button.disabled,\n  & #contentContainer .login-button:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n  }\n  & #contentContainer rg-copyright {\n    position: static !important;\n    order: 2;\n    width: auto;\n    max-width: 100%;\n  }\n  & #contentContainer .phone-copyright {\n    position: static !important;\n    color: var(--muted-foreground) !important;\n    text-align: center;\n    line-height: 1.8;\n    padding: 0 !important;\n  }\n  & #contentContainer :is(a, .forgetPassword, .light-app) {\n    color: var(--muted-foreground) !important;\n    text-decoration: none !important;\n    text-underline-offset: 4px;\n    transition: color 150ms;\n    cursor: pointer;\n  }\n  & #contentContainer :is(a, .forgetPassword, .light-app):hover {\n    color: var(--foreground) !important;\n    text-decoration: underline !important;\n  }\n  & #contentContainer :is(button, a, .ant-tabs-tab-btn):focus-visible {\n    outline: 2px solid var(--foreground);\n    outline-offset: 3px;\n  }\n  @media (pointer: coarse) {\n    & #contentContainer .topFunctionColor {\n      min-height: 44px;\n    }\n    & #contentContainer .eyes-icon {\n      width: 40px;\n      height: 40px;\n    }\n    & #contentContainer .passwordInput input.ant-input {\n      padding-right: 40px !important;\n    }\n    & #contentContainer .ant-tabs-tab {\n      min-height: 44px;\n      box-sizing: border-box;\n    }\n  }\n  @media (max-height: 600px) {\n    & #contentContainer {\n      justify-content: flex-start;\n    }\n  }\n  @media (prefers-reduced-motion: reduce) {\n    & .login-content-left {\n      transition: none;\n    }\n  }\n  @media (max-width: 480px) {\n    & #contentContainer {\n      padding: max(24px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))\n        max(24px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));\n      justify-content: flex-start;\n    }\n    & #login-content-right {\n      padding: 20px 20px 64px !important;\n    }\n    & .ant-tabs-nav-list {\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n    }\n    & #contentContainer .ant-tabs-tab {\n      justify-content: center;\n    }\n    & #contentContainer .phone-copyright {\n      white-space: normal;\n      font-size: 11px;\n    }\n  }\n}\n";
	//#endregion
	//#region src/styles/settings.css?raw
	var settings_default = ":host([data-modern]) #sso-tip {\n  margin-bottom: 0;\n}\n:host([data-modern]) .sso-info:not(.error):not(.success) {\n  background: var(--card);\n  border-color: var(--input);\n  color: var(--foreground);\n  border-radius: 8px;\n}\n:host([data-modern]) .sso-info {\n  height: var(--control-height);\n  border-radius: calc(var(--radius) - 2px);\n}\n:host([data-modern]) .sso-info.clickable:hover {\n  background: var(--muted);\n}\n:host([data-modern]) .sso-title {\n  color: var(--foreground);\n}\n:host([data-modern]) :is(.sso-label, .sso-checkbox-text) {\n  color: var(--muted-foreground);\n}\n:host([data-modern]) .sso-checkbox-text {\n  font: var(--switch-label-font);\n}\n:host([data-modern]) .sso-btn-primary {\n  background: var(--primary);\n  color: var(--primary-foreground);\n  border-radius: calc(var(--radius) - 2px);\n  font-weight: 500;\n}\n:host([data-modern]) .sso-btn-primary:hover {\n  background: color-mix(in oklch, var(--primary) 90%, transparent);\n}\n:host([data-modern]) #sso-tip .sso-settings {\n  display: none;\n}\n@keyframes sso-reveal {\n  from {\n    clip-path: inset(calc(100% - 32px) 0 0 calc(100% - 48px) round 6px);\n  }\n  to {\n    clip-path: inset(0 round 4px);\n  }\n}\n:host(.inline-settings) .sso-overlay {\n  position: absolute;\n  background: var(--muted);\n  border-radius: 4px;\n  animation: sso-reveal 200ms ease both;\n  display: block;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n}\n@keyframes sso-conceal {\n  from {\n    clip-path: inset(0 round 4px);\n  }\n  to {\n    clip-path: inset(calc(100% - 32px) 0 0 calc(100% - 48px) round 6px);\n  }\n}\n:host(.inline-settings) .sso-overlay.closing {\n  animation: sso-conceal 200ms ease forwards;\n}\n:host(.inline-settings) .sso-overlay.closing .sso-dialog {\n  animation: none;\n}\n:host(.inline-settings) .sso-dialog {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  grid-template-rows: repeat(5, auto) minmax(32px, 1fr);\n  align-content: start;\n  gap: var(--field-gap);\n  width: 100%;\n  min-height: 100%;\n  max-width: none;\n  --settings-padding: 24px;\n  padding: 24px var(--settings-padding) var(--footer-gap);\n  max-height: none;\n  overflow: visible;\n  background: var(--muted);\n  border: 0;\n  border-radius: 0;\n  box-shadow: none;\n  animation: none;\n}\n:host(.inline-settings) .sso-title {\n  text-align: left;\n  font-size: 16px;\n  line-height: 1.5;\n}\n:host(.inline-settings) .sso-heading {\n  grid-column: 1 / -1;\n  margin-bottom: 8px;\n}\n:host(.inline-settings) .sso-heading .sso-modern-toggle {\n  flex-wrap: nowrap;\n  flex: 0 0 auto;\n  gap: 6px;\n}\n:host(.inline-settings) .sso-heading .sso-checkbox-text {\n  font-size: 12px;\n}\n:host(.inline-settings) .sso-field {\n  grid-column: 1 / -1;\n  position: relative;\n  min-width: 0;\n  margin: 0;\n}\n:host(.inline-settings) .sso-label {\n  position: absolute;\n  clip-path: inset(100%);\n}\n.sso-field ion-icon {\n  display: none;\n}\n:host(.inline-settings) .sso-field ion-icon {\n  display: block;\n  position: absolute;\n  left: 13px;\n  top: 50%;\n  transform: translateY(-50%);\n  width: 14px;\n  height: 14px;\n  color: var(--foreground);\n  pointer-events: none;\n}\n:host(.inline-settings) .sso-input {\n  color: var(--foreground);\n  font: var(--login-input-font);\n  height: var(--control-height);\n  padding: 3px 12px 3px 34px;\n  border-radius: calc(var(--radius) - 2px);\n  background: var(--field-background);\n  border-color: var(--input);\n  box-shadow: var(--field-shadow);\n}\n:host([data-modern]) .sso-input:is(:autofill, :-webkit-autofill) {\n  -webkit-text-fill-color: var(--foreground) !important;\n  caret-color: var(--foreground);\n}\n:host(.inline-settings) .sso-input::placeholder {\n  color: var(--muted-foreground);\n  opacity: 1;\n}\n:host(.inline-settings) .sso-input:focus {\n  outline: none;\n  border-color: var(--muted-foreground);\n  box-shadow: var(--field-focus-shadow);\n}\n:host(.inline-settings) .sso-checkbox-label {\n  flex-wrap: wrap;\n  min-width: 0;\n  min-height: var(--footer-height);\n  margin: 0;\n}\n:host(.inline-settings) .sso-actions {\n  grid-column: 1 / -1;\n  display: grid;\n  grid-template-columns: 1fr;\n  margin-top: 4px;\n}\n:host(.inline-settings) .sso-btn {\n  min-height: var(--control-height);\n}\n:host(.inline-settings) .sso-footnote {\n  grid-column: 1 / -1;\n  min-height: var(--footer-height);\n  margin: 12px calc(-1 * var(--settings-padding)) 0;\n  grid-template-columns: var(--footer-width) minmax(0, 1fr) var(--footer-width);\n  gap: 0;\n  align-self: end;\n}\n:host(.inline-settings) .sso-footnote .sso-btn-reset {\n  min-height: var(--footer-height);\n  width: var(--footer-width);\n  transform: translateX(var(--footer-gap));\n  justify-self: stretch;\n  text-align: center;\n}\n:host(.inline-settings) a {\n  color: var(--muted-foreground);\n  text-decoration: none;\n  text-underline-offset: 4px;\n}\n:host(.inline-settings) a:hover {\n  color: var(--foreground);\n  text-decoration: underline;\n}\n:host .sso-footnote .sso-btn-reset {\n  height: auto;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: #ef4444;\n  font-size: 12px;\n}\n.sso-footnote .sso-btn-reset:hover {\n  text-decoration: underline;\n  text-underline-offset: 4px;\n}\n@media (prefers-reduced-motion: reduce) {\n  :host(.inline-settings) .sso-overlay {\n    animation-duration: 1ms;\n  }\n}\n\n@media (max-width: 480px) {\n  :host(.inline-settings) .sso-title {\n    font-size: 14px;\n  }\n  :host(.inline-settings) .sso-dialog {\n    --settings-padding: 16px;\n  }\n  :host(.inline-settings) .sso-footnote {\n    font-size: 10px;\n  }\n}\n";
	//#endregion
	//#region src/styles/helper.css?raw
	var helper_default = "/* Shadow roots also need explicit form-control font inheritance. */\n:host {\n  font-family: var(--font-ui);\n  font-size: 14px;\n  line-height: 1.5;\n}\nbutton,\ninput {\n  font-family: inherit;\n}\nbutton:focus-visible,\na:focus-visible {\n  outline: 2px solid var(--foreground, #333);\n  outline-offset: 3px;\n}\n@keyframes sso-spin {\n  from {\n    transform: rotate(0deg);\n  }\n  to {\n    transform: rotate(360deg);\n  }\n}\n@keyframes sso-fade-in {\n  from {\n    opacity: 0;\n  }\n  to {\n    opacity: 1;\n  }\n}\n@keyframes sso-fade-out {\n  from {\n    opacity: 1;\n  }\n  to {\n    opacity: 0;\n  }\n}\n@keyframes sso-scale-in {\n  from {\n    opacity: 0;\n    transform: scale(0.9);\n  }\n  to {\n    opacity: 1;\n    transform: scale(1);\n  }\n}\n@keyframes sso-scale-out {\n  from {\n    opacity: 1;\n    transform: scale(1);\n  }\n  to {\n    opacity: 0;\n    transform: scale(0.9);\n  }\n}\n\n#sso-tip {\n  display: flex;\n  width: 100%;\n  gap: 10px;\n  margin-bottom: 32px;\n  font-size: 14px;\n  line-height: 1.5;\n  font-family: inherit;\n  user-select: none;\n}\n.sso-info,\n.sso-settings {\n  box-sizing: border-box;\n  height: 36px;\n  font: inherit;\n  padding: 0 15px;\n  border-radius: 4px;\n  background: #fff;\n  border: 1px solid #fff;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: #000;\n  transition: background 0.2s ease;\n}\n.sso-info {\n  flex: 1;\n  gap: 8px;\n}\n.sso-info.clickable,\n.sso-settings {\n  cursor: pointer;\n}\n.sso-info.clickable:hover,\n.sso-settings:hover {\n  background: rgba(255, 255, 255, 0.9);\n}\n.sso-info.success {\n  --status-color: rgba(76, 175, 80, 0.9);\n}\n.sso-info.error {\n  --status-color: rgba(255, 77, 79, 0.9);\n}\n.sso-info.success,\n.sso-info.error {\n  background: var(--status-color);\n  border-color: var(--status-color);\n  color: #fff;\n}\n.sso-info.disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.sso-spinner {\n  width: 14px;\n  height: 14px;\n  animation: sso-spin 1s linear infinite;\n}\n.sso-info:not(.loading) :is(.sso-spinner, .sso-cancel) {\n  display: none;\n}\n.sso-cancel {\n  margin-left: auto;\n  opacity: 0.7;\n  font-size: 12px;\n}\n\n.sso-overlay {\n  position: fixed;\n  inset: 0;\n  background: rgba(0, 0, 0, 0.3);\n  z-index: 999999;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  animation: sso-fade-in 0.2s ease;\n}\n.sso-overlay.closing {\n  animation: sso-fade-out 0.15s ease forwards;\n}\n.sso-dialog {\n  background: #fff;\n  padding: 32px 32px 18px;\n  border-radius: 12px;\n  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);\n  width: 400px;\n  max-width: 90vw;\n  max-height: calc(100dvh - 32px);\n  overflow-y: auto;\n  box-sizing: border-box;\n  user-select: none;\n  animation: sso-scale-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);\n}\n.sso-overlay.closing .sso-dialog {\n  animation: sso-scale-out 0.15s ease forwards;\n}\n.sso-dialog:focus {\n  outline: none;\n}\n.sso-title {\n  margin: 0;\n  white-space: nowrap;\n  color: #333;\n  font-size: 20px;\n}\n.sso-field {\n  margin-bottom: 15px;\n}\n.sso-label {\n  display: block;\n  margin-bottom: 5px;\n  color: #666;\n  font-size: 14px;\n}\n.sso-input {\n  width: 100%;\n  padding: 10px;\n  border: 1px solid #ddd;\n  border-radius: 6px;\n  box-sizing: border-box;\n  font-size: 14px;\n}\n.sso-checkbox-label {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n  cursor: pointer;\n  margin-bottom: 20px;\n}\n.sso-checkbox {\n  margin: 0;\n  appearance: none;\n  position: relative;\n  flex: 0 0 var(--switch-width);\n  width: var(--switch-width) !important;\n  height: var(--switch-height) !important;\n  border: 1px solid transparent;\n  border-radius: 999px;\n  background: var(--input, #ddd);\n  transition: background 150ms;\n  cursor: pointer;\n}\n.sso-checkbox::before {\n  content: '';\n  position: absolute;\n  top: 1px;\n  left: 1px;\n  width: var(--switch-thumb);\n  height: var(--switch-thumb);\n  border-radius: 50%;\n  background: #fff;\n  transition: transform 150ms;\n}\n.sso-checkbox:checked {\n  background: var(--primary, #171717);\n}\n.sso-checkbox:checked::before {\n  transform: translateX(calc(var(--switch-width) - var(--switch-thumb) - 4px));\n  background: var(--primary-foreground, #fff);\n}\n.sso-checkbox:focus-visible {\n  outline: 2px solid var(--muted-foreground, #999);\n  outline-offset: 2px;\n}\n.sso-checkbox-text {\n  color: #666;\n  font-size: 14px;\n}\n.sso-actions {\n  display: flex;\n  gap: 10px;\n  justify-content: space-between;\n}\n.sso-btn {\n  padding: 6px 18px;\n  border-radius: 6px;\n  cursor: pointer;\n  font-size: 14px;\n  transition: background 0.2s ease;\n}\n.sso-btn-primary {\n  border: none;\n  background: #2196f3;\n  color: #fff;\n}\n.sso-btn-primary:hover {\n  background: #1976d2;\n}\n.sso-btn-primary:active {\n  background: #1565c0;\n}\n.sso-footnote {\n  color: #999;\n  font-size: 12px;\n  display: grid;\n  grid-template-columns: 40px minmax(0, 1fr) 40px;\n  align-items: center;\n  gap: 4px;\n  margin-top: 24px;\n  line-height: 1.4;\n}\n\n@media (max-width: 480px), (pointer: coarse) {\n  #sso-tip :is(.sso-info, .sso-settings) {\n    min-height: 44px;\n  }\n  .sso-input {\n    font-size: 16px;\n    min-height: 44px;\n  }\n  .sso-btn,\n  .sso-checkbox-label {\n    min-height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .sso-overlay,\n  .sso-overlay.closing,\n  .sso-dialog,\n  .sso-overlay.closing .sso-dialog {\n    animation-duration: 1ms;\n  }\n}\n\n.sso-heading {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 20px;\n}\n.sso-heading .sso-modern-toggle {\n  margin: 0;\n  flex-shrink: 0;\n}\n.sso-heading .sso-checkbox-text {\n  font-size: 12px;\n}\n\n.sso-footnote .sso-btn-reset {\n  justify-self: start;\n}\n.sso-credit {\n  grid-column: 2;\n  min-width: 0;\n  text-align: center;\n  text-wrap: balance;\n}\n";
	//#endregion
	//#region src/styles/index.js
	var themeStyles = [
		shared_default,
		tokens_default,
		page_default,
		controls_default,
		login_default,
		"html.bit-optimized-ui {\n  & .cdk-overlay-pane:has(rg-captcha-code-web-dialog) {\n    width: 350px !important;\n    max-width: calc(100vw - 32px) !important;\n  }\n  & .mat-dialog-container:has(rg-captcha-code-web-dialog) {\n    padding: 24px;\n    max-height: calc(100dvh - 32px);\n    border: 1px solid var(--border);\n    border-radius: 12px;\n    background: var(--card);\n    color: var(--foreground);\n    box-shadow: 0 16px 48px #0003;\n    font-family: var(--font-ui);\n  }\n  & rg-captcha-code-web-dialog {\n    display: block;\n    font: 400 14px/1.5 var(--font-ui);\n    & .dialog-title {\n      margin: 0 0 20px;\n      color: var(--foreground);\n      font: 600 18px/1.5 var(--font-ui);\n    }\n    & .mat-dialog-content {\n      margin: 0;\n      padding: 0;\n      max-height: none;\n      overflow: visible;\n    }\n    & .captcha-row {\n      margin: 0;\n      gap: 12px;\n    }\n    & .captcha-refresh a {\n      color: var(--muted-foreground) !important;\n      font: inherit !important;\n      text-underline-offset: 4px;\n    }\n    & .captcha-refresh a:hover {\n      color: var(--foreground) !important;\n      text-decoration: underline;\n    }\n    & .captcha-input {\n      height: var(--control-height) !important;\n      padding: 0 12px !important;\n      border: 1px solid var(--input) !important;\n      border-radius: 8px !important;\n      background: var(--field-background) !important;\n      color: var(--foreground) !important;\n      font: var(--login-input-font) !important;\n      box-shadow: var(--field-shadow);\n    }\n    & .captcha-input::placeholder {\n      color: var(--muted-foreground);\n      opacity: 1;\n    }\n    & .captcha-input:focus {\n      border-color: var(--muted-foreground) !important;\n      box-shadow: var(--field-focus-shadow);\n    }\n    & .dialog-actions {\n      gap: 8px;\n      padding: 0;\n      margin: 20px 0 0;\n      min-height: 0;\n    }\n    & .dialog-actions .btn {\n      margin: 0 !important;\n      height: var(--control-height) !important;\n      border: 1px solid var(--input) !important;\n      border-radius: 8px !important;\n      background: transparent !important;\n      color: var(--foreground) !important;\n      font: 500 14px/1.5 var(--font-ui) !important;\n    }\n    & .dialog-actions .btn:hover {\n      background: var(--muted) !important;\n    }\n    & .dialog-actions .btn-confirm {\n      border: 0 !important;\n      background: var(--primary) !important;\n      color: var(--primary-foreground) !important;\n    }\n    & .dialog-actions .btn-confirm:hover {\n      background: color-mix(in oklch, var(--primary) 90%, transparent) !important;\n    }\n    & :is(button, a):focus-visible {\n      outline: 2px solid var(--foreground);\n      outline-offset: 3px;\n    }\n  }\n}\n"
	].join("\n");
	var helperStyles = [
		shared_default,
		settings_default,
		helper_default
	].join("\n");
	//#endregion
	//#region src/theme.js
	function createElement(tag, className, html = "") {
		const element = document.createElement(tag);
		element.className = className;
		element.innerHTML = html;
		if (tag === "button") element.type = "button";
		return element;
	}
	var cleanup;
	function setOptimizedUI(enabled) {
		const active = enabled && !!loginRoute(location.href);
		document.documentElement.classList.toggle("bit-optimized-ui", active);
		if (!active) {
			cleanup?.();
			cleanup = void 0;
			return;
		}
		if (cleanup) return;
		const style = document.createElement("style");
		style.id = "bit-optimized-ui";
		style.textContent = themeStyles;
		document.head.append(style);
		const media = document.defaultView.matchMedia("(prefers-color-scheme: dark)");
		const storage = document.defaultView.sessionStorage;
		let mode = storage.getItem("bit-autologin-theme");
		const themeButton = createElement("button", "bit-theme-button");
		themeButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 3l0 18"/><path d="M12 9l4.65 -4.65"/><path d="M12 14.3l7.37 -7.37"/><path d="M12 19.6l8.85 -8.85"/>
  </svg>`;
		function applyMode() {
			const resolved = mode || (media.matches ? "dark" : "light");
			document.documentElement.dataset.bitTheme = resolved;
			themeButton.ariaLabel = resolved === "dark" ? "切换浅色模式" : "切换深色模式";
			themeButton.title = themeButton.ariaLabel;
		}
		themeButton.onclick = () => {
			mode = document.documentElement.dataset.bitTheme === "dark" ? "light" : "dark";
			storage.setItem("bit-autologin-theme", mode);
			applyMode();
		};
		const preventNativeResizeReload = (event) => event.stopImmediatePropagation();
		document.addEventListener("pl_event", preventNativeResizeReload, true);
		media.addEventListener("change", applyMode);
		applyMode();
		const noticeButton = createElement("button", "bit-notice-button");
		setPanelButton(noticeButton, "公告");
		let noticeCloseTimer;
		noticeButton.onclick = () => {
			const card = noticeButton.closest(".login-content");
			document.dispatchEvent(new document.defaultView.Event("bit-close-settings"));
			clearTimeout(noticeCloseTimer);
			const expanded = card.classList.toggle("bit-notice-open");
			card.classList.toggle("bit-notice-closing", !expanded);
			if (!expanded) noticeCloseTimer = setTimeout(() => card.classList.remove("bit-notice-closing"), 220);
			if (expanded !== !!card.querySelector(".login-content-left:not(.notice-hide)")) card.querySelector(".newNotice, .newHideNotice")?.click();
			sync();
		};
		const settingsButton = createElement("button", "bit-settings-button");
		setPanelButton(settingsButton, "设置");
		settingsButton.onclick = () => document.dispatchEvent(new document.defaultView.Event("bit-toggle-settings"));
		const settingsPreview = createElement("div", "bit-settings-preview");
		settingsPreview.setAttribute("aria-hidden", "true");
		function toggleRemember(event) {
			const wrapper = event.target.closest(".topFunctionColor");
			if (wrapper && !event.target.closest("button")) wrapper.querySelector("button")?.click();
		}
		document.addEventListener("click", toggleRemember);
		const brand = createElement("div", "bit-login-brand", "<div class=\"bit-brand-emblem\"></div><span class=\"bit-brand-name\">数智北理</span><span class=\"bit-brand-subtitle\">| 统一身份认证</span>");
		const emblem = brand.firstElementChild;
		const header = createElement("div", "bit-login-header", "<h1>统一身份认证</h1><div id=\"bit-login-actions\"></div><div class=\"bit-login-separator\" role=\"separator\">Or</div>");
		const footer = createElement("div", "bit-login-footer");
		const bottomLinks = createElement("div", "bit-bottom-links");
		const actionRow = createElement("div", "bit-login-options");
		actionRow.append(footer);
		const cardActions = [
			bottomLinks,
			settingsButton,
			settingsPreview,
			noticeButton,
			themeButton
		];
		const tabLabels = {
			用户名密码: "密码登录",
			用户密码: "密码登录",
			短信验证码: "短信验证",
			手机验证码: "短信验证",
			通行密钥认证: "通行密钥",
			邮件验证码: "邮件验证",
			邮箱验证码: "邮件验证",
			i北理扫码: "扫码登录"
		};
		const renamedTabs = /* @__PURE__ */ new Map();
		const moved = /* @__PURE__ */ new Map();
		let remember;
		let rememberMarker;
		let logo;
		let logoMarker;
		function sync() {
			const card = document.querySelector(".login-content");
			if (!card) return;
			for (const label of card.querySelectorAll(".auth-tab-title-text")) {
				const replacement = tabLabels[label.textContent];
				if (!replacement) continue;
				renamedTabs.set(label, label.textContent);
				label.textContent = replacement;
			}
			for (const element of cardActions) if (element.parentNode !== card) card.append(element);
			for (const element of card.querySelectorAll(".last-action, .passkey-use, .login-panel-box")) {
				if (moved.has(element)) continue;
				const marker = document.createComment("login-footer");
				element.before(marker);
				moved.set(element, marker);
				(element.matches(".login-panel-box") ? bottomLinks : footer).append(element);
			}
			for (const [element, marker] of moved) {
				if (!marker.isConnected) {
					element.hidden = true;
					continue;
				}
				const pane = marker.parentElement.closest(".ant-tabs-tabpane");
				element.hidden = !!pane && !pane.classList.contains("ant-tabs-tabpane-active");
			}
			noticeButton.hidden = !document.querySelector(".newNotice, .newHideNotice");
			const expanded = card.classList.contains("bit-notice-open");
			setPanelButton(noticeButton, "公告", expanded);
			const title = card.querySelector("#login-content-right-inner");
			if (title && header.parentNode !== title) title.prepend(header);
			if (brand.parentNode !== card.parentNode) card.before(brand);
			if (!remember) {
				remember = card.querySelector(".topFunctionColor");
				if (remember) {
					rememberMarker = document.createComment("remember-position");
					remember.before(rememberMarker);
				}
			}
			const holder = card.querySelector(".ant-tabs-content-holder");
			const activeForm = holder?.querySelector(".ant-tabs-tabpane-active :is(#normalLoginForm, #smsLoginForm, #mailLoginForm, #webauthnLoginForm)");
			const submitRow = activeForm?.querySelector(".login-normal-button");
			const rememberParent = submitRow?.parentNode === activeForm ? activeForm : holder;
			if (rememberParent && actionRow.parentNode !== rememberParent) {
				if (rememberParent === activeForm) submitRow.before(actionRow);
				else rememberParent.append(actionRow);
			}
			if (remember && remember.parentNode !== actionRow) actionRow.prepend(remember);
			if (!logo) {
				logo = document.querySelector(".login-title-img");
				if (logo) {
					logoMarker = document.createComment("logo-position");
					logo.before(logoMarker);
				}
			}
			if (logo && logo.parentNode !== emblem) emblem.append(logo);
		}
		const observer = new MutationObserver(sync);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class"]
		});
		sync();
		cleanup = () => {
			observer.disconnect();
			clearTimeout(noticeCloseTimer);
			document.removeEventListener("pl_event", preventNativeResizeReload, true);
			for (const [label, original] of renamedTabs) label.textContent = original;
			document.removeEventListener("click", toggleRemember);
			media.removeEventListener("change", applyMode);
			if (logo) logoMarker.replaceWith(logo);
			if (remember) rememberMarker.replaceWith(remember);
			for (const [element, marker] of moved) {
				element.hidden = false;
				marker.replaceWith(element);
			}
			noticeButton.closest(".login-content")?.classList.remove("bit-notice-open", "bit-notice-closing");
			for (const element of [
				...cardActions,
				actionRow,
				brand,
				header,
				style
			]) element.remove();
			delete document.documentElement.dataset.bitTheme;
		};
	}
	//#endregion
	//#region src/ui.js
	var STORAGE_KEY = "bit-autologin-settings";
	var store = {
		get: () => GM_getValue(STORAGE_KEY, {
			username: "",
			password: "",
			auto: false,
			optimizedUI: true
		}),
		set(config) {
			GM_setValue(STORAGE_KEY, config);
			setOptimizedUI(config.optimizedUI);
		}
	};
	var SPINNER = `<svg class="sso-spinner" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M512 36a476 476 0 0 1 476 476" fill="none" stroke="currentColor" stroke-width="72" stroke-linecap="round"/>
</svg>`;
	function createUI(onLogin, onCancel) {
		const host = document.createElement("div");
		host.id = "bit-sso-helper";
		const root = host.attachShadow({ mode: "closed" });
		const style = document.createElement("style");
		style.textContent = helperStyles;
		root.append(style);
		const bar = document.createElement("div");
		bar.id = "sso-tip";
		bar.innerHTML = `
    <div class="sso-info" aria-live="polite">
      ${SPINNER}<span class="sso-message"></span><span class="sso-cancel">点击取消</span>
    </div>
    <button type="button" class="sso-settings" aria-label="设置" title="设置">设置</button>`;
		root.append(bar);
		const info = bar.querySelector(".sso-info");
		const messageText = bar.querySelector(".sso-message");
		let observer;
		let cleanupCaptcha;
		let tipTimer;
		let resetTimer;
		let dialogHost;
		let closingLayer;
		let finishClosing;
		let restoreFocus;
		let lastStatus = {
			state: "",
			message: ""
		};
		function show(state = "", message = "", timeout) {
			clearTimeout(tipTimer);
			lastStatus = {
				state,
				message
			};
			const config = store.get();
			const ready = config.username && config.password || config.optimizedUI;
			info.className = `sso-info ${state || (ready ? "clickable" : "disabled")}`;
			info.classList.toggle("clickable", state === "loading" || !state && !!ready);
			messageText.textContent = message || (ready ? "一键登录" : "请先设置登录信息→");
			info.onclick = state === "loading" ? onCancel : !state && ready ? onLogin : null;
			if (timeout) tipTimer = setTimeout(() => show(), timeout);
		}
		function placeBar() {
			host.toggleAttribute("data-modern", document.documentElement.classList.contains("bit-optimized-ui"));
			const panel = document.querySelector("#bit-login-actions") || document.querySelector(".moreloginbtnBox") || document.querySelector("#normalLoginForm, #login-content-right-inner");
			if (panel && !panel.contains(host)) {
				host.style.cssText = "display:block;width:100%";
				panel.prepend(host);
			} else if (!panel && host.isConnected) host.remove();
		}
		const toggleSettings = () => dialogHost ? closeSettings() : openSettings();
		const dismissSettings = () => closeSettings(false);
		function mount() {
			cleanupCaptcha = mountCaptchaDialog(document);
			document.addEventListener("bit-toggle-settings", toggleSettings);
			document.addEventListener("bit-close-settings", dismissSettings);
			setOptimizedUI(store.get().optimizedUI);
			show();
			placeBar();
			observer = new document.defaultView.MutationObserver(placeBar);
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class"]
			});
		}
		function closeSettings(animate = true) {
			clearTimeout(resetTimer);
			finishClosing?.();
			if (!dialogHost) return;
			const closing = dialogHost;
			setPanelButton(document.querySelector(".bit-settings-button"), "设置");
			let closeTimer;
			const layer = closingLayer;
			const onAnimationEnd = (event) => {
				if (event.target === layer) remove();
			};
			const remove = () => {
				clearTimeout(closeTimer);
				layer.removeEventListener("animationend", onAnimationEnd);
				if (finishClosing === remove) finishClosing = void 0;
				if (!dialogHost || dialogHost === closing) closing.parentElement?.classList.remove("bit-settings-open");
				closing.remove();
			};
			closing.inert = true;
			if (animate) {
				layer.style.removeProperty("animation");
				layer.classList.add("closing");
				finishClosing = remove;
				closeTimer = setTimeout(remove, 250);
				layer.addEventListener("animationend", onAnimationEnd);
			} else remove();
			dialogHost = null;
			restoreFocus?.focus();
		}
		function openSettings() {
			closeSettings(false);
			document.querySelector(".bit-notice-button[aria-expanded=\"true\"]")?.click();
			dialogHost = document.createElement("div");
			dialogHost.id = "gm-sso-config";
			const dialogRoot = dialogHost.attachShadow({ mode: "closed" });
			dialogRoot.append(style.cloneNode(true));
			const overlay = document.createElement("div");
			overlay.className = "sso-overlay";
			closingLayer = overlay;
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
      </form>`;
			dialogRoot.append(overlay);
			function placeDialog() {
				dialogHost.parentElement?.classList.remove("bit-settings-open");
				const content = document.querySelector(".login-content .ant-tabs-content-holder");
				const card = document.documentElement.classList.contains("bit-optimized-ui") && content?.closest(".login-content");
				dialogHost.classList.toggle("inline-settings", !!card);
				dialogHost.toggleAttribute("data-modern", !!card);
				if (card) {
					const settingsButton = card.querySelector(".bit-settings-button");
					setPanelButton(settingsButton, "设置", true);
					card.classList.add("bit-settings-open");
					card.append(dialogHost);
					restoreFocus = settingsButton;
				} else {
					document.body.append(dialogHost);
					restoreFocus = bar.querySelector(".sso-settings");
				}
			}
			placeDialog();
			const form = overlay.querySelector("form");
			const { username, password, auto, optimizedUI } = form.elements;
			const config = store.get();
			username.value = config.username;
			password.value = config.password;
			auto.checked = config.auto;
			optimizedUI.checked = !!config.optimizedUI;
			optimizedUI.onchange = () => {
				overlay.style.animation = "none";
				form.style.animation = "none";
				store.set({
					...store.get(),
					optimizedUI: optimizedUI.checked
				});
				placeBar();
				placeDialog();
				optimizedUI.focus({ preventScroll: true });
			};
			overlay.onclick = (event) => {
				if (event.target === overlay) closeSettings();
			};
			const reset = form.querySelector("#gm-sso-reset");
			let confirmingReset = false;
			reset.onclick = () => {
				if (!confirmingReset) {
					confirmingReset = true;
					reset.textContent = "确认？";
					resetTimer = setTimeout(() => {
						confirmingReset = false;
						reset.textContent = "重置";
					}, 3e3);
					return;
				}
				onCancel();
				closeSettings(false);
				store.set({
					...store.get(),
					username: "",
					password: "",
					auto: false
				});
				show("error", "登录信息已重置", 1e3);
			};
			form.onsubmit = (event) => {
				event.preventDefault();
				const next = {
					username: username.value.trim(),
					password: password.value,
					auto: auto.checked,
					optimizedUI: optimizedUI.checked
				};
				onCancel();
				closeSettings(next.optimizedUI);
				store.set(next);
				show("success", "登录信息已保存", 1e3);
			};
			overlay.onkeydown = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					closeSettings();
				}
				if (event.key !== "Tab") return;
				const elements = [...overlay.querySelectorAll("button, input, a[href]")];
				const first = elements[0];
				const last = elements.at(-1);
				if (dialogRoot.activeElement === (event.shiftKey ? first : last) || event.shiftKey && dialogRoot.activeElement === form) {
					event.preventDefault();
					(event.shiftKey ? last : first).focus();
				}
			};
			form.focus({ preventScroll: true });
			return dialogRoot;
		}
		bar.querySelector(".sso-settings").onclick = toggleSettings;
		return {
			root,
			mount,
			show,
			openSettings,
			get status() {
				return lastStatus;
			},
			destroy() {
				cleanupCaptcha?.();
				document.removeEventListener("bit-toggle-settings", toggleSettings);
				document.removeEventListener("bit-close-settings", dismissSettings);
				setOptimizedUI(false);
				observer?.disconnect();
				clearTimeout(tipTimer);
				closeSettings(false);
				host.remove();
			}
		};
	}
	//#endregion
	//#region src/main.js
	function startApp(pageWindow) {
		const route = loginRoute(location.href);
		let controller = null;
		let submitted = false;
		function cancel() {
			controller?.abort();
			controller = null;
			ui.show("success", "已取消一键登录", 1500);
		}
		async function login() {
			if (!route || controller || submitted) return;
			const config = store.get();
			if (!config.username || !config.password) return ui.openSettings();
			const active = new AbortController();
			controller = active;
			const signal = AbortSignal.any([active.signal, AbortSignal.timeout(25e3)]);
			try {
				const state = readPageState(document);
				const reason = pageBlockReason(state);
				if (reason) throw new Error(reason);
				if (route.vpn) {
					const expected = await encodeVpnHost("sso.bit.edu.cn", pageWindow.__vpn_host_crypt_key, pageWindow.__vpn_host_crypt_iv);
					if (route.prefix.split("/").at(-1) !== expected) throw new Error("此 WebVPN 地址不是北理工 SSO 入口");
				}
				ui.show("loading", "正在登录…");
				const payload = await buildPayload(state, config, await requestRisk(route, pageWindow, signal));
				signal.throwIfAborted();
				const current = readPageState(document);
				if (current.execution !== state.execution || pageBlockReason(current)) throw new Error("认证页面已变化，请检查当前验证步骤后重试");
				ui.show("disabled", "正在提交登录信息…");
				submitPayload(document, route, payload);
				submitted = true;
			} catch (error) {
				if (controller !== active) return;
				ui.show("error", signal.reason?.name === "TimeoutError" ? "请求超时，请手动重试" : error.message, 2500);
			} finally {
				if (controller === active) controller = null;
			}
		}
		const ui = createUI(login, cancel);
		GM_registerMenuCommand("⚙️ 设置", ui.openSettings);
		if (route) {
			ui.mount();
			const reason = pageBlockReason(readPageState(document));
			if (reason) ui.show("error", reason);
			else if (store.get().auto) login();
		}
		function onPageHide(event) {
			if (!event.persisted) return destroy();
			controller?.abort();
			controller = null;
			submitted = false;
			ui.show();
		}
		function destroy() {
			document.defaultView.removeEventListener("pagehide", onPageHide);
			controller?.abort();
			controller = null;
			ui.destroy();
		}
		document.defaultView.addEventListener("pagehide", onPageHide);
		return {
			ui,
			login,
			cancel,
			destroy
		};
	}
	if (typeof window !== "undefined") startApp(unsafeWindow);
	//#endregion
})();
