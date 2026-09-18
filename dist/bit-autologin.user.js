// ==UserScript==
// @name         [BIT AutoLogin] 一键登录北理工统一身份认证
// @namespace    https://bit.edu.cn/
// @version      2.0.0
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
	//#region src/ui.js
	var STORAGE_KEY = "bit-autologin-settings";
	var store = {
		get: () => GM_getValue(STORAGE_KEY, {
			username: "",
			password: "",
			auto: false
		}),
		set: (config) => GM_setValue(STORAGE_KEY, config)
	};
	var SPINNER = `<svg class="sso-spinner" viewBox="0 0 1024 1024" aria-hidden="true">
  <path d="M512 36a476 476 0 0 1 476 476" fill="none" stroke="currentColor" stroke-width="72" stroke-linecap="round"/>
</svg>`;
	var STYLES = `
  @keyframes sso-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes sso-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sso-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes sso-scale-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes sso-scale-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }

  #sso-tip { display: flex; width: 100%; gap: 10px; margin-bottom: 32px;
    font: 14px sans-serif; user-select: none; }
  .sso-info, .sso-settings { height: 36px; padding: 0 15px; border-radius: 4px;
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
  .sso-title { margin: 0 0 20px; color: #333; font-size: 20px; }
  .sso-field { margin-bottom: 15px; }
  .sso-label { display: block; margin-bottom: 5px; color: #666; font-size: 14px; }
  .sso-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
    box-sizing: border-box; font-size: 14px; }
  .sso-hint, .sso-footnote { color: #999; font-size: 12px; }
  .sso-checkbox-label { display: flex; align-items: center; cursor: pointer; margin-bottom: 20px; }
  .sso-checkbox { margin-right: 8px; width: 16px; height: 16px; }
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
  .sso-footnote { margin-top: 16px; text-align: center; line-height: 1.4; }
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
    <div class="sso-settings">设置</div>`;
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
			const ready = config.username && config.password;
			info.className = `sso-info ${state || (ready ? "clickable" : "disabled")}`;
			info.classList.toggle("clickable", state === "loading" || !state && !!ready);
			messageText.textContent = message || (ready ? "一键登录" : "请先设置登录信息→");
			info.onclick = state === "loading" ? onCancel : !state && ready ? onLogin : null;
			if (timeout) tipTimer = setTimeout(() => show(), timeout);
		}
		function placeBar() {
			const panel = document.querySelector("#normalLoginForm, .moreloginbtnBox, .login-content-right-inner");
			if (panel && !panel.contains(host)) {
				host.style.cssText = "display:block;width:100%;position:relative;z-index:10";
				panel.prepend(host);
			} else if (!host.isConnected) {
				host.style.cssText = "position:fixed;bottom:16px;right:16px;width:min(430px,calc(100vw - 32px));z-index:2147483646";
				document.body.append(host);
			}
		}
		function mount() {
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
			if (animate) {
				const layer = closingLayer;
				layer.classList.add("closing");
				layer.addEventListener("animationend", () => closing.remove(), { once: true });
			} else closing.remove();
			dialogHost = null;
			restoreFocus?.focus();
		}
		function openSettings() {
			closeSettings(false);
			restoreFocus = root.activeElement || document.activeElement;
			dialogHost = document.createElement("div");
			dialogHost.id = "gm-sso-config";
			const dialogRoot = dialogHost.attachShadow({ mode: "closed" });
			dialogRoot.append(style.cloneNode(true));
			const overlay = document.createElement("div");
			overlay.className = "sso-overlay";
			closingLayer = overlay;
			overlay.innerHTML = `
      <form class="sso-dialog" role="dialog" aria-modal="true" aria-labelledby="sso-title">
        <h2 class="sso-title" id="sso-title">🔐 BIT Autologin 设置</h2>
        <div class="sso-field"><label class="sso-label" for="gm-sso-username">用户名 (学号)</label>
          <input type="text" id="gm-sso-username" name="username" class="sso-input" placeholder="请输入学号" autocomplete="username"></div>
        <div class="sso-field"><label class="sso-label" for="gm-sso-password">密码</label>
          <input type="password" id="gm-sso-password" name="password" class="sso-input" placeholder="请输入密码" autocomplete="current-password">
          <small class="sso-hint">密码存储在本地浏览器中</small></div>
        <label class="sso-checkbox-label"><input type="checkbox" id="gm-sso-auto" name="auto" class="sso-checkbox">
          <span class="sso-checkbox-text">以后都自动登录</span></label>
        <div class="sso-actions"><button type="button" id="gm-sso-clear" class="sso-btn sso-btn-clear">清除</button>
          <button type="submit" class="sso-btn sso-btn-primary">保存</button></div>
        <div class="sso-footnote">点击油猴图标也可以打开本设置<br>
          由 <a href="https://github.com/windlandneko" target="_blank" rel="noopener noreferrer">windlandneko</a> 编写</div>
      </form>`;
			dialogRoot.append(overlay);
			document.body.append(dialogHost);
			const form = overlay.querySelector("form");
			const { username, password, auto } = form.elements;
			const config = store.get();
			username.value = config.username;
			password.value = config.password;
			auto.checked = config.auto;
			overlay.onclick = (event) => {
				if (event.target === overlay) closeSettings();
			};
			form.querySelector("#gm-sso-clear").onclick = () => {
				onCancel();
				store.set({
					username: "",
					password: "",
					auto: false
				});
				closeSettings();
				show("error", "登录信息已清除", 1e3);
			};
			form.onsubmit = (event) => {
				event.preventDefault();
				const next = {
					username: username.value.trim(),
					password: password.value,
					auto: auto.checked
				};
				onCancel();
				store.set(next);
				closeSettings();
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
			username.focus();
			return dialogRoot;
		}
		bar.querySelector(".sso-settings").onclick = openSettings;
		return {
			root,
			mount,
			show,
			openSettings,
			get status() {
				return lastStatus;
			},
			destroy() {
				observer?.disconnect();
				clearTimeout(tipTimer);
				closeSettings(false);
				host.remove();
			}
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
