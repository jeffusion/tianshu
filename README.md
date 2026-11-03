# 天枢 Tianshu

[![CI](https://github.com/jeffusion/tianshu/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffusion/tianshu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向长期目标的智能协作工作台，以 Codex 本地插件交付。天枢将任务台账、执行聊天和验收证据连接起来，让跨聊天工作有持续的状态和明确的授权边界。

**当前阶段：0.1.0，早期开发。** 已实现任务中心、MCP 工具和协调 Skill；完整自主规划、后台常驻执行和多客户端协作尚未实现。

## 已实现

- 按项目、状态、名称查看任务、授权范围与验收记录。
- “带到聊天”仅添加任务背景；通过 `@天枢` 的自然语言请求查询、协调、核验或删除已结束任务。
- SQLite 事务台账、revision 冲突保护、派发去重与不确定回执记录。
- 删除任务保留独立验收归档；聊天空闲、回合结束和业务验收分别记录。
- 明暗主题、只读浏览器预览、隔离测试与内容哈希构建标识。

## npm 安装（正式渠道）

```sh
npm install -g @jeffusion/tianshu
tianshu install
tianshu doctor
```

命令安装后即可使用，无需克隆和构建源码；仍需本机 Node.js 24–26、Python 3.12+ 与 Codex CLI。npm 安装没有 postinstall 副作用，显式运行 install 才配置 Codex。安装后重开客户端、启用天枢并发送“@天枢 打开任务中心”。

已有台账使用 `tianshu install --config /absolute/path/to/config.json`，不会搬动或清空数据。升级命令、回滚与卸载见 [npm 分发说明](docs/npm-distribution.md)。安装标识 `tianshu@tianshu`，市场显示名“天枢”，Skill 为 `tianshu:coordinator`，MCP 服务名 `tianshu`。

源码克隆、npm ci、npm run demo 仅供开发测试。构建和测试不会更新当前 Codex 安装，也不会发布 npm 版本。

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

`check` 包含 TypeScript、生产构建、Node 协议测试、Python 台账测试和真实 npm 包生命周期测试，无需 API key、模型服务或业务数据库。构建产物位于 `dist/plugin` 和 `dist/marketplace`，`dist/build-info.json` 包含内容指纹。版本保持 `0.1.0`；本地测试不递增版本，不自动生成 ZIP、创建 release 或发布 npm。

## 工程结构

| 目录 | 内容 |
| --- | --- |
| `src/ui` | React 任务中心与宿主桥接 |
| `src/mcp` | MCP 工具与页面资源 |
| `src/contracts` | 产品元数据、任务和附件契约 |
| `ledger` | 配置解析、只读投影、事务台账 |
| `skills/coordinator` | 跨聊天协调规则与命令参考 |
| `scripts` | 演示、开发、构建、本地同步 |
| `tests` | 独立 fixture 和回归测试 |

参见[开发与验证](docs/development.md)、[贡献指南](CONTRIBUTING.md)、[安全说明](SECURITY.md)。私人配置、任务数据库、历史验收材料和安装产物不进入仓库。

## 许可证

[MIT](LICENSE)。第三方依赖保留各自许可证。本项目不隶属于 OpenAI；Codex、ChatGPT 等名称属于各自权利人。
