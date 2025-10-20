# LinguaLens Monorepo

[English](#english) · [中文说明](#中文说明)

---

## English

### 1. Project Overview

LinguaLens is a Chrome (Manifest V3) extension plus FastAPI backend that explains slang in subtitles. It provides:
- **Quick Explain** – instant literal/contextual meaning
- **Deep Explain** – culture-aware insight with sources and confidence

### 2. Repository Layout

| Path | Description |
|------|-------------|
| `extension/` | Chrome extension (TypeScript + React, bundled with `tsup`). |
| `server/` | FastAPI backend with Redis cache, OpenAI integrations, and profile storage. |
| `server/requirements.txt` | Locked Python dependencies for the backend. |
| `ARCHITECTURE.md` | Additional system design notes. |

### 3. Prerequisites

| Item | Recommended Version | Notes |
|------|--------------------|-------|
| Node.js & npm | Node.js 18+/npm 8+ | Used to build/package the extension. |
| Google Chrome | Latest stable | Needed to side-load the extension. |
| Python | 3.10+ (optional) | Required only if you run the backend. |
| Redis | 6+ (optional) | Backend cache layer during Deep Explain. |

Verify installations with:
```bash
node -v     # shows Node.js version
npm -v      # shows npm version
python -V   # shows Python version (optional)
```

### 4. Build & Package the Extension

```bash
cd extension                  # move into the extension workspace
npm install                   # install front-end dependencies (one time)
npm run build                 # compile TypeScript/React into dist/ for local use
npm run package               # build + create shareable ZIP in extension/artifacts/
```

Explanation:
- `npm install` downloads dependencies defined in `package.json`.
- `npm run build` generates `dist/`, suitable for local “Load unpacked”.
- `npm run package` additionally runs `web-ext build` and writes a ready-to-share ZIP under `extension/artifacts/`.

### 5. Load the Extension in Chrome

1. Open `chrome://extensions/`.
2. Toggle **Developer mode**.
3. Choose **Load unpacked**, point to the `extension/dist` folder (after `npm run build`).
4. Configure API keys and cultural profiles via the extension’s **Options** page.

To install from the packaged ZIP, unzip it somewhere and load that folder instead of `dist/`.

### 6. (Optional) Run the Backend

```bash
cd server
python -m venv .venv                  # create virtual environment
source .venv/bin/activate             # Windows: .venv\Scripts\activate
pip install -r requirements.txt       # install pinned backend dependencies
redis-server                          # start Redis on localhost:6379 (or your own instance)
uvicorn app.main:app --reload         # launch FastAPI at http://127.0.0.1:8000
```

Optional data prep:
```bash
python scripts/build_index.py data/slang.json  # build vector index on sample data
```

### 7. Useful Developer Commands

| Command | Description |
|---------|-------------|
| `npm run dev` (extension) | Watch & rebuild during development. |
| `npm run lint` (extension) | Run ESLint on the TypeScript sources. |
| `npm run test:e2e` (extension) | Playwright end-to-end tests for the overlay workflow. |
| `pytest` (server) | Backend unit tests. |

### 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm install` fails | Check network/proxy; use `npm config set registry https://registry.npmmirror.com` if needed. |
| `npm run package` errors on `web-ext` | Ensure you are in `extension/` and have run `npm install`. |
| Chrome says “Manifest invalid” | Confirm you selected the folder that contains `manifest.json`. |
| Deep Explain requests hang | Verify backend and Redis are running, and update the extension options with the backend URL/API keys. |

---

## 中文说明

### 1. 项目概述

LinguaLens 是一款 Chrome（Manifest V3）插件，配合 FastAPI 后端使用，用于解释字幕中的俚语：
- **Quick Explain**：立即展示字面和语境含义；
- **Deep Explain**：提供带文化背景、可信度及来源的深度解释。

### 2. 目录结构

| 路径 | 说明 |
|------|------|
| `extension/` | 插件前端（TypeScript + React，使用 `tsup` 打包）。 |
| `server/` | FastAPI 后端，包含 Redis 缓存、OpenAI 集成与用户画像存储。 |
| `server/requirements.txt` | 后端 Python 依赖清单。 |
| `ARCHITECTURE.md` | 详细架构说明。 |

### 3. 环境准备

| 工具 | 推荐版本 | 备注 |
|------|----------|------|
| Node.js / npm | Node.js 18+ / npm 8+ | 构建 & 打包插件。 |
| Google Chrome | 最新稳定版 | 侧载插件。 |
| Python | 3.10+（可选） | 仅在运行后端时需要。 |
| Redis | 6+（可选） | Deep Explain 的缓存服务。 |

快速检查：
```bash
node -v     # 查看 Node.js 版本
npm -v      # 查看 npm 版本
python -V   # 查看 Python 版本（如果要运行后端）
```

### 4. 构建与打包插件

```bash
cd extension                  # 进入插件目录
npm install                   # 安装前端依赖（首次执行即可）
npm run build                 # 将 TypeScript/React 构建到 dist/ 目录
npm run package               # 构建并生成可分享的 ZIP（保存在 extension/artifacts/）
```

命令解释：
- `npm install`：根据 `package.json` 下载依赖。
- `npm run build`：生成 `dist/`，方便本地 “Load unpacked”。
- `npm run package`：在构建基础上调用 `web-ext build`，输出可直接分享的压缩包。

### 5. 在 Chrome 中加载插件

1. 打开 `chrome://extensions/`。
2. 打开右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择 `extension/dist`（或解压后的 ZIP 文件夹）。
4. 在 **扩展选项** 中填写 OpenAI Key、LangGraph Key、用户画像等信息。

如果朋友收到的是 ZIP 压缩包，先解压，然后同样通过 “加载已解压的扩展程序” 指向解压目录即可。

### 6. （可选）启动后端

```bash
cd server
python -m venv .venv                  # 创建虚拟环境
source .venv/bin/activate             # Windows 使用 .venv\Scripts\activate
pip install -r requirements.txt       # 安装后端依赖
redis-server                          # 启动 Redis（默认端口 6379）
uvicorn app.main:app --reload         # 启动 FastAPI，默认 http://127.0.0.1:8000
```

可选的数据准备：
```bash
python scripts/build_index.py data/slang.json  # 构建示例向量索引
```

### 7. 常用开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev`（extension） | 启动实时编译，便于调试。 |
| `npm run lint`（extension） | 运行 ESLint，检查代码规范。 |
| `npm run test:e2e`（extension） | Playwright 端到端测试。 |
| `pytest`（server） | 后端单元测试。 |

### 8. 故障排查

| 问题 | 解决方案 |
|------|----------|
| `npm install` 失败 | 检查网络或代理，可设置 `npm config set registry https://registry.npmmirror.com`。 |
| `npm run package` 报错找不到 `web-ext` | 确认当前目录是 `extension/` 且已执行 `npm install`。 |
| Chrome 提示 “Manifest invalid” | 确认选择的是包含 `manifest.json` 的文件夹。 |
| Deep Explain 无响应 | 检查后端 & Redis 是否启动，以及插件选项中的服务器地址、API Key 是否正确。 |

---

## License

This project follows the license specified in the repository (see `LICENSE` if present). Contributions and issue reports are welcome!
