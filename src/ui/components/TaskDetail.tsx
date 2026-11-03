import {ArrowUpRight,Clock3,ShieldCheck,FileCheck2,History,AlertCircle} from 'lucide-react';
import {Accordion,Disclosure,Button} from './ui';
import {stateNames,incidentNames,monitorNames} from '../../contracts/task-context.mjs';
import {formatTime,type Task} from '../../contracts/types';
import {isFinished,taskTitle,taskProject,taskStatus,taskConclusion,resultTime} from '../presentation';

export function StatusBadge({task}:{task:Task}){return <span className={`status-badge ${task.state}`}><span className="status-dot"/>{taskStatus(task)}</span>;}
function EvidenceList({title,items}:{title:string;items?:string[]}){if(!items?.length)return null;return <section className="evidence-group"><h4>{title}</h4><ul>{items.map((v,i)=><li key={i}>{v}</li>)}</ul></section>;}
export function TaskDetail({task,onAttach,canAttach,attaching,feedback}:{task:Task;onAttach:()=>void;canAttach:boolean;attaching:boolean;feedback:string}){
  const done=isFinished(task);
  return <article className="task-detail" aria-label="任务详情" key={task.key}>
    <div className="detail-toolbar"><span className="detail-breadcrumb"><span>所属项目</span><strong>{taskProject(task)}</strong></span><StatusBadge task={task}/></div>
    <div className="detail-heading"><h2 tabIndex={-1}>{taskTitle(task)}</h2><Button className="primary" disabled={!canAttach||attaching} onClick={onAttach}>{attaching?'正在添加…':'带到聊天'}<ArrowUpRight size={15}/></Button></div>
    <div className="detail-timestamp">{done?'结束于':'最近进展'} {formatTime(done?resultTime(task):task.observed_at)}</div>
    <div className="attachment-feedback" role="status" aria-live="polite">{feedback}</div>
    <section className={`progress-block ${done?'final-result':''}`}><div className="section-label"><h3>{done?'任务结果':'当前进展'}</h3></div><p>{taskConclusion(task)}</p></section>
    {task.incident?.status==='open'&&<section className="notice"><AlertCircle size={17}/><div><strong>{incidentNames[task.incident.category as keyof typeof incidentNames]||'需要关注'}</strong><p>{task.incident.summary}</p></div></section>}
    <Accordion.Root type="multiple" className="detail-sections">
      <Disclosure value="evidence" title="交付与验收"><div className="section-caption"><FileCheck2 size={16}/>{task.verification?.by?`核验者：${task.verification.by}`:'任务的交付与核验依据'}</div><EvidenceList title="结果依据" items={task.display?.evidence}/><EvidenceList title="交付证据" items={task.evidence}/><EvidenceList title="验收依据" items={task.verification?.evidence}/><EvidenceList title="异常依据" items={task.incident?.evidence}/><EvidenceList title="恢复核验" items={task.incident?.verification_evidence}/></Disclosure>
      <Disclosure value="scope" title="目标与边界"><div className="section-caption"><ShieldCheck size={16}/>任务要求、授权范围与验收条件</div><EvidenceList title="任务目标" items={[task.objective]}/><EvidenceList title="允许范围" items={task.allowed}/><EvidenceList title="禁止事项" items={task.forbidden}/><EvidenceList title="验收条件" items={task.acceptance}/></Disclosure>
      <Disclosure value="history" title="执行记录"><div className="section-caption"><Clock3 size={16}/>历史记录仅供追溯，不代表当前状态</div>{task.summary&&<section className="history-observation"><time>{formatTime(task.observed_at)}</time><p>{task.summary}</p></section>}<ol className="timeline">{task.transitions?.map((e,i)=><li key={i}><span>{formatTime(e.at)}</span><strong>{stateNames[e.state]}</strong><p>{e.reason}</p></li>)}</ol>{task.incident&&<EvidenceList title="异常记录" items={[`${task.incident.status}：${task.incident.summary}`]}/>}</Disclosure>
      <Disclosure value="metadata" title="任务信息"><div className="section-caption"><History size={16}/>任务标识与执行信息</div><dl className="metadata">{[['任务 ID',task.id],['来源',task.source_label],['执行主机',task.host_id||'尚未绑定'],['授权版本',task.mandate_version],['记录版本',task.revision],['记录更新',formatTime(task.updated_at)]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{task.monitor&&<p className="metadata-note">{monitorNames[task.monitor.status as keyof typeof monitorNames]}：{task.monitor.reason}。跟进状态不代表执行聊天已停止。</p>}</Disclosure>
    </Accordion.Root>
  </article>;
}
