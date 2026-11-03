# npm 安装、升级与发布

正式渠道是 npmjs：`@jeffusion/tianshu`。命令为 `tianshu`，Codex 插件为 `tianshu@tianshu`。源码安装只用于开发测试。

## 安装

要求 Node.js 24–26、Python 3.12+、已安装并可运行的 Codex CLI。npm 包内已包含运行文件，无需克隆仓库、编译界面或下载额外安装包；Python 台账核心仍使用本机 Python。暂不支持 Windows 安装。

```sh
npm install -g @jeffusion/tianshu
tianshu install
tianshu doctor
```

也可以 `npx --yes @jeffusion/tianshu install`。npm 安装本身不修改 Codex；显式运行 `install` 才初始化默认台账并安装插件。之后重开 Codex、启用“天枢”、发送“@天枢 打开任务中心”，必要时将卡片展开到右侧。doctor 检查运行时和只读数据查询，不代表宿主页面和附件已经验收。

如果已有任务，明确指定既有配置，避免创建另一份空台账：

```sh
tianshu install --config /absolute/path/to/existing-config.json
```

自定义配置必须已经存在、来源可读，且数据库版本受支持。工具不迁移、替换或清空既有数据库，不从历史工程目录自动寻找任务。

## 稳定存储

macOS 默认使用 `~/Library/Application Support/Tianshu`；Linux 默认使用 `$XDG_DATA_HOME/tianshu` 或 `~/.local/share/tianshu`。可通过 `TIANSHU_HOME` 指定独立目录。

- `config.json`、`data/`：默认配置和台账。
- `releases/`：已校验的插件运行文件，用于回滚。
- `marketplace/`：稳定的本地市场入口，不依赖 npm 全局安装目录、npx 缓存或源码目录。
- `installation.json`：当前/上一份插件及配置路径。
- `operation.json`：未完成操作的恢复记录；正常完成后移除。
- `lifecycle.lock`：由操作系统释放的进程锁，防止并发改写安装。

`CODEX_HOME` 控制目标 Codex 配置；同一 TIANSHU_HOME 绑定一个 CODEX_HOME。`TIANSHU_PYTHON`、`TIANSHU_CODEX` 可显式指定可执行文件。MCP 启动路径在用户机器上生成，不写回 npm 包。

## 升级与回滚

```sh
npm install -g @jeffusion/tianshu@latest
tianshu upgrade
tianshu doctor
# 如需恢复上一份已管理的运行文件：
tianshu rollback
```

npm 升级只替换命令；`upgrade` 才更新 Codex 插件。上一份文件保留在稳定目录，回滚不依赖重新下载 npm 包，也不回滚数据库。首次安装没有上一份 npm 管理的插件时会明确报错。首次接入旧开发版会保留原市场路径回执，原源码/数据保持原位。

安装先验证文件清单和 SHA-256、检查配置、运行 MCP 健康查询，再通过官方 Codex CLI 注册。注册/安装/健康检查失败时尝试恢复之前的插件；恢复不能完成时保留操作记录，运行 `tianshu rollback` 重试恢复。不要手工清空数据目录来掩盖故障。

## 卸载

```sh
tianshu uninstall
npm uninstall -g @jeffusion/tianshu
```

卸载移除本工具管理的 Codex 插件和市场，保留配置、台账、验收记录及恢复文件。不要只删除 npm 包就认为 Codex 插件已卸载；其运行文件独立保存。工具不提供自动清空用户台账的选项。

## 发布流程（维护者）

日常本地测试不递增版本。正式 npm 版本不可覆盖；0.1.0 发布后，下一次正式发布须明确选择新版本。

1. 功能通过 PR、独立审查和 Linux/macOS CI 合入 main。
2. 检查包名、版本、文件白名单、第三方许可证和实际 npm 安装回归。
3. 维护者明确触发 `.github/workflows/publish.yml`，输入 package.json 的版本。
4. 工作流检查当前版本尚未发布，完整检查后构建 npm 包，通过 OIDC 发布到 npmjs，附带来源证明。
5. 从 npm registry 全新安装，验证 `--version`、安装/doctor及用户数据保全。

可信发布绑定：GitHub `jeffusion/tianshu`、工作流 `publish.yml`、环境 `npm`，允许 `npm publish`。环境应由维护者审批。首次发布可以在已登录且拥有 @jeffusion 组织权限的终端发布已检验的 npm 包；如 npm 要求交互验证，由维护者在自己的浏览器完成，不在聊天中传递验证码或 token。后续优先使用 OIDC，不在仓库保存长期 npm token。

CI 的包测试在隔离前缀真实执行 `npm install`，使用 Codex fixture 验证失败恢复、升级、回滚、卸载和任务数据库字节保全。正式发布前另用真实 Codex CLI 的隔离配置验证；这两项都不能代替真实宿主 UI 验收。
