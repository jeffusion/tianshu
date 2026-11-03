import {existsSync,readFileSync,writeFileSync,mkdirSync,cpSync,renameSync,rmSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {probe} from './probe.mjs';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const print=value=>console.log(JSON.stringify(value,null,2));
const help=`天枢 Tianshu ${pkg.version}\n\n  tianshu init                  初始化独立台账（已有配置不覆盖）\n  tianshu install               将已编译插件安装到 Codex\n  tianshu doctor                检查依赖、配置和已安装 MCP\n  tianshu upgrade               将当前 npm 包同步到插件，保留上一份\n  tianshu rollback              恢复上一份插件/未完成安装，保留台账\n  tianshu uninstall             移除 Codex 插件和市场，保留用户数据\n\n选项：--config <绝对路径>，--help，--version\n环境：TIANSHU_HOME、TIANSHU_PYTHON、TIANSHU_CODEX、CODEX_HOME\n安装 npm 包不会自动修改 Codex。需要 Node.js 24–26、Python 3.12+、Codex CLI。`;

function atomic(path,value){const temp=path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});renameSync(temp,path);}
function run(command,args,options={}){return execFileSync(command,args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},...options});}
function canonical(path){const value=resolve(path);return existsSync(value)?realpathSync(value):value;}
function defaultHome(){return process.platform==='darwin'?join(homedir(),'Library/Application Support/Tianshu'):join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'tianshu');}
function environment(options){
  const requestedHome=resolve(process.env.TIANSHU_HOME||defaultHome());
  if(existsSync(requestedHome)&&lstatSync(requestedHome).isSymbolicLink())throw new Error('TIANSHU_HOME must not be a symbolic link');
  const home=canonical(requestedHome);
  const codexHome=canonical(process.env.CODEX_HOME||join(homedir(),'.codex'));
  const context={home,codexHome,codex:process.env.TIANSHU_CODEX||'codex',python:process.env.TIANSHU_PYTHON||'python3',statePath:join(home,'installation.json'),journal:join(home,'operation.json'),market:join(home,'marketplace'),active:join(home,'marketplace/plugins/tianshu')};
  if(existsSync(home)&&lstatSync(home).isSymbolicLink())throw new Error('TIANSHU_HOME must not be a symbolic link');
  const state=existsSync(context.statePath)?read(context.statePath):null;
  if(state&&(state.schema!==1||state.codex_home!==codexHome))throw new Error('Installation state belongs to a different CODEX_HOME or unsupported schema');
  context.state=state;
  const selected=options.config||process.env.TIANSHU_CONFIG||state?.config||join(home,'config.json');
  if(!isAbsolute(selected))throw new Error('Config path must be absolute');
  context.config=selected;context.explicitConfig=Boolean(options.config||process.env.TIANSHU_CONFIG);
  return context;
}
function owned(c,path){
  const rel=relative(c.home,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Refusing operation outside managed home');
  let current=c.home;
  for(const part of rel.split(/[\\/]/)){current=join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error('Managed path must not contain symbolic links');}
  return path;
}
function stateWrite(c,state){owned(c,c.statePath);if(state)atomic(c.statePath,state);else rmSync(c.statePath,{force:true});}
function preflight(c,needCodex=true){
  if(process.platform==='win32')throw new Error('This release supports macOS/Linux; Windows installation is not validated');
  const node=Number(process.versions.node.split('.')[0]);if(node<24||node>26)throw new Error('Node.js 24–26 is required');
  const python=JSON.parse(run(c.python,['-c','import sys,json;print(json.dumps({"version":list(sys.version_info[:2]),"path":sys.executable}))']));
  if(python.version[0]!==3||python.version[1]<12)throw new Error('Python 3.12+ is required');c.python=python.path;
  if(needCodex)run(c.codex,['--version'],{env:{...process.env,CODEX_HOME:c.codexHome}});
}
function codex(c,args){return JSON.parse(run(c.codex,args,{env:{...process.env,CODEX_HOME:c.codexHome}}));}
function registeredMarket(c){const result=codex(c,['plugin','marketplace','list','--json']);const list=Array.isArray(result)?result:result.marketplaces;if(!Array.isArray(list))throw new Error('Unsupported Codex marketplace listing');return list.find(m=>m.name==='tianshu')||null;}
function register(c,path){
  if(registeredMarket(c))codex(c,['plugin','marketplace','remove','tianshu','--json']);
  codex(c,['plugin','marketplace','add',path,'--json']);
  const result=codex(c,['plugin','add','tianshu@tianshu','--json']);
  return result.installedPath;
}
function verifyBundle(plugin,manifest){
  if(lstatSync(plugin).isSymbolicLink())throw new Error('Plugin root must not be a symlink');
  const actual=[];
  function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isSymbolicLink())throw new Error('Plugin payload contains symlinks');if(e.isDirectory())walk(p);else if(e.isFile())actual.push(relative(plugin,p).split('\\').join('/'));else throw new Error('Unsupported payload entry');}}
  walk(plugin);const expected=Object.keys(manifest.files||{}).sort();
  if(!expected.length||JSON.stringify(actual.sort())!==JSON.stringify(expected))throw new Error('Plugin payload inventory mismatch');
  for(const path of expected){if(isAbsolute(path)||path.split(/[\\/]/).includes('..'))throw new Error('Invalid integrity path');const hash=createHash('sha256').update(readFileSync(join(plugin,path))).digest('hex');if(hash!==manifest.files[path])throw new Error('Plugin integrity check failed: '+path);}
  const info=read(join(plugin,'build-info.json'));
  if(info.name!=='tianshu'||!/^[0-9a-f]{20}$/.test(info.build_id)||!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(info.version))throw new Error('Invalid plugin identity');
  return info;
}
function archive(c){
  const source=join(packageRoot,'dist/plugin'),integrity=read(join(packageRoot,'dist/build-info.json'));
  const info=verifyBundle(source,integrity),id=info.version+'-'+info.build_id;
  const directory=owned(c,join(c.home,'releases',id));mkdirSync(owned(c,join(c.home,'releases')),{recursive:true,mode:0o700});
  if(!existsSync(directory)){
    const stage=owned(c,join(c.home,'releases','.stage-'+randomUUID()));mkdirSync(stage,{mode:0o700});
    try{cpSync(source,join(stage,'plugin'),{recursive:true});atomic(join(stage,'integrity.json'),integrity);renameSync(stage,directory);}finally{rmSync(stage,{recursive:true,force:true});}
  }
  if(JSON.stringify(read(join(directory,'integrity.json')).files)!==JSON.stringify(integrity.files))throw new Error('Build identity collision; existing release was preserved');
  verifyBundle(owned(c,join(directory,'plugin')),read(owned(c,join(directory,'integrity.json'))));
  return {id,directory,info};
}
function previousRelease(c,id){
  if(!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?-[0-9a-f]{20}$/.test(id||''))throw new Error('No previous managed plugin is available');
  const directory=owned(c,join(c.home,'releases',id)),info=verifyBundle(owned(c,join(directory,'plugin')),read(owned(c,join(directory,'integrity.json'))));
  return {id,directory,info};
}
function validateConfig(c){
  const result=JSON.parse(run(c.python,[join(packageRoot,'dist/plugin/ledger/read_ledger.py'),'--config',c.config]));
  if(!result.sources?.length||result.sources.some(s=>!s.ok))throw new Error('Configured ledger is missing or unhealthy; no replacement database was created');
  return result;
}
function initialize(c){
  if(existsSync(c.config)){validateConfig(c);return false;}
  if(c.explicitConfig)throw new Error('Explicit config does not exist; configure an existing ledger or run init without --config');
  const data=owned(c,join(c.home,'data'));mkdirSync(data,{recursive:true,mode:0o700});
  const db=owned(c,join(data,'coordinator.db'));
  if(!existsSync(db))run(c.python,[join(packageRoot,'dist/plugin/ledger/coordinator.py'),'--db',db,'init']);
  const temp=owned(c,join(c.home,'.config-'+randomUUID()+'.json'));
  const config={sources:[{id:'daily',label:'日常任务',path:db}]};
  try{atomic(temp,config);const candidate={...c,config:temp};validateConfig(candidate);writeFileSync(owned(c,c.config),JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});}finally{rmSync(temp,{force:true});}
  return true;
}
function marketplaceFile(c){
  mkdirSync(owned(c,join(c.market,'.agents/plugins')),{recursive:true,mode:0o700});
  atomic(join(c.market,'.agents/plugins/marketplace.json'),{name:'tianshu',interface:{displayName:'天枢'},plugins:[{name:'tianshu',source:{source:'local',path:'./plugins/tianshu'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]});
}
async function recover(c){
  const journal=read(owned(c,c.journal));
  if(journal.codex_home!==c.codexHome||!/^\.backup-[0-9a-f-]+$/.test(journal.backup))throw new Error('Invalid recovery record');
  const backup=owned(c,join(c.home,journal.backup));
  if(existsSync(backup)){rmSync(owned(c,c.active),{recursive:true,force:true});mkdirSync(dirname(c.active),{recursive:true});renameSync(backup,c.active);}
  else if(!journal.had_active)rmSync(owned(c,c.active),{recursive:true,force:true});
  if(journal.before_market){register(c,journal.before_market);}
  else{codex(c,['plugin','remove','tianshu@tianshu','--json']);if(registeredMarket(c))codex(c,['plugin','marketplace','remove','tianshu','--json']);}
  stateWrite(c,journal.before_state);rmSync(c.journal);return {recovered:true,data_preserved:true};
}
async function install(c,release){
  const beforeMarket=registeredMarket(c);
  if(beforeMarket&&canonical(beforeMarket.root)!==canonical(c.market)&&!c.explicitConfig&&!c.state)throw new Error('An existing Tianshu installation was found. Use --config with its existing configuration to preserve tasks.');
  initialize(c);validateConfig(c);
  const stage=owned(c,join(c.home,'.stage-'+randomUUID())),backup='.backup-'+randomUUID(),backupPath=owned(c,join(c.home,backup));
  mkdirSync(stage,{mode:0o700});
  try{
    cpSync(join(release.directory,'plugin'),stage,{recursive:true});
    atomic(join(stage,'runtime-config.json'),{config_path:c.config});
    const cache=join(c.codexHome,'plugins/cache/tianshu/tianshu',release.info.version);
    atomic(join(stage,'.mcp.json'),{mcpServers:{tianshu:{command:process.execPath,args:[join(cache,'dist/server.mjs')],env:{TIANSHU_PYTHON:c.python,TIANSHU_CONFIG:c.config,PYTHONDONTWRITEBYTECODE:'1'}}}});
    await probe(join(stage,'dist/server.mjs'),c.python,c.config);
    const journal={codex_home:c.codexHome,backup,had_active:existsSync(c.active),before_state:c.state,before_market:beforeMarket?.root||null};
    atomic(owned(c,c.journal),journal);
    try{
      mkdirSync(owned(c,dirname(c.active)),{recursive:true,mode:0o700});
      if(journal.had_active)renameSync(c.active,backupPath);renameSync(stage,c.active);marketplaceFile(c);
      const installed=register(c,c.market);if(!installed||canonical(installed)!==canonical(cache))throw new Error('Unexpected Codex installed path: '+installed);
      const health=await probe(join(cache,'dist/server.mjs'),c.python,c.config);
      if(health.build?.build_id!==release.info.build_id)throw new Error('Installed build does not match requested build');
      const previous=c.state?.active===release.id?c.state.previous:c.state?.active||null;
      stateWrite(c,{schema:1,codex_home:c.codexHome,active:release.id,previous,config:c.config,installed:true,installed_at:new Date().toISOString(),adopted_marketplace:c.state?.adopted_marketplace||(beforeMarket?.root!==c.market?beforeMarket?.root:null)});
      rmSync(c.journal);rmSync(backupPath,{recursive:true,force:true});
      return {installed:true,plugin:'tianshu@tianshu',...release.info,health,data_preserved:true,reload_client:true};
    }catch(error){
      try{await recover(c);}catch{throw new Error('Install failed and recovery is incomplete. Run tianshu rollback after checking Codex availability; user data was preserved.');}
      throw new Error('Install failed; previous plugin restored: '+error.message);
    }
  }finally{rmSync(stage,{recursive:true,force:true});}
}
async function lock(c){
  mkdirSync(c.home,{recursive:true,mode:0o700});const path=owned(c,join(c.home,'lifecycle.lock'));
  // Kernel flock is released on exit/crash. Never unlink the stable lock inode.
  const code='import os,sys,fcntl; fd=os.open(sys.argv[1],os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600); fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB); print("LOCKED",flush=True); sys.stdin.buffer.read()';
  const child=spawn(c.python,['-c',code,path],{stdio:['pipe','pipe','pipe']});child.stderr.resume();
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('Lifecycle lock timed out'));},5000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.stdout.once('data',data=>{clearTimeout(timer);data.toString().trim()==='LOCKED'?resolve():reject(new Error('Lifecycle lock failed'));});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('Another lifecycle operation is running or lock acquisition failed'));});
  });
  return ()=>new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),1000);child.once('close',()=>{clearTimeout(timer);resolve();});child.stdin.end();});
}

export async function main(argv=process.argv.slice(2)){
  if(!argv.length||argv.includes('--help'))return console.log(help);
  if(argv.length===1&&argv[0]==='--version')return console.log(pkg.version);
  const command=argv.shift(),options={};
  for(let i=0;i<argv.length;i++){if(argv[i]==='--config'&&argv[i+1])options.config=argv[++i];else throw new Error('Unknown option: '+argv[i]);}
  if(!['init','install','upgrade','rollback','uninstall','doctor'].includes(command))throw new Error('Unknown command: '+command);
  const c=environment(options);preflight(c,command!=='init');
  if(command==='doctor'){
    if(existsSync(c.journal))throw new Error('An interrupted lifecycle operation requires tianshu rollback');
    if(!c.state?.installed)throw new Error('Plugin is not installed by this CLI; run tianshu install');
    validateConfig(c);const release=previousRelease(c,c.state.active),cache=join(c.codexHome,'plugins/cache/tianshu/tianshu',release.info.version);
    const market=registeredMarket(c);if(!market||canonical(market.root)!==canonical(c.market))throw new Error('Codex marketplace does not match this installation');
    const health=await probe(join(cache,'dist/server.mjs'),c.python,c.config);if(health.build?.build_id!==release.info.build_id)throw new Error('Installed build drift detected');
    return print({ok:true,home:c.home,config:c.config,health,host_ui_verified:false});
  }
  if(command==='install')mkdirSync(c.codexHome,{recursive:true,mode:0o700});
  const unlock=await lock(c);
  try{
    // Re-read mutable installation state only after acquiring the lifecycle lock.
    const python=c.python;Object.assign(c,environment(options),{python});
    if(existsSync(c.journal)){if(command!=='rollback')throw new Error('An interrupted operation requires tianshu rollback');return print(await recover(c));}
    if(command==='init'){initialize(c);return print({initialized:true,config:c.config});}
    if(command==='uninstall'){
      const market=registeredMarket(c);if(market&&canonical(market.root)!==canonical(c.market))throw new Error('Refusing to remove an installation managed elsewhere');
      if(market&&!c.state?.installed)throw new Error('Managed installation state is missing or inconsistent; reinstall before uninstalling');
      if(c.state?.installed){
        atomic(owned(c,c.journal),{codex_home:c.codexHome,backup:'.backup-'+randomUUID(),had_active:existsSync(c.active),before_state:c.state,before_market:market?.root||null});
        try{codex(c,['plugin','remove','tianshu@tianshu','--json']);if(market)codex(c,['plugin','marketplace','remove','tianshu','--json']);stateWrite(c,{...c.state,installed:false});rmSync(c.journal);}
        catch(error){try{await recover(c);}catch{throw new Error('Uninstall recovery is incomplete; run tianshu rollback. User data was preserved.');}throw new Error('Uninstall failed; previous plugin restored: '+error.message);}
      }
      return print({uninstalled:true,data_preserved:true,home:c.home});
    }
    if(command==='upgrade'&&!c.state?.installed)throw new Error('No managed installation; run tianshu install first');
    const release=command==='rollback'?previousRelease(c,c.state?.previous):archive(c);
    return print(await install(c,release));
  }finally{await unlock();}
}
