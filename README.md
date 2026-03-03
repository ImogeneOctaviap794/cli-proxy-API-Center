# API Center

一站式 cpa痛点 管理工具 — 站点签到、使用量统计、CodeX 账号管理、OpenCode 配置管理。

## 为什么有这个项目？

[CLI-Proxy-API](https://github.com/router-for-me/CLIProxyAPI) 是一个优秀的多模型代理工具，但它不支持使用记录的持久化保存 — 每次重启后历史数据就会丢失。社区曾多次提交 PR 希望加入该功能，均被维护者拒绝（[PR #878](https://github.com/router-for-me/CLIProxyAPI/pull/878)）。

的确，统计数据对 CPA 运行没有任何帮助，但是看着就是很舒服。

API Center 通过定时从 CLI-Proxy 的 export API 同步数据并存入本地 SQLite 数据库，实现了使用记录的持久化，同时提供了更丰富的可视化统计和管理功能。

## 功能

- **使用量统计** — 自动从 CLI-Proxy 同步使用数据，按模型/API/时间维度统计，支持缓存 Tokens 和思考 Tokens 统计
- **站点签到管理** — 管理多个 API 站点的每日签到
- **站点配置管理** — 通过 Web 界面管理 CLI-Proxy 的 OpenAI 兼容提供商配置
- **CodeX 账号管理** — 批量检查账号有效性、查询配额、清理失效账号
- **模型定价** — 自定义模型价格，计算使用成本
- **OpenCode 配置管理** — 可视化管理 `opencode.json` 中的提供商和模型配置（上下文限制、输出限制、输入/输出能力、附件、Variants）
- **Oh My OpenCode 管理** — 可视化管理 `oh-my-opencode.json` 中的 Agents 和 Categories 模型分配

## 技术栈

- **后端**: Node.js + Express + better-sqlite3
- **前端**: React + Vite + TailwindCSS + Recharts
- **数据存储**: SQLite（使用量数据）+ JSON 文件（配置）

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

前端 Vite 开发服务器运行在 `http://localhost:5173`，后端 API 运行在 `http://localhost:7940`。

### 生产模式

```bash
npm run build
npm start
```

访问 `http://localhost:7940`。

## 首次使用

启动后在页面中配置：

- **CLI-Proxy 地址** — 例如 `http://localhost:8317`
- **管理密码** — CLI-Proxy 的管理密码
- **OpenCode 配置目录**（可选）— 例如 `C:\Users\你的用户名\.config\opencode`，配置后主页会显示 OpenCode 管理入口

配置完成后即可开始使用各项功能。