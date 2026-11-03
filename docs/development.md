# 开发与验证

## 开发环境

使用 Node.js 24 或 26、Python 3.12+。`.nvmrc` 指向 24；Python 代码只使用标准库，无需 pip 依赖。运行 `npm ci` 安装锁定依赖。

- `npm run demo`：隔离演示数据和浏览器预览。
- `npm run demo:prepare`、`npm run demo:check`：准备演示并断言只读投影、来源健康及预期任务存在。
- `npm run dev`：读取自己的开发配置；预览服务只监听本机 8975。
- `npm run check`：类型检查、生产构建、Node、Python 和实际 npm tarball 测试。
- `npm run build`：生成 dist/package 标准插件包，不安装。
- `npm run test:native -- --local`：真实 Codex 临时本地安装与宿主工具加载验收。
- `npm run test:native`：发布后从 npmjs 进行真实 Codex 隔离安装验收。
- `npm run pack:release`：构建并将 npm tarball 写入 .local，不发布。

## GitHub Flow

从 main 创建短分支，例如 `feat/project-summary`、`fix/attachment-context`、`docs/setup`。提交使用 `feat`、`fix`、`docs`、`test`、`chore` 等类型，向 main 提交 PR，说明问题、最终行为和实际验证。通过 CI 与评审后合并，删除已合并分支。

CI 在 PR、main push 和手动触发时运行 Linux/macOS、Node 24/26 的矩阵。每项执行锁定安装、完整检查、演示数据初始化和只读投影冒烟验证。工作流只有 contents:read 权限，Actions 固定提交 SHA；不安装 Codex、不调用模型、不发布、不部署。

## 验证等级

隔离测试覆盖事务、授权版本、派发恢复、终态删除和归档、配置路由及 MCP 协议。浏览器预览可检查布局和筛选，不代表宿主附件能力已验收。

需要在 Codex 中单独检查：工具发现、真实面板打开、搜索与项目切换、附件加入输入框。单项目数据只能证明项目选择器基本行为，不能代替跨项目排除验证。验收报告应区分自动测试、人工确认及未覆盖项。

个人验收截图、任务数据库和执行聊天内容请保留在本地，不放进 PR。版本不随本地测试递增；只有计划发布时由维护者明确决定版本和 release。

## npm 分发

正式发布物是 `@jeffusion/tianshu`，用户经 Codex 原生命令安装；源码安装仅用于开发测试。工程根 package.json 为 private，运行包由 build 写入 dist/package，移除开发依赖与 npm 脚本。根级 .codex-plugin/plugin.json、.mcp.json、skills/ 和运行文件一起打入 tarball。发布工作流明确打包 dist/package，避免误发开发工程。

常规 CI 不安装 Codex，不伪造宿主结果。实际 npm 包测试使用真实 npm 和 SDK；额外的 test:native 使用真实 Codex CLI 与 app-server，所有配置和台账均在临时目录，结束后清理。参考 [npm 分发说明](npm-distribution.md)。
