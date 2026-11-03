# 天枢 Tianshu

[![CI](https://github.com/jeffusion/tianshu/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffusion/tianshu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向长期目标的智能协作工作台，以 Codex 本地插件交付。天枢将任务台账、执行聊天和验收证据连接起来，让跨聊天工作有持续的状态和明确的授权边界。

**当前阶段：0.1.1，早期开发。** 已实现任务中心、MCP 工具和协调 Skill；完整自主规划、后台常驻执行和多客户端协作尚未实现。

## 已实现

- 按项目、状态、名称查看任务、授权范围与验收记录。
- “带到聊天”仅添加任务背景；通过 `@天枢` 的自然语言请求查询、协调、核验或删除已结束任务。
- SQLite 事务台账、revision 冲突保护、派发去重与不确定回执记录。
- 删除任务保留独立验收归档；聊天空闲、回合结束和业务验收分别记录。
- 明暗主题、只读浏览器预览、隔离测试与内容哈希构建标识。

## 安装

发布物是 npm 包 `@jeffusion/tianshu`，由 Codex 原生插件机制下载和安装，无需全局安装天枢、克隆仓库或编译。

```sh
codex plugin marketplace add jeffusion/tianshu
codex plugin add tianshu@jeffusion
```

需要本机 Node.js 24–26、npm、Python 3.12+ 和支持 npm 插件源的 Codex。首次使用显式创建业务台账：

```sh
npx --yes @jeffusion/tianshu@0.1.1 init
npx --yes @jeffusion/tianshu@0.1.1 doctor
```

重开客户端、启用“天枢”，发送“@天枢 打开任务中心”。已有任务先按[配置说明](docs/configuration.md)接入既有台账；不要用另一份空库替代。市场标识 `jeffusion`，插件 `tianshu`，Skill `tianshu:coordinator`，MCP 服务名 `tianshu`。升级、卸载和版本发布见 [npm 分发说明](docs/npm-distribution.md)。

源码安装只用于开发测试。构建和测试不会更新当前 Codex 安装，也不会自动发布 npm。

## 工作方式与边界

天枢提供 `open_workspace`、`list_tasks`、`get_task` 和 `delete_task`。工具本身不向其他聊天发消息；协调 Skill 使用宿主提供的聊天工具，按用户授权跟进工作。台账记录授权但不是权限系统，不能替代用户指令。

删除仅接受已验收或已停止的任务，要求最新 revision、授权来源和必要的执行停止证据。删除不等于停止进程或监控。交付报告先进入待验收状态，经独立核验才接受。

## 开发测试体验

需要 Node.js 24 或 26、npm、Python 3.12+。Codex 插件宿主目前主要在 macOS 桌面客户端验证；CI 覆盖 Linux/macOS 的构建与隔离测试。

```sh
git clone https://github.com/jeffusion/tianshu.git
cd tianshu
npm ci
npm run demo
```

打开 <http://127.0.0.1:8975/preview.html?theme=light>。演示仅生成 `.local/demo/` 内的独立任务，不读取你的真实台账、不安装插件、不发送聊天消息。预览中的附件操作被隔离，需要实际宿主验证。

## 检查与构建

```sh
npm run check
npm run build
```

`check` 包含 TypeScript、生产构建、Node 协议测试、Python 台账测试和真实 npm tarball 回归，无需 API key、模型服务或业务数据库。可发布包位于 `dist/package`；插件清单、MCP、Skill 和运行产物直接位于包根目录。`build-info.json` 记录版本和内容指纹。

本地测试不递增版本、不生成独立安装器。正式 npm 版本不可覆盖；本次 `0.1.1` 修正已发布 `0.1.0` 的安装结构。
## 工程结构

| 目录 | 内容 |
| --- | --- |
| `src/ui` | React 任务中心与宿主桥接 |
| `src/mcp` | MCP 工具与页面资源 |
| `src/contracts` | 产品元数据、任务和附件契约 |
| `ledger` | 配置解析、只读投影、事务台账 |
| `skills/coordinator` | 跨聊天协调规则与命令参考 |
| `scripts` | 演示、开发、构建、原生安装验收 |
| `tests` | 独立 fixture 和回归测试 |

参见[开发与验证](docs/development.md)、[贡献指南](CONTRIBUTING.md)、[安全说明](SECURITY.md)。私人配置、任务数据库、历史验收材料和安装产物不进入仓库。

## 许可证

[MIT](LICENSE)。第三方依赖保留各自许可证。本项目不隶属于 OpenAI；Codex、ChatGPT 等名称属于各自权利人。
