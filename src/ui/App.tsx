import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ChevronRight,ClipboardList,Folder,LoaderCircle,Moon,Sun,RefreshCw,Search,SearchX,X} from 'lucide-react';
import {Button,IconButton,StatusSelect,FilterSelect,Tooltip,type Filter} from './components/ui';
import {StatusBadge,TaskDetail} from './components/TaskDetail';
import {needsAttention,signature} from '../contracts/task-context.mjs';
import {formatTime,type Snapshot,type TaskBridge,type Task} from '../contracts/types';
import {isFinished,taskTitle,taskProject,taskConclusion,resultTime,shortTime} from './presentation';
import {brand} from './brand';

export function TaskCenter({bridge,preview=false}:{bridge:TaskBridge;preview?:boolean}){
  useEffect(()=>{
    const root=document.documentElement;
    const keyboard=(event:KeyboardEvent)=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(event.key))root.dataset.inputModality='keyboard';};
    const pointer=()=>{root.dataset.inputModality='pointer';};
    document.addEventListener('keydown',keyboard,true);
    document.addEventListener('pointerdown',pointer,true);
    return ()=>{document.removeEventListener('keydown',keyboard,true);document.removeEventListener('pointerdown',pointer,true);};
  },[]);
  const [previewTheme,setPreviewTheme]=useState(document.documentElement.dataset.theme||'dark');
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[selected,setSelected]=useState<string|null>(null);
  const [projectFilter,setProjectFilter]=useState('all'),[query,setQuery]=useState(''),[filter,setFilter]=useState<Filter>('all'),[error,setError]=useState('');
  const [ready,setReady]=useState(false),[canAttach,setCanAttach]=useState(false),[refreshing,setRefreshing]=useState(false),[attaching,setAttaching]=useState(false);
  const [attached,setAttached]=useState<{key:string;signature:string}|null>(null),[attachmentError,setAttachmentError]=useState<{key:string;message:string}|null>(null),[mobileDetail,setMobileDetail]=useState(false);
  useEffect(()=>{let active=true;void bridge.start(data=>{if(active)setSnapshot(data);},capable=>{if(active){setReady(true);setCanAttach(capable);}}).catch(e=>{if(active)setError(String(e.message||e));});return ()=>{active=false;bridge.close();};},[bridge]);
  const detailRef=useRef<HTMLElement>(null),listRef=useRef<HTMLElement>(null),wasDetail=useRef(false);
  const tasks=snapshot?.tasks||[];
  const projects=[...new Set(tasks.map(taskProject))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const projectOptions=[{value:'all',label:'全部项目'},...projects.map(p=>({value:'project:'+p,label:p}))];
  // Keep a selected project visible in the menu if its last task disappears on refresh.
  if(projectFilter!=='all'&&!projectOptions.some(p=>p.value===projectFilter))projectOptions.push({value:projectFilter,label:projectFilter.slice(8)+'（暂无任务）'});
  const visible=useMemo(()=>tasks.filter(t=>projectFilter==='all'||'project:'+taskProject(t)===projectFilter).filter(t=>(t.id+' '+t.objective+' '+taskTitle(t)+' '+taskProject(t)).toLowerCase().includes(query.trim().toLowerCase())).filter(t=>filter==='all'||(filter==='attention'?needsAttention(t):filter==='done'?['accepted','stopped'].includes(t.state):t.state==='running')),[snapshot,query,filter,projectFilter]);
  const current=visible.find(t=>t.key===selected)||visible[0];
  useEffect(()=>{if(mobileDetail)detailRef.current?.querySelector<HTMLElement>('h2')?.focus();else if(wasDetail.current)listRef.current?.querySelector<HTMLElement>('[aria-pressed=true]')?.focus();wasDetail.current=mobileDetail;},[mobileDetail,current?.key]);
  const pending=tasks.filter(needsAttention).length,running=tasks.filter(t=>t.state==='running').length;
  const feedback=(attachmentError?.key===current?.key?attachmentError?.message:'')||(current&&attached?.key===current.key?(attached?.signature===signature(current)?'已带到聊天，在输入框继续提出你的要求。':'任务已有更新，请重新带到聊天。'):'');
  async function refresh(){if(!ready||refreshing)return;setRefreshing(true);setError('');try{setSnapshot(await bridge.refresh());}catch(e){setError((e as Error).message);}finally{setRefreshing(false);}}
  async function attach(task:Task){if(attaching)return;setAttaching(true);setAttachmentError(null);try{await bridge.attach(task);setAttached({key:task.key,signature:signature(task)});}catch(e){setAttachmentError({key:task.key,message:'添加失败：'+(e as Error).message});}finally{setAttaching(false);}}
  const sourceErrors=snapshot?.sources.filter(s=>!s.ok).map(s=>`${s.label}：${s.error}`).join('；');
  return <Tooltip.Provider delayDuration={350}>
    <main className="task-center">
      <header className="app-header"><div className="app-heading"><div className="brand-name"><h1>{brand.name}</h1><span>{brand.englishName}</span></div><span className="workspace-name">{brand.workspace}</span><span className="header-count">{tasks.length} 项任务</span></div><div className="header-actions">{preview&&<><span className="preview-label">预览 · 未安装</span><IconButton label={previewTheme==='dark'?'查看浅色预览':'查看深色预览'} onClick={()=>{const theme=previewTheme==='dark'?'light':'dark';setPreviewTheme(theme);document.documentElement.dataset.theme=theme;}}>{previewTheme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</IconButton></>}<IconButton label="刷新任务" disabled={!ready||refreshing} onClick={refresh}><RefreshCw className={refreshing?'spinning':''} size={17}/></IconButton></div></header>
      <div className="toolbar"><div className="search-field"><Search size={17}/><input aria-label="搜索任务" value={query} onChange={e=>{setQuery(e.target.value);setMobileDetail(false);}} placeholder="搜索任务"/>{query&&<IconButton label="清除搜索" onClick={()=>setQuery('')}><X size={14}/></IconButton>}</div><FilterSelect label="筛选所属项目" value={projectFilter} options={projectOptions} onChange={v=>{setProjectFilter(v);setMobileDetail(false);}}/><StatusSelect value={filter} onChange={v=>{setFilter(v);setMobileDetail(false);}}/></div>
      {(error||sourceErrors)&&<div className="error-banner" role="alert">{error||sourceErrors}</div>}
      {!snapshot?<div className="loading-state"><LoaderCircle className="spinning" size={22}/><p>{error?'暂时无法读取任务':'正在读取任务台账'}</p>{error&&<Button onClick={refresh} disabled={!ready}>重试</Button>}</div>:<div className="task-workspace" data-mobile-detail={mobileDetail}>
        <aside ref={listRef} className="list-pane" aria-label="任务列表"><div className="list-label"><span>{running?`${running} 项执行中`:pending?`${pending} 项待处理`:tasks.length&&tasks.every(isFinished)?'所有任务均已结束':`${tasks.length} 项任务`}</span></div>{[...new Set(visible.map(taskProject))].map(project=><section className="project-group" key={project} aria-label={`${project} 项目`}><div className="project-label"><Folder size={14}/><h2><span>项目 · </span>{project}</h2><span>{visible.filter(t=>taskProject(t)===project).length} 项任务</span></div><div className="task-list">{visible.filter(t=>taskProject(t)===project).map(t=><button type="button" key={t.key} className="task-row" aria-pressed={current?.key===t.key} aria-label={`选择任务 ${t.id}`} onClick={()=>{setSelected(t.key);setAttachmentError(null);setMobileDetail(true);}}><div className="task-row-top"><h2>{taskTitle(t)}</h2><StatusBadge task={t}/></div><p>{taskConclusion(t)}</p><div className="task-row-footer"><time>{shortTime(isFinished(t)?resultTime(t):t.observed_at)}</time><ChevronRight size={14}/></div></button>)}</div></section>)}{!visible.length&&<div className="list-empty"><SearchX size={25}/><strong>没有匹配的任务</strong><p>试试其他项目、关键词或状态</p></div>}</aside>
        <section ref={detailRef} className="detail-pane"><Button className="back-button" onClick={()=>setMobileDetail(false)}><ArrowLeft size={16}/>返回任务列表</Button>{current?<TaskDetail key={current.key} task={current} canAttach={canAttach} attaching={attaching} onAttach={()=>void attach(current)} feedback={feedback}/>:<div className="detail-empty"><div><ClipboardList size={26}/></div><h2>从一个任务开始</h2><p>在左侧选择任务，查看进度与交付。<br/>带到聊天后，直接说出你的要求。</p></div>}</section>
      </div>}
      <footer className="app-footer"><span className="sync-state"><span className="sync-dot"/>{snapshot?`最近同步 ${formatTime(snapshot.read_at)}`:'连接中'}</span><span>{preview?'只读预览 · 不修改任务、不发送附件':'在聊天中 @天枢，继续推进任务'}</span></footer>
    </main>
  </Tooltip.Provider>;
}
