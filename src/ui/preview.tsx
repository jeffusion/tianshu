import {createRoot} from 'react-dom/client';
import {TaskCenter} from './App';
import type {TaskBridge} from '../contracts/types';
import hostColors from './preview-host-colors.json';
import './styles.css';
if(!import.meta.env.DEV)throw new Error('Preview is development-only');
const params=new URLSearchParams(location.search);
document.documentElement.dataset.theme=params.get('theme')||'dark';
// Development-only reproduction of the light-theme variables observed in Codex.
if(params.get('host')==='codex')for(const [key,value] of Object.entries(hostColors))document.documentElement.style.setProperty(key,value);
const load=async()=>{const r=await fetch('/__preview-snapshot.json');if(!r.ok)throw new Error('缺少开发快照');return r.json();};
const bridge:TaskBridge={async start(onData,onReady){onReady(true);onData(await load());},refresh:load,async attach(){throw new Error('开发预览不会写入聊天附件，请在正式客户端验证。');},close(){}};
createRoot(document.getElementById('root')!).render(<TaskCenter bridge={bridge} preview/>);
