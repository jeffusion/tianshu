import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const version=read('package.json').version;

test('npm tarball is a self-contained native plugin; init and diagnostics never manage Codex',async()=>{
  const root=mkdtempSync(join(tmpdir(),'tianshu-package-'));
  const env={...process.env,npm_config_cache:join(root,'npm-cache'),npm_config_update_notifier:'false',PYTHONDONTWRITEBYTECODE:'1',TIANSHU_HOME:join(root,'data-home'),CODEX_HOME:join(root,'untouched-codex')};
  delete env.TIANSHU_CONFIG;
  const run=(cmd,args,extra={})=>execFileSync(cmd,args,{encoding:'utf8',env:{...env,...extra},timeout:60000,stdio:['pipe','pipe','pipe']});
  try{
    const packed=JSON.parse(run('npm',['pack','./dist/package','--ignore-scripts','--json','--pack-destination',root]))[0];
    assert.equal(packed.name,'@jeffusion/tianshu');assert.equal(packed.version,version);
    const files=packed.files.map(f=>f.path);
    for(const path of ['.codex-plugin/plugin.json','.mcp.json','dist/server.mjs','dist/panel.html','skills/coordinator/SKILL.md','ledger/cli.py','THIRD_PARTY_NOTICES.txt'])assert.ok(files.includes(path),path);
    assert.ok(files.every(f=>['package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.txt','build-info.json','docs/npm-distribution.md','.codex-plugin/plugin.json','.mcp.json'].includes(f)||['bin/','cli/','dist/','ledger/','skills/'].some(prefix=>f.startsWith(prefix))));
    assert.ok(!files.some(f=>/runtime-config\.json|\.db$|node_modules|docs\/acceptance/.test(f)));
    const prefix=join(root,'prefix');run('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--offline','--no-audit','--no-fund',join(root,packed.filename)]);
    const cli=join(prefix,'bin/tianshu'),installed=join(prefix,'lib/node_modules/@jeffusion/tianshu');
    const pkg=read(join(installed,'package.json'));
    assert.ok(!pkg.private);assert.ok(!pkg.scripts);assert.ok(!pkg.devDependencies);assert.ok(!pkg.dependencies);
    assert.equal(run(cli,['--version']).trim(),version);
    const command=(name,extra={},args=[])=>JSON.parse(run(cli,[name,...args],extra));
    assert.throws(()=>command('doctor'));assert.ok(!existsSync(env.TIANSHU_HOME));
    assert.throws(()=>command('init',{},['--config',join(root,'missing.json')]));assert.ok(!existsSync(env.TIANSHU_HOME));
    assert.equal(command('init').initialized,true);
    const configPath=join(env.TIANSHU_HOME,'config.json'),config=read(configPath),db=config.sources[0].path;
    const input=join(root,'task.json');writeFileSync(input,JSON.stringify({task_id:'packaged-user-task',objective:'Preserve this task',owner_thread_id:'fixture-owner',owner_host_id:'local',acceptance:['preserved'],allowed:['fixture'],forbidden:['production'],authorization_source:'isolated package test'}));
    run('python3',[join(installed,'ledger/coordinator.py'),'--db',db,'task-create','--input',input]);
    const before=hash(db),configBefore=hash(configPath);
    assert.equal(command('init').initialized,false);assert.equal(command('doctor').health.task_count,1);
    // The shipped manifest must launch from any directory, without absolute author paths.
    const manifest=read(join(installed,'.codex-plugin/plugin.json'));
    const launch=read(join(installed,manifest.mcpServers)).mcpServers.tianshu;
    assert.equal(launch.command,'node');assert.deepEqual(launch.args,['./dist/server.mjs']);
    assert.equal(launch.cwd,'.');
    const client=new Client({name:'native-package-manifest',version:'1'});
    try{
      await client.connect(new StdioClientTransport({command:process.execPath,args:launch.args,env,cwd:resolve(installed,launch.cwd),stderr:'pipe'}));
      const result=await client.callTool({name:'open_workspace',arguments:{}});
      assert.equal(result.structuredContent.tasks[0].id,'packaged-user-task');
      const resource=await client.readResource({uri:'ui://tianshu/task-center'});assert.ok(resource.contents[0].text.includes('天枢'));
    }finally{await client.close();}
    const alternate=join(root,'alternate.json');writeFileSync(alternate,JSON.stringify(config));
    assert.equal(command('doctor',{TIANSHU_CONFIG:join(root,'missing.json')},['--config',alternate]).ok,true);
    for(const operation of ['install','upgrade','rollback','uninstall'])assert.throws(()=>command(operation));
    assert.equal(hash(db),before);assert.equal(hash(configPath),configBefore);
    assert.deepEqual(readdirSync(env.TIANSHU_HOME).sort(),['config.json','data']);
    assert.ok(!existsSync(env.CODEX_HOME));
    run('npm',['uninstall','--global','--prefix',prefix,'--ignore-scripts','--offline','--no-audit','--no-fund','@jeffusion/tianshu']);
    assert.equal(hash(db),before);assert.equal(hash(configPath),configBefore);
  }finally{rmSync(root,{recursive:true,force:true});}
});
