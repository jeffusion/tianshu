# 配置与台账

## 演示

`npm run demo` 创建独立的 `.local/demo/config.json` 与演示数据库并启动预览。只准备数据可运行 `npm run demo:prepare`；重复执行不会重置数据库或覆盖配置。

## 自有台账

复制 `config/config.example.json` 到 `.local/config.json`，将 path 改为自己的绝对路径。`presentation_path` 是可选字段；不使用自定义展示文案时删掉它。来源 ID 只允许 ASCII 字母、数字、下划线和连字符，且必须唯一。

MCP 与 Skill 采用同一配置解析器，优先级为：显式 `--config`、`TIANSHU_CONFIG`、稳定数据目录下的 `config.json`（macOS：`~/Library/Application Support/Tianshu`；Linux：`$XDG_DATA_HOME/tianshu` 或 `~/.local/share/tianshu`；可由 `TIANSHU_HOME` 指定）。开发启动器在未设置环境变量时使用 `.local/config.json`。缺失配置报错，不扫描磁盘、不静默创建替代数据库。

可以指向一个尚不存在的数据库，然后显式初始化：

```sh
python3 skills/coordinator/scripts/coordinator.py --config /absolute/path/to/config.json --source daily init
```

`init` 只初始化指定来源；任务操作、JSON 输入和验收条件见[命令参考](../skills/coordinator/references/commands.md)。来源不存在时必须先由用户配置，不能从任务文本或附件接收任意数据库路径。

使用既有数据库前先自行备份。浏览器预览和查询 MCP 使用只读连接；协调命令与正式删除接口可以按授权写入台账。所有本机 JSON 配置、数据库和任务证据应保存在 `.local/` 或仓库外。

## 环境变量

| 名称 | 作用 |
| --- | --- |
| `TIANSHU_CONFIG` | 显式指定配置文件绝对路径 |
| `TIANSHU_PYTHON` | Python 可执行文件，默认 `python3` |
| `TIANSHU_HOME` | 稳定业务数据目录，供 MCP、Skill 和初始化命令共同使用 |
| `CODEX_HOME` | Codex 自己的配置与插件缓存根目录；天枢不计算或修改其缓存路径 |

Codex 从包中加载相对路径的 MCP 配置。配置文件独立于插件缓存，更新和卸载插件不会删除任务。已有台账请在默认 config.json 中登记原始绝对路径；如果使用 TIANSHU_CONFIG，必须让宿主也获得同一个环境变量。
