import {stateNames} from '../contracts/task-context.mjs';
import type {Task} from '../contracts/types';

export const isFinished=(task:Task)=>['accepted','stopped'].includes(task.state);
export const taskTitle=(task:Task)=>task.display?.title||task.objective;
export const taskProject=(task:Task)=>task.display?.project||'未分配项目';
export const taskStatus=(task:Task)=>task.state==='stopped'?'已结束':stateNames[task.state];
export function taskConclusion(task:Task){
  if(!isFinished(task))return task.summary||'还没有新的进度记录。';
  return task.display?.final_summary||(task.state==='accepted'?'已通过验收，核验依据已保留。':'任务已结束，历史记录已保留。');
}
export const resultTime=(task:Task)=>task.display?.final_at||[...task.transitions].reverse().find(e=>e.state==='accepted'||e.state==='stopped')?.at||task.updated_at;
export function shortTime(value:string|null){if(!value)return '暂无时间';return new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});}
