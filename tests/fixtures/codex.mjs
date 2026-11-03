#!/usr/bin/env node
import {readFileSync,writeFileSync,existsSync,rmSync,cpSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const args=process.argv.slice(2);
if(args[0]==='--version'){
  if(process.env.FAKE_PREFLIGHT_PAUSE_DIR){
    const dir=process.env.FAKE_PREFLIGHT_PAUSE_DIR;writeFileSync(join(dir,'ready'),'ready');const deadline=Date.now()+15000;
    while(!existsSync(join(dir,'release'))){if(Date.now()>deadline)throw new Error('Fixture preflight pause timed out');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}
  }
  console.log('codex-cli fixture');process.exit(0);
}
const file=join(process.env.CODEX_HOME,'fixture.json');mkdirSync(process.env.CODEX_HOME,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const state=existsSync(file)?read(file):{markets:[],plugin:null};
const done=result=>{writeFileSync(file,JSON.stringify(state));console.log(JSON.stringify(result));};
if(args[0]!=='plugin')throw new Error('Unsupported fixture command');
if(args[1]==='marketplace'){
  if(args[2]==='list')done({marketplaces:state.markets});
  else if(args[2]==='remove'){if(process.env.FAKE_FAIL_REMOVE_MARKET&&existsSync(process.env.FAKE_FAIL_REMOVE_MARKET)){rmSync(process.env.FAKE_FAIL_REMOVE_MARKET);process.exit(1);}state.markets=state.markets.filter(m=>m.name!==args[3]);done({marketplaceName:args[3]});}
  else if(args[2]==='add'){const root=resolve(args[3]),manifest=read(join(root,'.agents/plugins/marketplace.json'));state.markets=state.markets.filter(m=>m.name!==manifest.name);state.markets.push({name:manifest.name,root});done({marketplaceName:manifest.name});}
  else throw new Error('Unsupported marketplace command');
}else if(args[1]==='add'){
  if(process.env.FAKE_CRASH_ONCE&&existsSync(process.env.FAKE_CRASH_ONCE)){rmSync(process.env.FAKE_CRASH_ONCE);process.kill(process.ppid,'SIGKILL');process.exit(1);}
  if(process.env.FAKE_FAIL_ONCE_FILE&&existsSync(process.env.FAKE_FAIL_ONCE_FILE)){rmSync(process.env.FAKE_FAIL_ONCE_FILE);console.error('Fixture install failure');process.exit(1);}
  const market=state.markets.find(m=>m.name==='tianshu');if(!market)throw new Error('Missing market');
  const source=join(market.root,'plugins/tianshu'),manifest=read(join(source,'.codex-plugin/plugin.json'));
  const target=join(process.env.CODEX_HOME,'plugins/cache/tianshu/tianshu',manifest.version);rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});cpSync(source,target,{recursive:true});state.plugin=target;
  if(process.env.FAKE_BAD_HEALTH_ONCE&&existsSync(process.env.FAKE_BAD_HEALTH_ONCE)){rmSync(process.env.FAKE_BAD_HEALTH_ONCE);const info=read(join(target,'build-info.json'));info.build_id='0'.repeat(20);writeFileSync(join(target,'build-info.json'),JSON.stringify(info));}
  done({pluginId:'tianshu@tianshu',installedPath:target,version:manifest.version});
}else if(args[1]==='remove'){
  if(state.plugin)rmSync(state.plugin,{recursive:true,force:true});state.plugin=null;done({removed:true});
}else throw new Error('Unsupported fixture plugin command');
