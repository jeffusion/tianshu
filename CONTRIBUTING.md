# 贡献指南

欢迎 issue 和 PR。开始前阅读 [README](README.md)、[开发说明](docs/development.md) 和 [安全边界](SECURITY.md)。较大方向变更请先开 issue 讨论；小型修复可直接提交 PR。

1. Fork 仓库，从 main 创建分支。
2. `npm ci`，使用 `npm run demo` 运行隔离环境。
3. 实施范围明确的改动，为影响事务、权限、数据契约或恢复行为的改动补充有意义的回归。
4. 运行 `npm run check`，说明检查结果和未验证项。
5. 提交 PR，等待 CI 和维护者评审。

不要提交真实任务、聊天正文、数据库、个人配置、API key、本机路径、dist 或 node_modules。不要用跳过断言代替修复，不在 CI 自动安装到 Codex或访问模型服务。涉及 Skill 的变更必须保留用户授权、可靠派发和独立验收语义。

提交示例：`fix(ledger): preserve deletion receipt on retry`。版本维持0.1.0，日常 PR 不递增版本。贡献遵循 [MIT 许可证](LICENSE)；提交 PR 即表示你有权以此许可证贡献所含内容。
