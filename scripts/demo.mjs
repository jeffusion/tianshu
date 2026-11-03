import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
const directory=resolve('.local/demo');
mkdirSync(directory,{recursive:true});
const db=join(directory,'coordinator.db'),config=join(directory,'config.json');
const python=process.env.TIANSHU_PYTHON||'python3';
const run=(command,input)=>JSON.parse(execFileSync(python,['ledger/coordinator.py','--db',db,command,...(input?['--input','-']:[])],{encoding:'utf8',input:input?JSON.stringify(input):undefined}));
if(!existsSync(db)){
  run('init');
  run('task-create',{task_id:'demo-introduction',objective:'了解天枢的任务、授权和验收流程',owner_thread_id:'demo-owner',owner_host_id:'local',acceptance:['阅读任务详情并理解授权边界'],allowed:['只读浏览演示数据'],forbidden:['发送执行聊天消息','操作真实业务服务'],authorization_source:'用户主动运行独立演示'});
}
if(!existsSync(config))writeFileSync(config,JSON.stringify({sources:[{id:'demo',label:'演示任务',path:db}]},null,2)+'\n');
console.log('Demo configuration: '+config);
if(!process.argv.includes('--prepare-only')){
  const child=spawn(process.execPath,['scripts/dev.mjs'],{stdio:'inherit',env:{...process.env,TIANSHU_CONFIG:config}});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
  child.on('exit',code=>process.exit(code??1));
}
