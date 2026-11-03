import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,readdirSync,mkdirSync,cpSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));

test('real npm package installs offline without sources and preserves data across lifecycle operations',async()=>{
  const root=mkdtempSync(join(tmpdir(),'tianshu-package-'));
  const env={...process.env,npm_config_cache:join(root,'npm-cache'),npm_config_update_notifier:'false',PYTHONDONTWRITEBYTECODE:'1',TIANSHU_HOME:join(root,'data-home'),CODEX_HOME:join(root,'codex-home'),TIANSHU_CODEX:resolve('tests/fixtures/codex.mjs')};
  delete env.TIANSHU_CONFIG;
  const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',env:{...env,...extra},timeout:60000,stdio:['pipe','pipe','pipe']});
  let keep=false;
  try{
    const packed=JSON.parse(run('npm',['pack','--ignore-scripts','--json','--pack-destination',root]))[0];
    assert.equal(packed.name,'@jeffusion/tianshu');assert.equal(packed.version,'0.1.0');
    const files=packed.files.map(f=>f.path);
    assert.ok(files.includes('bin/tianshu.mjs'));assert.ok(files.includes('dist/plugin/.codex-plugin/plugin.json'));assert.ok(files.includes('dist/plugin/THIRD_PARTY_NOTICES.txt'));
    assert.ok(files.every(f=>f==='package.json'||f==='README.md'||f==='LICENSE'||f==='docs/npm-distribution.md'||f.startsWith('bin/')||f.startsWith('cli/')||f.startsWith('dist/plugin/')||f==='dist/build-info.json'));
    assert.ok(!files.some(f=>/runtime-config\.json|\.db$|node_modules|docs\/acceptance/.test(f)));
    const prefix=join(root,'prefix');run('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--offline','--no-audit','--no-fund',join(root,packed.filename)]);
    const cli=join(prefix,'bin/tianshu');
    const installed=join(prefix,'lib/node_modules/@jeffusion/tianshu');
    assert.ok(!existsSync(join(installed,'src')));assert.ok(!Object.keys(read(join(installed,'package.json')).dependencies||{}).length);
    assert.equal(run(cli,['--version']).trim(),'0.1.0');assert.ok(run(cli,['--help']).includes('doctor'));
    const command=(name,extra={},args=[])=>JSON.parse(run(cli,[name,...args],extra));
    assert.equal(command('init').initialized,true);
    const config=read(join(env.TIANSHU_HOME,'config.json')),db=config.sources[0].path;
    // Add an actual task through the shipped Python engine; lifecycle operations must preserve every byte.
    const taskInput=join(root,'task.json');writeFileSync(taskInput,JSON.stringify({task_id:'packaged-user-task',objective:'Preserve this task',owner_thread_id:'fixture-owner',owner_host_id:'local',acceptance:['preserved'],allowed:['fixture'],forbidden:['production'],authorization_source:'isolated npm lifecycle test'}));
    run('python3',[join(installed,'dist/plugin/ledger/coordinator.py'),'--db',db,'task-create','--input',taskInput]);
    const before=hash(db);
    assert.equal(command('install').health.task_count,1);assert.equal(command('doctor').ok,true);
    assert.equal(command('install').installed,true);assert.equal(hash(db),before);
    const oldState=read(join(env.TIANSHU_HOME,'installation.json'));
    const payload=join(installed,'dist/plugin');
    const info=read(join(payload,'build-info.json'));info.build_id='f'.repeat(20);writeFileSync(join(payload,'build-info.json'),JSON.stringify(info));
    const integrity=read(join(installed,'dist/build-info.json'));integrity.build_id=info.build_id;integrity.files['build-info.json']=hash(join(payload,'build-info.json'));writeFileSync(join(installed,'dist/build-info.json'),JSON.stringify(integrity));
    const marker=join(root,'fail-once');writeFileSync(marker,'fixture');
    assert.throws(()=>command('upgrade',{FAKE_FAIL_ONCE_FILE:marker}),/Command failed/);
    assert.deepEqual(read(join(env.TIANSHU_HOME,'installation.json')),oldState);assert.equal(command('doctor').ok,true);assert.equal(hash(db),before);
    writeFileSync(marker,'fixture');
    assert.throws(()=>command('upgrade',{FAKE_BAD_HEALTH_ONCE:marker}),/Command failed/);
    assert.deepEqual(read(join(env.TIANSHU_HOME,'installation.json')),oldState);assert.equal(command('doctor').ok,true);
    writeFileSync(marker,'fixture');
    assert.throws(()=>command('upgrade',{FAKE_CRASH_ONCE:marker}),/Command failed/);
    assert.ok(existsSync(join(env.TIANSHU_HOME,'operation.json')));
    assert.equal(command('rollback').recovered,true);assert.equal(command('doctor').ok,true);assert.equal(hash(db),before);
    // C starts with state A and pauses before locking; B commits, then C fails.
    // Recovery must restore B, never C's stale preflight state A.
    const candidate=join(root,'candidate-c');cpSync(installed,candidate,{recursive:true});
    const cInfo=read(join(candidate,'dist/plugin/build-info.json'));cInfo.build_id='e'.repeat(20);writeFileSync(join(candidate,'dist/plugin/build-info.json'),JSON.stringify(cInfo));
    const cIntegrity=read(join(candidate,'dist/build-info.json'));cIntegrity.build_id=cInfo.build_id;cIntegrity.files['build-info.json']=hash(join(candidate,'dist/plugin/build-info.json'));writeFileSync(join(candidate,'dist/build-info.json'),JSON.stringify(cIntegrity));
    const pause=join(root,'pause');mkdirSync(pause);writeFileSync(marker,'fixture');
    const contender=spawn(process.execPath,[join(candidate,'bin/tianshu.mjs'),'upgrade'],{env:{...env,FAKE_PREFLIGHT_PAUSE_DIR:pause,FAKE_FAIL_ONCE_FILE:marker},stdio:['ignore','pipe','pipe']});contender.stdout.resume();contender.stderr.resume();
    const contenderDone=new Promise(resolve=>contender.on('exit',(code,signal)=>resolve({code,signal})));
    const deadline=Date.now()+10000;while(!existsSync(join(pause,'ready'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(existsSync(join(pause,'ready')));
    assert.equal(command('upgrade').build_id,info.build_id);const stateB=read(join(env.TIANSHU_HOME,'installation.json'));
    writeFileSync(join(pause,'release'),'continue');const failed=await contenderDone;assert.notEqual(failed.code,0);
    assert.deepEqual(read(join(env.TIANSHU_HOME,'installation.json')),stateB);assert.equal(command('doctor').ok,true);

    assert.equal(command('rollback').build_id,oldState.active.split('-').at(-1));assert.equal(hash(db),before);
    writeFileSync(marker,'fixture');
    assert.throws(()=>command('uninstall',{FAKE_FAIL_REMOVE_MARKET:marker}),/Command failed/);
    assert.equal(command('doctor').ok,true);assert.equal(hash(db),before);
    assert.equal(command('uninstall').data_preserved,true);assert.equal(command('uninstall').uninstalled,true);assert.equal(hash(db),before);assert.ok(existsSync(join(env.TIANSHU_HOME,'config.json')));
    assert.equal(command('install').health.task_count,1);assert.equal(hash(db),before);
    // Explicit B must win even when the host inherits TIANSHU_CONFIG=A.
    const alternate=join(root,'alternate');const aHome={...env,TIANSHU_HOME:alternate};
    execFileSync(cli,['init'],{env:aHome,encoding:'utf8'});const configA=join(alternate,'config.json'),configB=join(env.TIANSHU_HOME,'config.json');
    assert.equal(command('install',{TIANSHU_CONFIG:configA},['--config',configB]).health.task_count,1);
    const launch=read(join(env.TIANSHU_HOME,'marketplace/plugins/tianshu/.mcp.json')).mcpServers.tianshu;assert.equal(launch.env.TIANSHU_CONFIG,configB);
    const client=new Client({name:'launch-manifest-check',version:'1'});const transport=new StdioClientTransport({command:launch.command,args:launch.args,env:{...env,TIANSHU_CONFIG:configA,...launch.env},stderr:'pipe'});
    try{await client.connect(transport);const result=await client.callTool({name:'list_tasks',arguments:{}});assert.equal(result.structuredContent.tasks.length,1);assert.equal(result.structuredContent.tasks[0].id,'packaged-user-task');}finally{await client.close();}
    // Reject altered npm runtime files before replacing a healthy installation.
    writeFileSync(join(payload,'dist/panel.html'),'tampered');assert.throws(()=>command('upgrade'),/Command failed/);assert.equal(command('doctor').ok,true);
    assert.equal(hash(db),before);
  }catch(error){keep=true;error.message+='\nIsolated package fixture: '+root;throw error;}
  finally{if(!keep)rmSync(root,{recursive:true,force:true});}
});
