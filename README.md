# BIT AutoLogin

北理工统一身份认证一键登录脚本 · [Greasy Fork](https://greasyfork.org/zh-CN/scripts/562208)

- 支持不带 service 的 SSO 入口，以及带 service 的教务、乐学等应用。
- 很遗憾，由于技术原因，二次认证还得在原认证页面完成。
- 凭证保存在脚本管理器的本地存储中。

## 使用

1. 安装 Tampermonkey 等用户脚本管理器，从 Greasy Fork 安装脚本；也可下载 Release 中的 `bit-autologin.user.js`。
2. 打开学校统一认证页面，在“设置”中填写学号和密码。
3. 点击“一键登录”，或开启“以后都自动登录”。
4. 默认开启现代化UI，可在设置中关闭。

## 开发

```sh
pnpm install
pnpm check
```

## 免责声明

本脚本仅供学习和研究使用，不保证其功能的完整性和稳定性。使用本脚本所导致的任何直接或间接损失，开发者不承担任何责任喵。
