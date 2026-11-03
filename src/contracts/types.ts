export type TaskState='queued'|'running'|'waiting_human'|'waiting_external'|'ready'|'accepted'|'failed'|'stopped';
export interface Task {
  display?:{title?:string;project?:string;final_summary?:string;final_at?:string;evidence?:string[]};
  key:string; id:string; objective:string; state:TaskState; source_label:string;
  revision:number; mandate_version:number; host_id:string; thread_id:string;
  observed_at:string|null; updated_at:string|null;
  summary:string; acceptance:string[]; allowed:string[]; forbidden:string[]; evidence:string[];
  verification:null|{by:string;at:string;evidence:string[]};
  incident:null|{category:string;status:string;summary:string;evidence:string[];verification_evidence:string[]};
  monitor:null|{status:string;reason:string};
  transitions:{at:string;state:TaskState;reason:string}[];
}
export interface Snapshot {tasks:Task[];sources:{id:string;label:string;ok:boolean;error?:string;count?:number}[];read_at:string;readonly:boolean}
export interface TaskBridge {
  start(onData:(data:Snapshot)=>void,onReady:(canAttach:boolean)=>void):Promise<void>;
  refresh():Promise<Snapshot>;
  attach(task:Task):Promise<void>;
  close():void;
}
export const formatTime=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚无记录';
