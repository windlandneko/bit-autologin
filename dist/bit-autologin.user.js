// ==UserScript==
// @name         [BIT AutoLogin] 一键登录北理工统一身份认证
// @namespace    https://bit.edu.cn/
// @version      2.1.0
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
	//#region src/theme.js
	var STYLE_ID = "bit-optimized-ui";
	var CSS = `
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
`;
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
		style.id = STYLE_ID;
		style.textContent = CSS;
		document.head.append(style);
		const media = document.defaultView.matchMedia("(prefers-color-scheme: dark)");
		const storage = document.defaultView.sessionStorage;
		let mode = storage.getItem("bit-autologin-theme");
		const themeButton = document.createElement("button");
		themeButton.type = "button";
		themeButton.className = "bit-theme-button";
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
		const noticeButton = document.createElement("button");
		noticeButton.type = "button";
		noticeButton.className = "bit-notice-button";
		noticeButton.textContent = "公告";
		noticeButton.ariaLabel = "公告";
		noticeButton.onclick = () => {
			const card = noticeButton.closest(".login-content");
			if (card.classList.toggle("bit-notice-open") !== !!card.querySelector(".login-content-left:not(.notice-hide)")) card.querySelector(".newNotice, .newHideNotice")?.click();
			sync();
		};
		function toggleRemember(event) {
			const wrapper = event.target.closest(".topFunctionColor");
			if (wrapper && !event.target.closest("button")) wrapper.querySelector("button")?.click();
		}
		document.addEventListener("click", toggleRemember);
		const brand = document.createElement("div");
		brand.className = "bit-login-brand";
		brand.innerHTML = "<div class=\"bit-brand-emblem\"></div><span class=\"bit-brand-name\">数智北理</span><span class=\"bit-brand-subtitle\">| 统一身份认证</span>";
		const emblem = brand.firstElementChild;
		const header = document.createElement("div");
		header.className = "bit-login-header";
		header.innerHTML = "<h1>统一身份认证</h1><div id=\"bit-login-actions\"></div><div class=\"bit-login-separator\" role=\"separator\">Or</div>";
		const footer = document.createElement("div");
		footer.className = "bit-login-footer";
		const tabLabels = {
			通行密钥认证: "通行密钥",
			用户名密码: "用户密码",
			短信验证码: "手机验证码"
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
			if (footer.parentNode !== card) card.append(footer);
			if (noticeButton.parentNode !== card) card.append(noticeButton);
			if (themeButton.parentNode !== card) card.append(themeButton);
			for (const element of card.querySelectorAll(".last-action, .passkey-use, .login-panel-box")) {
				if (moved.has(element)) continue;
				const marker = document.createComment("login-footer");
				element.before(marker);
				moved.set(element, marker);
				footer.append(element);
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
			const value = String(expanded);
			if (noticeButton.getAttribute("aria-expanded") !== value) {
				noticeButton.setAttribute("aria-expanded", value);
				noticeButton.textContent = expanded ? "收起" : "公告";
			}
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
			if (remember && holder && remember.parentNode !== holder) holder.append(remember);
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
			footer.remove();
			brand.remove();
			header.remove();
			themeButton.remove();
			noticeButton.closest(".login-content")?.classList.remove("bit-notice-open");
			noticeButton.remove();
			style.remove();
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
	var STYLES = `
  :host-context(.bit-optimized-ui) #sso-tip { margin-bottom: 0; }
  :host-context(.bit-optimized-ui) .sso-info:not(.error):not(.success),
  :host-context(.bit-optimized-ui) .sso-settings { background: var(--card); border-color: var(--input);
    color: var(--foreground); border-radius: 8px; }
  :host-context(.bit-optimized-ui) :is(.sso-info, .sso-settings) { height: 36px; flex: 1; box-sizing: border-box; border-radius: calc(var(--radius) - 2px); }
  :host-context(.bit-optimized-ui) .sso-info:hover, :host-context(.bit-optimized-ui) .sso-settings:hover { background: var(--muted); }
  :host-context(.bit-optimized-ui) .sso-dialog { background: var(--card); border: 1px solid var(--border); }
  :host-context(.bit-optimized-ui) .sso-title { color: var(--foreground); }
  :host-context(.bit-optimized-ui) :is(.sso-label, .sso-checkbox-text) { color: var(--muted-foreground); }
  :host-context(.bit-optimized-ui) .sso-checkbox-text { font: var(--switch-label-font); }
  :host-context(.bit-optimized-ui) .sso-input { background: var(--field-background); border-color: var(--border); color: var(--foreground); }
  :host-context(.bit-optimized-ui) .sso-btn-primary { background: var(--primary); color: var(--primary-foreground); border-radius: calc(var(--radius) - 2px); font-weight: 500; }
  :host-context(.bit-optimized-ui) .sso-btn-primary:hover { background: color-mix(in oklch, var(--primary) 90%, transparent); }
  :host-context(.bit-optimized-ui) .sso-btn-clear { background: transparent; color: #f87171; }
  :host-context(.bit-optimized-ui) .sso-settings { flex: 0 0 36px; padding: 0; }
  .sso-settings svg { display: none; }
  :host-context(.bit-optimized-ui) .sso-settings svg:not(.close-icon) { display: block; }
  :host-context(.bit-optimized-ui) .sso-settings span { display: none; }
  @keyframes sso-reveal { from { clip-path: circle(0 at 100% 0); } to { clip-path: circle(150% at 100% 0); } }
  :host(.inline-settings) .sso-overlay { position: absolute; background: var(--card); animation: sso-reveal 180ms ease-out; }
  @keyframes sso-conceal { from { clip-path: circle(150% at 100% 0); } to { clip-path: circle(0 at 100% 0); } }
  :host(.inline-settings) .sso-overlay.closing { animation: sso-conceal 200ms ease-in forwards; }
  :host(.inline-settings) .sso-overlay.closing .sso-dialog { animation: none; }
  :host(.inline-settings) .sso-dialog { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; max-width: none; box-sizing: border-box; padding: 8px 24px 24px; border: 0; border-radius: 0; box-shadow: none; animation: none; }
  :host(.inline-settings) .sso-title { text-align: center; font-size: 16px; line-height: 20px; margin: 0; }
  :host(.inline-settings) .sso-field { position: absolute; left: 24px; right: 24px; top: var(--input-top); margin: 0; }
  :host(.inline-settings) .sso-field + .sso-field { top: calc(var(--input-top) + 52px); }
  :host(.inline-settings) .sso-label { position: absolute; clip-path: inset(100%); }
  .sso-field ion-icon { display: none; }
  :host(.inline-settings) .sso-field ion-icon { display: block; position: absolute; left: 13px; top: 11px; width: 14px; height: 14px; color: var(--foreground); pointer-events: none; }
  :host(.inline-settings) .sso-input { font: var(--login-input-font); height: 36px; padding: 3px 12px 3px 34px; border-radius: calc(var(--radius) - 2px); background: var(--field-background); border-color: var(--input); box-shadow: 0 1px 2px #0001; }
  :host-context(.bit-optimized-ui) .sso-input:is(:autofill, :-webkit-autofill) { -webkit-text-fill-color: var(--foreground) !important; caret-color: var(--foreground); }
  :host(.inline-settings) .sso-input::placeholder { color: var(--muted-foreground); opacity: 1; }
  :host(.inline-settings) .sso-input:focus { outline: none; border-color: var(--muted-foreground); box-shadow: 0 0 0 3px color-mix(in oklch, var(--muted-foreground) 50%, transparent); }
  :host(.inline-settings) .sso-checkbox-label { position: absolute; left: 24px; top: calc(var(--input-top) + 104px); margin: 0; height: 20px; }
  :host(.inline-settings) .sso-checkbox-label:has([name="optimizedUI"]) { left: auto; right: 24px; }
  :host(.inline-settings) .sso-actions { position: absolute; top: var(--submit-top); left: 24px; right: 24px; display: grid; grid-template-columns: 1fr; }
  :host(.inline-settings) .sso-btn { height: 36px; }
  :host(.inline-settings) .sso-footnote { position: absolute; bottom: 8px; left: 20px; right: 20px; height: 32px; margin: 0; }
  :host(.inline-settings) a { color: var(--muted-foreground); text-decoration: none; text-underline-offset: 4px; }
  :host(.inline-settings) a:hover { color: var(--foreground); text-decoration: underline; }
  :host-context(.bit-optimized-ui) #sso-tip .sso-settings { position: absolute; top: 20px; right: 20px; z-index: 50; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 150ms, opacity 180ms; }
  .sso-settings .close-icon { display: none; }
  :host-context(.bit-settings-open) .sso-settings svg:not(.close-icon) { display: none; }
  :host-context(.bit-settings-open) .sso-settings .close-icon { display: block; }
  :host-context(.bit-optimized-ui) #sso-tip .sso-settings:hover { background: var(--muted); }
  :host .sso-footnote .sso-btn-clear { height: auto; padding: 0; border: 0; background: transparent; color: #ef4444; font-size: 12px; }
  .sso-footnote .sso-btn-clear:hover { text-decoration: underline; text-underline-offset: 4px; }
  .sso-checkbox { appearance: none; position: relative; flex: 0 0 32px; width: 32px !important; height: 18px !important; border: 1px solid transparent; border-radius: 999px; background: var(--input, #ddd); transition: background 150ms; cursor: pointer; }
  .sso-checkbox::before { content: ''; position: absolute; top: 1px; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 150ms; }
  .sso-checkbox:checked { background: var(--primary, #171717); }
  .sso-checkbox:checked::before { transform: translateX(14px); background: var(--primary-foreground, #fff); }
  .sso-checkbox:focus-visible { outline: 2px solid var(--muted-foreground, #999); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { :host(.inline-settings) .sso-overlay { animation-duration: 1ms; } }
  @keyframes sso-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes sso-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sso-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes sso-scale-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes sso-scale-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }

  #sso-tip { display: flex; width: 100%; gap: 10px; margin-bottom: 32px;
    font: 14px sans-serif; user-select: none; }
  .sso-info, .sso-settings { height: 2.3em; padding: 0 15px; border-radius: 4px;
    background: #fff; border: 1px solid #fff; display: flex; align-items: center;
    justify-content: center; color: #000; transition: background 0.2s ease; }
  .sso-info { flex: 1; gap: 8px; }
  .sso-info.clickable, .sso-settings { cursor: pointer; }
  .sso-info.clickable:hover, .sso-settings:hover { background: rgba(255,255,255,0.9); }
  .sso-info.success { --status-color: rgba(76,175,80,0.9); }
  .sso-info.error { --status-color: rgba(255,77,79,0.9); }
  .sso-info.success, .sso-info.error { background: var(--status-color); border-color: var(--status-color); color: #fff; }
  .sso-info.disabled { opacity: 0.5; cursor: not-allowed; }
  .sso-spinner { width: 14px; height: 14px; animation: sso-spin 1s linear infinite; }
  .sso-info:not(.loading) :is(.sso-spinner, .sso-cancel) { display: none; }
  .sso-cancel { margin-left: auto; opacity: 0.7; font-size: 12px; }

  .sso-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 999999;
    display: flex; align-items: center; justify-content: center; animation: sso-fade-in 0.2s ease; }
  .sso-overlay.closing { animation: sso-fade-out 0.15s ease forwards; }
  .sso-dialog { background: #fff; padding: 32px 32px 18px; border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3); width: 400px; max-width: 90vw; user-select: none;
    animation: sso-scale-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .sso-overlay.closing .sso-dialog { animation: sso-scale-out 0.15s ease forwards; }
  .sso-dialog:focus { outline: none; }
  .sso-title { margin: 0 0 20px; color: #333; font-size: 20px; }
  .sso-field { margin-bottom: 15px; }
  .sso-label { display: block; margin-bottom: 5px; color: #666; font-size: 14px; }
  .sso-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
    box-sizing: border-box; font-size: 14px; }
  .sso-hint, .sso-footnote { color: #999; font-size: 12px; }
  .sso-checkbox-label { display: flex; gap: 8px; align-items: center; cursor: pointer; margin-bottom: 20px; }
  .sso-checkbox { margin: 0; }
  .sso-checkbox-text { color: #666; font-size: 14px; }
  .sso-actions { display: flex; gap: 10px; justify-content: space-between; }
  .sso-btn { padding: 6px 18px; border-radius: 6px; cursor: pointer; font-size: 14px;
    transition: background 0.2s ease; }
  .sso-btn-clear { border: 1px solid #ff000033; background: #fff; color: #ff0000; }
  .sso-btn-clear:hover { background: #ff00000a; }
  .sso-btn-clear:active { background: #ff000018; }
  .sso-btn-primary { border: none; background: #2196F3; color: #fff; }
  .sso-btn-primary:hover { background: #1976D2; }
  .sso-btn-primary:active { background: #1565C0; }
  .sso-footnote { display: flex; align-items: center; justify-content: space-between; margin-top: 24px; line-height: 1.4; }
`;
	function createUI(onLogin, onCancel) {
		const host = document.createElement("div");
		host.id = "bit-sso-helper";
		const root = host.attachShadow({ mode: "closed" });
		const style = document.createElement("style");
		style.textContent = STYLES;
		root.append(style);
		const bar = document.createElement("div");
		bar.id = "sso-tip";
		bar.innerHTML = `
    <div class="sso-info" aria-live="polite">
      ${SPINNER}<span class="sso-message"></span><span class="sso-cancel">点击取消</span>
    </div>
    <button type="button" class="sso-settings" aria-label="设置" title="设置"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg><svg class="close-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg><span>设置</span></button>`;
		root.append(bar);
		const info = bar.querySelector(".sso-info");
		const messageText = bar.querySelector(".sso-message");
		let observer;
		let tipTimer;
		let dialogHost;
		let closingLayer;
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
			const panel = document.querySelector("#bit-login-actions") || document.querySelector(".moreloginbtnBox") || document.querySelector("#normalLoginForm, #login-content-right-inner");
			if (panel && !panel.contains(host)) {
				host.style.cssText = "display:block;width:100%";
				panel.prepend(host);
			} else if (!panel && host.isConnected) host.remove();
		}
		function mount() {
			setOptimizedUI(store.get().optimizedUI);
			show();
			placeBar();
			observer = new document.defaultView.MutationObserver(placeBar);
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
		}
		function closeSettings(animate = true) {
			if (!dialogHost) return;
			const closing = dialogHost;
			bar.querySelector(".sso-settings").ariaLabel = "设置";
			const remove = () => {
				closing.parentElement?.classList.remove("bit-settings-open");
				closing.remove();
			};
			if (animate) {
				const layer = closingLayer;
				layer.classList.add("closing");
				layer.addEventListener("animationend", (event) => {
					if (event.target === layer) remove();
				});
			} else remove();
			dialogHost = null;
			restoreFocus?.focus();
		}
		function openSettings() {
			closeSettings(false);
			document.querySelector(".bit-notice-button[aria-expanded=\"true\"]")?.click();
			restoreFocus = root.activeElement || document.activeElement;
			dialogHost = document.createElement("div");
			dialogHost.id = "gm-sso-config";
			const dialogRoot = dialogHost.attachShadow({ mode: "closed" });
			dialogRoot.append(style.cloneNode(true));
			const overlay = document.createElement("div");
			overlay.className = "sso-overlay";
			closingLayer = overlay;
			overlay.innerHTML = `
      <form class="sso-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sso-title">
        <h2 class="sso-title" id="sso-title">BIT Autologin 设置</h2>
        <div class="sso-field"><label class="sso-label" for="gm-sso-username">用户名 (学号)</label>
          <ion-icon name="name-icon" aria-hidden="true"></ion-icon><input type="text" id="gm-sso-username" name="username" class="sso-input" placeholder="请输入学号" autocomplete="username"></div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-password">密码</label>
          <ion-icon name="password-icon" aria-hidden="true"></ion-icon><input type="password" id="gm-sso-password" name="password" class="sso-input" placeholder="请输入密码" autocomplete="current-password">
          </div>
        <label class="sso-checkbox-label"><span class="sso-checkbox-text">自动登录</span>
          <input type="checkbox" role="switch" id="gm-sso-auto" name="auto" class="sso-checkbox"></label>
        <label class="sso-checkbox-label"><span class="sso-checkbox-text">现代化UI</span>
          <input type="checkbox" role="switch" name="optimizedUI" class="sso-checkbox"></label>
        <div class="sso-actions"><button type="submit" class="sso-btn sso-btn-primary">保存</button></div>
        <div class="sso-footnote"><button type="button" id="gm-sso-clear" class="sso-btn sso-btn-clear">清除</button>
          <a href="https://github.com/windlandneko/bit-autologin" target="_blank" rel="noopener noreferrer">Github</a></div>
      </form>`;
			dialogRoot.append(overlay);
			const content = document.querySelector(".login-content .ant-tabs-content-holder");
			const card = document.documentElement.classList.contains("bit-optimized-ui") && content?.closest(".login-content");
			if (card) {
				dialogHost.className = "inline-settings";
				const panelTop = card.querySelector(".bit-login-header").getBoundingClientRect().bottom - card.getBoundingClientRect().top + 24;
				const inputTop = content.getBoundingClientRect().top - card.getBoundingClientRect().top - panelTop;
				dialogHost.style.cssText = `position:absolute;inset:${panelTop}px 0 0;z-index:40;--input-top:${inputTop}px;--submit-top:${inputTop + 140}px`;
				bar.querySelector(".sso-settings").ariaLabel = "返回登录";
				card.classList.add("bit-settings-open");
				card.append(dialogHost);
			} else document.body.append(dialogHost);
			const form = overlay.querySelector("form");
			const { username, password, auto, optimizedUI } = form.elements;
			const config = store.get();
			username.value = config.username;
			password.value = config.password;
			auto.checked = config.auto;
			optimizedUI.checked = !!config.optimizedUI;
			overlay.onclick = (event) => {
				if (event.target === overlay) closeSettings();
			};
			const clear = form.querySelector("#gm-sso-clear");
			let confirmingClear = false;
			clear.onclick = () => {
				if (!confirmingClear) {
					confirmingClear = true;
					clear.textContent = "确认清除？";
					return;
				}
				onCancel();
				closeSettings(false);
				store.set({
					username: "",
					password: "",
					auto: false,
					optimizedUI: false
				});
				show("error", "登录信息已清除", 1e3);
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
				if (event.shiftKey && dialogRoot.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && dialogRoot.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			};
			form.focus({ preventScroll: true });
			return dialogRoot;
		}
		bar.querySelector(".sso-settings").onclick = () => dialogHost ? closeSettings() : openSettings();
		return {
			root,
			mount,
			show,
			openSettings,
			get status() {
				return lastStatus;
			},
			destroy() {
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
				ui.show("disabled", "正在跳转…");
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
		GM_registerMenuCommand("⚙️ BIT AutoLogin 设置", ui.openSettings);
		if (route) {
			ui.mount();
			const reason = pageBlockReason(readPageState(document));
			if (reason) ui.show("error", reason);
			else if (store.get().auto) login();
		}
		return {
			ui,
			login,
			cancel,
			destroy() {
				controller?.abort();
				controller = null;
				ui.destroy();
			}
		};
	}
	if (typeof window !== "undefined") {
		const app = startApp(unsafeWindow);
		window.addEventListener("pagehide", () => app.destroy(), { once: true });
	}
	//#endregion
})();
