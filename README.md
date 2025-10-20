# LinguaLens Monorepo

**LinguaLens** 提供即时的 Quick Explain 和带有文化上下文的 Deep Explain，用来解释字幕中的俚语。本仓库同时包含浏览器插件与后端服务的全部源代码。

This repository contains everything needed to build and share the LinguaLens Chrome extension and (optionally) run the FastAPI backend.

---

## Repository Layout ｜ 目录结构

- `extension/` — Chrome Manifest V3 extension (TypeScript + React, bundled with `tsup`).
- `server/` — FastAPI project that powers Explain APIs, profile storage, and retrieval helpers.
- `data/` — Development datasets (vector indexes, seed content).
- `ARCHITECTURE.md` — 深入的架构说明 / detailed architecture notes.

---

## Prerequisites ｜ 环境准备

| Tool 工具 | Version 建议版本 | Purpose 说明 |
|-----------|----------------|--------------|
| [Node.js](https://nodejs.org/en/download/) | ≥ 18 | Build & package the extension 构建打包插件 |
| npm (bundled with Node.js) | ≥ 8 | Dependency management 依赖管理 |
| Git (optional 可选) | latest | Clone the repo 克隆仓库 |
| Google Chrome | latest | Run/side-load the extension 安装插件 |
| Python 3.10+ (optional 可选) | — | Run the FastAPI backend 启动后端 |

> **Verify Node.js 安装验证**  
> `node -v` & `npm -v` should both print versions. 若命令输出版本号，说明安装成功。

---

## 1. Build & Package the Chrome Extension ｜ 构建并打包 Chrome 插件

The steps below are intentionally beginner-friendly. 即使从未写过代码，也可以照着完成。

1. **Open a terminal / 打开命令行**  
   - Windows: 使用 *PowerShell* 或 *命令提示符 (Command Prompt)*。  
   - macOS/Linux: 使用 *Terminal*。

2. **Move into the extension folder / 进入插件目录**
   ```bash
   cd /path/to/RTSlangsExpainer/extension
   ```
   将 `/path/to/RTSlangsExpainer` 替换为你电脑上的真实路径。

3. **Install dependencies / 安装依赖**
   ```bash
   npm install
   ```
   - 首次执行可能需要几分钟，请保持联网。  
   - 如果公司网络有代理，记得先配置 `npm config set proxy`。

4. **Package the extension / 一键打包插件**
   ```bash
   npm run package
   ```
   这个命令会：
   - 运行生产构建 `tsup`（编译 TypeScript、React 代码）。  
   - 复制 `manifest.json` 与静态资源到 `dist/`。  
   - 通过 `web-ext` 生成一个可分享的 ZIP 包并放入 `extension/artifacts/`。

5. **Locate the ZIP archive / 找到压缩包**
   - 打包成功后，终端会提示具体文件名，例如：  
     ```
     extension/artifacts/lingualens-extension-0.1.0.zip
     ```
   - 该压缩包包含完整的 Chrome 插件，可直接发给其他人。

> 🔁 **Repeat packaging / 重新打包**  
> 每次修改代码后，只需再执行 `npm run package` 即可生成新的 ZIP。

---

## 2. Share & Install the Extension ｜ 分享与安装插件

### Share the ZIP ｜ 分享压缩包
将 `extension/artifacts/*.zip` 通过邮箱、网盘、企业聊天工具发送给同事或朋友即可。

### Recipient Installation (Windows/macOS/Linux) ｜ 收到插件后如何安装

1. **Unzip 解压缩**
   - 建议将压缩包解压到一个容易记住的位置，例如桌面。  
   - 解压后会看到 `manifest.json`、`assets`、`content` 等文件夹。

2. **Open Chrome extension page 打开插件管理页面**
   - 在地址栏输入 `chrome://extensions/` 回车。

3. **Enable Developer Mode 开启开发者模式**
   - 在页面右上角打开 **Developer mode / 开发者模式** 开关。

4. **Load unpacked 加载已解压的插件**
   - 点击左上角的 **Load unpacked / 加载已解压的扩展程序**。  
   - 选择刚刚解压的文件夹（不是 ZIP 文件本身）。

5. **Access Options 配置插件**
   - 在插件卡片上点击 **Details / 详细信息** → **Extension options / 扩展程序选项**，即可填写 OpenAI Key、文化配置等信息。  
   - 配置完成即可在视频网站或本地播放器使用。

> ⚠️ **Chrome Web Store**  
> 若暂未发布到商店，用户只能通过上述 “Load unpacked” 方式安装；Chrome 不支持直接导入 ZIP。

---

## 3. (Optional) Run the Backend Server ｜ （可选）启动后端服务器

后端可以提供更稳定的解释服务、共享用户画像及缓存。无服务器环境也能使用插件的本地功能。

1. **Create a Python virtual environment / 创建虚拟环境**
   ```bash
   cd /path/to/RTSlangsExpainer/server
   python -m venv .venv
   source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
   ```

2. **Install dependencies / 安装依赖**
   ```bash
   pip install -e ".[dev]"
   ```

3. **Start services / 启动依赖服务**
   - 安装并启动 Redis：`redis-server` (默认端口 6379)。  
   - 准备向量库：`python scripts/build_index.py data/slang.json`（可按需替换数据源）。

4. **Run FastAPI / 启动 FastAPI**
   ```bash
   uvicorn app.main:app --reload --log-level debug
   ```
   API 端点默认运行在 `http://127.0.0.1:8000`。

---

## 4. Useful Developer Commands ｜ 开发常用命令

| Command | Description 说明 |
|---------|------------------|
| `npm run dev` (extension) | 启动增量编译，便于开发调试。 |
| `npm run lint` (extension) | ESLint 代码规范检查。 |
| `npm run test:e2e` (extension) | Playwright 端到端测试。 |
| `pytest` (server) | 运行后端单元测试。 |

---

## 5. Troubleshooting ｜ 常见问题

- **`npm install` 失败**  
  - 检查网络或代理；必要时执行 `npm config set registry https://registry.npmmirror.com`.
- **`npm run package` 报错找不到 `web-ext`**  
  - 确保在 `extension/` 目录中执行；如果 `node_modules` 被清理，需要重新 `npm install`.
- **Chrome 无法加载插件**  
  - 确认选中的是解压后的文件夹；确保 `manifest.json` 位于该文件夹根目录。
- **Deep Explain 无响应**  
  - 检查后端 FastAPI 和 Redis 是否运行；确认插件选项页中已配置正确的 API Key 与服务器地址。

---

## 6. FAQ ｜ 常见问答

- **Q: 我不会写代码，也能完成吗？**  
  A: 可以。按照上面 “构建并打包” 以及 “分享与安装” 两节逐步操作即可。

- **Q: 可以在其他 Chromium 浏览器使用吗？**  
  A: 是的（Edge、Brave 等），步骤与 `chrome://extensions/` 类似。

- **Q: 压缩包里能放额外说明吗？**  
  A: 可以，把 README 中的安装部分另存为 PDF 或文本，放入压缩包一起分享。

- **Q: 需要把后端也一起打包吗？**  
  A: 如仅分享前端插件，只需 ZIP；若要部署服务器，可将 `server/` 目录及此 README 一并打包。

---

## 7. Next Steps ｜ 后续规划

- Support profile switching directly inside the in-page overlay.  
- Stream Deep Explain sections incrementally from the backend (SSE).  
- Expand Playwright scenarios to cover API failures and profile-specific caches.  
- 为不同视频网站增加 OCR 识别模板，实现无需重新打包即可更新的配置。

欢迎提交 Issue & PR！Feel free to open issues or pull requests as you adopt LinguaLens in your own workflow.
