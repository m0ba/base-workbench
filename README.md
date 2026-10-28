# 基地工作台

一个本地优先的基地工作入口，把每日工作日志、待办进度和设备资料放在同一处。工作日志、设备与基地资料保存在当前设备，不会自动上传或跨设备同步。

[![Release](https://img.shields.io/github/v/release/m0ba/base-workbench?display_name=tag)](https://github.com/m0ba/base-workbench/releases/latest)
[![Build and publish release packages](https://github.com/m0ba/base-workbench/actions/workflows/build-packages.yml/badge.svg)](https://github.com/m0ba/base-workbench/actions/workflows/build-packages.yml)
[在线使用](https://m0ba.github.io/base-workbench/) · [下载最新版本](https://github.com/m0ba/base-workbench/releases/latest)

## 功能

- **每日工作日志**：按日期记录正在进行、下一步待完成和已完成事项；在“全部记录”中按这个顺序查看每一天的完整内容。
- **任务提醒**：正在做的事项可设置预计完成时间，下一步事项可设置计划开始时间。未设置时间不会提醒；到期后在工作日志右下角显示提醒。工作台关闭时不会发送系统通知，重新打开并进入工作日志后会补查。
- **设备管理**：保存设备类别、型号、序列号、位置、状态、购入金额、供应商和保修信息。
- **本地数据迁移**：设置中可导出完整 `.bwbackup` 迁移包；导入支持合并或恢复，并在导入前保存安全快照。
- **预留模块**：农事专家和报账助手只作为不可启动的预留入口，模块中心提供三个未来接入位置。

## 支持平台

- Web / PWA：可在 iPhone 上添加到主屏幕。
- Mac：Apple silicon 与 Intel ZIP 安装包。
- Windows：便携版 EXE。
- Android：APK。

## 本机运行

需要 Node.js 20.19+、22.12+ 或 24+。

```bash
npm ci
npm run dev
```

首次进入默认访问密码为 `gxty`。这是客户端本地界面门禁，不是账号认证或加密；不要把迁移包或本机设备数据放进公开仓库。

```bash
npm run build
npm run preview
```

## 发布版本

版本更新时同步修改 `package.json` 与 `CHANGELOG.md`，提交后推送匹配的版本标签，例如：

```bash
git tag v0.3.0
git push origin v0.3.0
```

GitHub Actions 会按标签构建 Mac、Windows 和 Android 安装包，从 `CHANGELOG.md` 生成发布说明，并创建 GitHub Release。推送 `main` 会部署静态 PWA 页面。

Android Actions 当前生成可安装的 debug 签名 APK；若签名密钥随 CI 运行改变，安装新版本前可能需要卸载旧版。长期连续升级时应配置固定的 Android release 签名密钥，并只存入 GitHub Actions Secrets。

## 数据与隐私

- 浏览器与各平台应用各自保存本机数据，不做云同步。
- GitHub Pages 只提供静态网页，不接收工作日志或设备数据。
- 设置中的“数据迁移”会导出日志、任务状态、任务时间、设备、基地资料和模块配置。
- 农事专家与报账助手保持预留状态，不会启动或连接现有应用。
