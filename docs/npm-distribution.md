# npm 分发与 Codex 原生安装

## 安装

插件是 npmjs 上的 `@jeffusion/tianshu`。GitHub 只承载市场目录；Codex 根据目录直接获取 npm 包，不要求用户安装独立 CLI 或构建源码。

```sh
codex plugin marketplace add jeffusion/tianshu
codex plugin add tianshu@jeffusion
```

要求 Node.js 24–26、npm、Python 3.12+ 与支持 npm 插件源的 Codex。当前验证范围是 macOS 桌面和 Linux/macOS 自动测试，Windows 尚未验收。npm 包不含安装脚本；插件生命周期由 Codex 管理。

首次使用显式初始化业务台账，再检查本包的 MCP 和只读查询：

```sh
npx --yes @jeffusion/tianshu@0.1.1 init
npx --yes @jeffusion/tianshu@0.1.1 doctor
```

已有配置只校验、不覆盖；指定不存在的 `--config` 会报错。doctor 检查当前 npm 包，不声称检查了 Codex 已安装版本或实际页面。重开 Codex、启用“天枢”、发送“@天枢 打开任务中心”，必要时展开到右侧。

## 业务数据

配置与台账在插件缓存之外。macOS 默认 `~/Library/Application Support/Tianshu`，Linux 默认 `$XDG_DATA_HOME/tianshu` 或 `~/.local/share/tianshu`；支持 `TIANSHU_HOME`。其中只有 `config.json` 与 `data/`，没有插件版本副本、安装状态或回滚日志。

已有台账在默认 `config.json` 中填入原配置的 `sources` 与可选 `presentation_path`，保持数据库和证据的绝对路径；已有默认配置不要覆盖。也可以通过 `TIANSHU_CONFIG` 指定既有配置，但要确保启动 Codex 的环境和命令行相同。详见[配置说明](configuration.md)。插件查询缺失配置会报错，不自动建库。

## 升级与卸载

```sh
codex plugin marketplace upgrade jeffusion
codex plugin add tianshu@jeffusion
# 卸载插件；业务台账和验收记录保留
codex plugin remove tianshu@jeffusion
# 不再需要这个市场时
codex plugin marketplace remove jeffusion
```

市场将每次发行固定到明确的 npm 版本；刷新目录后使用 Codex 原生命令安装。版本选择和缓存由 Codex 负责；天枢不提供独立升级、回滚或卸载命令，也不自动清除数据。

## 从旧的本地安装切换

`0.1.0` 曾附带独立安装管理，已经移除。先保留既有 config.json、数据库和证据，再用 Codex 移除旧入口 `tianshu@tianshu` 与市场 `tianshu`（仅在该旧入口确实存在时），随后按上面的命令安装 `tianshu@jeffusion`。不要删除整个天枢数据目录，不运行旧版的安装命令；新的诊断不会读取旧安装状态。旧 releases/、marketplace/、installation.json、operation.json 与 lifecycle.lock 不再使用；确认旧安装已退出后可单独清理，保留 config.json、data/ 及用户证据。

## 发布（维护者）

日常测试不递增版本。正式 npm 版本不可覆盖，因此本次修正发布为 `0.1.1`，不覆盖 `0.1.0`。

1. 同步 package.json、锁文件与 `.agents/plugins/marketplace.json` 的版本，PR 审查与 Linux/macOS CI 通过后合入 main。
2. `npm run check` 验证实际 tarball 的文件边界、无源码依赖、无安装脚本、配置路由、MCP/页面资源和数据保全。`npm run test:native -- --local` 验证真实 Codex 宿主发现工具。
3. 明确触发 `publish.yml`，输入版本；工作流构建 `dist/package`，打包该目录，经 `npm` 环境审批使用 OIDC 发布到 npmjs，并附来源证明。工程根包为 private，防止误发开发工程。
4. 发布后运行 `npm run test:native`，验证真实 Codex 从 npmjs 安装、宿主加载四个 MCP 工具、doctor、卸载及台账保全；该测试仅使用临时 CODEX_HOME 和临时业务数据。
5. 当前桌面客户端另验页面和“带到聊天”；命令行或 MCP 成功不能代替此项。

可信发布绑定 GitHub `jeffusion/tianshu`、`publish.yml`、`npm` 环境。不要保存长期 npm token，也不要在聊天发送验证码。发布前的本地原生安装验收不等于 npmjs 安装已验收。
