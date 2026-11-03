# 台账命令

只依赖 Python 3.9+ 标准库。脚本输出一行 JSON，成功 exit 0、拒绝或失败 exit 1。配置和输入均使用绝对路径；以下 `SCRIPT`、`CONFIG`、`SOURCE` 是占位符，使用前替换；SCRIPT为本Skill的scripts/coordinator.py，CONFIG为绝对配置路径，SOURCE为其中已配置的来源ID。

```sh
python3 SCRIPT --config CONFIG --source SOURCE init
python3 SCRIPT --config CONFIG --source SOURCE task-list
python3 SCRIPT --config CONFIG --source SOURCE task-show --input /absolute/request.json
```

除 init/list 外，输入必须是 UTF-8 JSON 对象文件，或 `--input -` 从 stdin 读取。不要把 JSON.stringify 输出拼进 shell 命令；用文件或正确引用的 heredoc。不要在数据中放凭据或完整工具日志。

每条修改命令除 task-create 外都需要 `task_id` 与整数 `expected_revision`。每次成功修改都会递增 revision，读取不会递增。事务失败会整体回滚。数据库使用 SQLite 锁（5 秒 busy timeout），不提供外部动作锁或沙箱。

## task-create

```json
{
  "task_id": "pilot-001",
  "objective": "生成指定试点产物并验证",
  "owner_thread_id": "实际主聊天 ID",
  "owner_host_id": "local",
  "project_id": null,
  "execution": null,
  "acceptance": ["实际产物符合约定，主聊天已点验"],
  "allowed": ["在试点 outputs 目录写入指定文件"],
  "forbidden": ["修改业务项目、srv、提交推送、部署"],
  "authorization_source": "主聊天中用户要求创建全新会话试点的原话及消息位置"
}
```

已有聊天使用 `execution: {"host_id":"…","thread_id":"…"}`。这里不验证 Codex 身份和用户授权，必须由协调者在会话中核实。初始状态 queued，revision=1，mandate_version=1。

## dispatch-prepare

额外字段：唯一 `dispatch_id`、`kind`（create_thread 或 send_message）、`prompt`、`authorization_source`。创建只允许在 execution 未绑定时，发送消息只允许已绑定时。prompt 是需要实际发送的完整文本，包含派发编号、目标、当前允许/禁止动作和验收要求。未确认派发最多一条，不能复用旧编号。

## dispatch-mark

额外字段：`dispatch_id`、`state`、`receipt`。

- prepared → sent / uncertain / cancelled
- sent → observed / uncertain
- uncertain → sent / observed / cancelled
- observed/cancelled 为终态，不能回退重发。

sent 回执：`{"host_id":"local","thread_id":"真实 threadId","tool_result":"简短来源"}`，首次创建会原子绑定任务。若原工具仅返回 threadId，可补上已知目标 hostId。禁止把 clientThreadId 当真实 ID。

uncertain 回执：`{"reason":"超时、结果不明或仅返回 clientThreadId"}`。必须查证后处理。

observed 回执：`{"observation_id":"读回确认对应派发的 observation ID"}`。该 observation 必须属于本任务并引用该 dispatch_id。

cancelled 回执：`{"reconciliation":"证明未发送，或放弃记录及实际执行处置的证据"}`。这是协调者声明，不是脚本检查外部系统的结果；不能凭取消记录停止任务。

## observation-record

额外字段：`host_id`、`thread_id`（必须匹配绑定）、`turn_id`、`summary`、`evidence`（非空字符串列表）、可选 `cursor`（wait 游标）、可选 `dispatch_id`（仅确实确认派发时）、可选唯一 `observation_id`。

例：`evidence` 可包含实际消息 ID、读取结果文件路径、产物路径及内容核验说明。脚本只验证字段关系，不判断证据真假。观察不自动改变任务状态。省略 cursor 会保留任务已有 wait 游标；显式传 null 才清除它。

## task-transition

额外字段 `state` 与 `reason`。允许路径：

```text
queued → running / waiting_human / waiting_external / failed / stopped
running → ready / waiting_human / waiting_external / failed / stopped
waiting_human、waiting_external → running / failed / stopped
ready → accepted / running / waiting_human / failed / stopped
failed → running / stopped
accepted、stopped → 不再重新开启；新工作创建新任务
```

accepted 额外要求 `verified_by`、非空 `verification_evidence`，已有 observation 且无未确认派发。stopped 要求 `stop_authorization_source`、`execution_stop_evidence`，且无未确认派发。脚本不实际停止命令、检查文件或验证用户身份。

## mandate-revise

使用新的完整 `allowed`、`forbidden` 与 `authorization_source`，保留历史，版本递增。无未确认派发时才能修订。修订不会停止已有动作；范围变化须按人类授权另行通知执行者。

## 恢复与限制

新增命令同样要求task_id和最新expected_revision，均只改本地记录，不执行外部动作：

- `incident-record`：incident_id、category（direction_drift/authorization_gap/execution_failure/observation_unavailable）、summary、evidence。已有open异常时拒绝覆盖。业务状态不变。
- `correction-link`：incident_id、dispatch_id。绑定同任务、当前授权版本的send_message派发，不能链接已cancelled记录；不能用另一个未协调的纠偏覆盖已有纠偏。纠偏派发必须在本次异常后创建；替换已observed/cancelled纠偏时需replacement_reason与replacement_evidence，历史关联保留。
- `incident-resolve`：incident_id、resolution（corrected/dismissed/observation_restored）、verified_by、verification_evidence。corrected还需observation_id，关联纠偏已observed且该观察引用同一派发，观察行序号须晚于异常登记边界；observation_restored仅用于观测故障并需实际观察。任何未确认派发都会阻止解决。脚本只校验关联，实际恢复行为由协调者核验。
- `monitor-record`：status（watching/waiting_decision/stopped）、reason、evidence；watching另需真实automation_id、authorization_source，且无open异常。此命令不创建/恢复/停止定时任务；evidence必须指向实际工具回执，模拟测试必须明确标为fixture。

open异常会阻止accepted；允许继续记录观察。不因异常或跟进状态更改业务state。不支持在accepted/stopped任务上重新开启恢复流程；新试点用新任务ID。终态任务仅允许monitor-record(stopped)记录真实停止回执，不能恢复watching。

从 task-list/show 恢复，核对 task_id、owner、执行目标与 mandate。对所有 prepared/sent/uncertain 先读回查证；不能直接重复发送。台账不存整段聊天，不保证每次外部操作只执行一次，不验证权限真实性，不自动调用 Codex。不要同时复制运行数据库；备份使用 SQLite backup API 或在没有写入时复制。

## task-delete

仅用户明确授权删除指定任务后调用。输入task_id、expected_revision、reason、authorization_source；已绑定执行聊天还需execution_stop_evidence，来自实际最新状态核对。仅accepted/stopped可删除，拒绝未确认派发、未解决异常和未停止/无证据的monitor。

事务在同一数据库创建独立task_deletions归档表，保存完整task-show快照、删除请求和UUID回执，再依次删除events/observations/dispatches/mandates/tasks记录；任何错误整体回滚。不删除聊天、文件、监控，不改变外部执行。不修改schema user_version，原查询逻辑兼容。

返回task_id、deleted_revision、deleted=true、archive_id、deleted_at、already_deleted。对相同task_id/revision重试返回同一归档回执；旧ID禁止复用，防止迟到重试删掉新任务。它不是业务state转为deleted，也不是列表过滤。必要验收记录保留于归档表，可用只读SQLite按archive_id读取snapshot/receipt/request；无公开恢复/覆写归档接口。

删除事务同时保存observations/dispatches的历史序号上限到task_rowid_counters，后续写入分配高于上限的rowid，保持既有异常边界与纠偏关联的时序语义；删除其他任务不会导致记录序号被复用。
