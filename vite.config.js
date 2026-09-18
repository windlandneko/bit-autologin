import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const banner = `// ==UserScript==
// @name         [BIT AutoLogin] 一键登录北理工统一身份认证
// @namespace    https://bit.edu.cn/
// @version      ${version}
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
// ==/UserScript==`

export default defineConfig({
  build: {
    minify: false,
    rolldownOptions: {
      input: 'src/main.js',
      preserveEntrySignatures: false,
      output: {
        format: 'iife',
        entryFileNames: 'bit-autologin.user.js',
        banner,
      },
    },
  },
})
