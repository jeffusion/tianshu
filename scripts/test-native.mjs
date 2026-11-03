// Explicit integration check, never invoked by ordinary CI. All host/data state is temporary.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=mkdtempSync(join(tmpdir(),'tianshu-native-'));
const local=process.argv.includes('--local');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const catalog=JSON.parse(readFileSync('.agents/plugins/marketplace.json','utf8'));
const env={...process.env,CODEX_HOME:join(root,'codex'),TIANSHU_HOME:join(root,'data'),PYTHONDONTWRITEBYTECODE:'1',npm_config_cache:join(root,'npm-cache')};
delete env.TIANSHU_CONFIG;
const run=(cmd,args)=>execFileSync(cmd,args,{env,cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
const codex=args=>JSON.parse(run('codex',[...args,'--json']));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
let child,stderr='';
try{
  mkdirSync(env.CODEX_HOME,{recursive:true});
  // Only explicit init writes an independent fixture database.
  run(process.execPath,[resolve('dist/package/bin/tianshu.mjs'),'init']);
  const configPath=join(env.TIANSHU_HOME,'config.json');
  const config=JSON.parse(readFileSync(configPath,'utf8')),db=config.sources[0].path;
  const engine=resolve('dist/package/ledger/coordinator.py');
  const mutate=(command,input)=>JSON.parse(execFileSync('python3',[engine,'--db',db,command,'--input','-'],{env,encoding:'utf8',input:JSON.stringify(input)}));
  mutate('task-create',{task_id:'preserved',objective:'Native installation data retention',owner_thread_id:'fixture-owner',owner_host_id:'local',acceptance:['preserve'],allowed:['fixture'],forbidden:['production'],authorization_source:'isolated native test'});
  mutate('task-create',{task_id:'archive',objective:'Preserve deletion audit',owner_thread_id:'fixture-owner',owner_host_id:'local',acceptance:['audit retained'],allowed:['fixture'],forbidden:['production'],authorization_source:'isolated native test'});
  mutate('task-transition',{task_id:'archive',expected_revision:1,state:'stopped',reason:'fixture',stop_authorization_source:'fixture user',execution_stop_evidence:'unbound fixture'});
  mutate('task-delete',{task_id:'archive',expected_revision:2,reason:'fixture cleanup',authorization_source:'isolated native test'});
  const before=hash(db),configBefore=hash(configPath);
  const market=join(root,'catalog');mkdirSync(join(market,'.agents/plugins'),{recursive:true});
  if(local)catalog.plugins[0].source={source:'local',path:'./plugin'};
  if(local)cpSync(resolve('dist/package'),join(market,'plugin'),{recursive:true});
  writeFileSync(join(market,'.agents/plugins/marketplace.json'),JSON.stringify(catalog));
  const registered=codex(['plugin','marketplace','add',market]);
  const installed=codex(['plugin','add','tianshu@jeffusion']);
  assert.ok(installed.installedPath);assert.equal(installed.version,pkg.version);
  // Launch the actual host runtime: it, not this script, resolves the plugin-relative cwd and loads MCP.
  child=spawn('codex',['app-server','--stdio'],{env,cwd:root,stdio:['pipe','pipe','pipe']});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});let buffer='',id=0;const pending=new Map();
  child.stdout.on('data',chunk=>{
    buffer+=chunk.toString();let index;
    while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.trim())continue;
      const message=JSON.parse(line);const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}
    }
  });
  const request=(method,params)=>new Promise((resolve,reject)=>{
    const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Host request timed out: '+method));},30000);
    pending.set(requestId,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    child.stdin.write(JSON.stringify({id:requestId,method,params})+'\n');
  });
  await request('initialize',{clientInfo:{name:'tianshu_native_test',version:'1'},capabilities:{experimentalApi:true}});
  child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  const status=await request('mcpServerStatus/list',{});
  const server=status.data.find(s=>s.pluginId==='tianshu@jeffusion');
  assert.ok(server,JSON.stringify(status));assert.equal(server.toolsError,null);
  assert.deepEqual(Object.keys(server.tools).map(key=>key.split('__').at(-1)).sort(),['delete_task','get_task','list_tasks','open_workspace']);
  const doctor=JSON.parse(run(process.execPath,[join(installed.installedPath,'bin/tianshu.mjs'),'doctor']));
  assert.equal(doctor.ok,true);assert.equal(doctor.health.task_count,1);
  await new Promise(resolve=>{child.once('close',resolve);child.kill();});child=undefined;
  const removed=codex(['plugin','remove','tianshu@jeffusion']);
  codex(['plugin','marketplace','remove','jeffusion']);
  assert.equal(hash(db),before);assert.equal(hash(configPath),configBefore);
  console.log(JSON.stringify({ok:true,source:local?'local':'npm',package:pkg.name,version:pkg.version,registered,installed,host_tools:Object.keys(server.tools),doctor,removed,data_preserved:true,config_preserved:true,task_and_deletion_audit_preserved:true,host_ui_verified:false},null,2));
}catch(error){console.error(stderr);console.error('Fixture: '+root);throw error;}finally{child?.kill();if(!process.env.TIANSHU_KEEP_FIXTURE)rmSync(root,{recursive:true,force:true});}
