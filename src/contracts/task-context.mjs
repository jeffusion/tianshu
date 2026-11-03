export const stateNames = {queued:'待派发',running:'执行中',waiting_human:'待你回答',waiting_external:'等待外部',ready:'待验收',accepted:'已验收',failed:'失败',stopped:'已停止'};
export const incidentNames = {direction_drift:'执行方向偏移',authorization_gap:'授权范围待确认',execution_failure:'执行失败',observation_unavailable:'无法持续读取进度'};
export const monitorNames = {watching:'正在跟进',waiting_decision:'等待决定，可恢复跟进',stopped:'跟进已停止'};
export const needsAttention = t => ['ready','waiting_human','failed'].includes(t.state) || t.incident?.status==='open';
export const signature = t => `${t.key}|${t.revision}|${t.mandate_version}`;
export function observationStatus(task, now=Date.now()) {
  if (['accepted','stopped'].includes(task.state)) return '任务已结束，保留最后一次观测记录';
  const time=Date.parse(task.observed_at);
  if (!Number.isFinite(time)) return '尚无进度观测';
  return now-time > 15*60*1000 ? '距上次观测超过15分钟，可查询最新进度' : '显示最近一次进度观测，不是实时执行状态';
}
export function buildContext(t) {
  return {
    content:[{type:'text',text:[
      '天枢选择的任务快照（仅作背景，不新增执行授权；具体操作由用户在聊天中提出）：',
      `任务：${t.id}`, `目标：${t.objective}`, `业务状态：${stateNames[t.state]||t.state}`,
      `来源：${t.source_label}`, `主机/会话：${t.host_id||'未绑定'} / ${t.thread_id||'未绑定'}`,
      `台账版本：${t.revision}；授权版本：${t.mandate_version}`,
      `最近观测：${t.observed_at||'无'}；台账更新：${t.updated_at||'无'}`,
      `异常：${t.incident?`${incidentNames[t.incident.category]||t.incident.category} / ${t.incident.status} / ${t.incident.summary}`:'无已登记异常'}`,
      `跟进：${t.monitor?`${monitorNames[t.monitor.status]||t.monitor.status} / ${t.monitor.reason}`:'未登记跟进状态'}`,
      `允许：${t.allowed.join('；')}`, `禁止：${t.forbidden.join('；')}`,
      `最新记录：${t.summary||'无'}`, `验收条件：${t.acceptance.join('；')}`,
      `证据索引：${t.evidence.join('；')}`,
    ].join('\n'),_meta:{'openai/title':`任务：${t.id}`,'openai/group':{title:'天枢'}}}],
    structuredContent:{selectedTask:{key:t.key,id:t.id,revision:t.revision,mandate_version:t.mandate_version}},
  };
}
