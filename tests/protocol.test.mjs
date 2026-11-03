import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runtime} from './fixtures/runtime.mjs';
test('built plugin has unified identity, readonly projections and isolated data',async()=>{
  // Package only the desktop format validated by the target runtime.
  const manifest=JSON.parse(readFileSync('dist/plugin/.codex-plugin/plugin.json','utf8'));
  const mcpPath=manifest.mcpServers;
  assert.equal(mcpPath,'./.mcp.json');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync('dist/plugin/'+mcpPath,'utf8')).mcpServers),['tianshu']);
  const f=runtime();f.create('reviewed',{host_id:'local',thread_id:'fixture-worker'});
  f.mutate('reviewed','task-transition',{state:'running',reason:'fixture'});
  f.mutate('reviewed','observation-record',{host_id:'local',thread_id:'fixture-worker',turn_id:'fixture-turn',summary:'fixture completed',evidence:['fixture-proof']});
  f.mutate('reviewed','task-transition',{state:'ready',reason:'fixture report'});
  f.mutate('reviewed','task-transition',{state:'accepted',reason:'fixture verified',verified_by:'fixture-reviewer',verification_evidence:['fixture-proof']});
  const hash=()=>createHash('sha256').update(readFileSync(f.db)).digest('hex');const before=hash();
  const c=await f.connect();
  try{
    assert.deepEqual(c.getServerVersion(),{name:'tianshu',version:'0.1.0'});
    const tools=(await c.listTools()).tools;
    assert.deepEqual(tools.map(t=>t.name).sort(),['delete_task','get_task','list_tasks','open_workspace']);
    assert.ok(tools.filter(t=>t.name!=='delete_task').every(t=>t.annotations.readOnlyHint));
    assert.equal(tools.find(t=>t.name==='delete_task').annotations.destructiveHint,true);
    const open=tools.find(t=>t.name==='open_workspace');assert.equal(open._meta.ui.resourceUri,'ui://tianshu/task-center');
    const result=await c.callTool({name:'open_workspace',arguments:{}});
    assert.equal(result.structuredContent.readonly,true);assert.equal(result.structuredContent.tasks.length,1);
    assert.equal(result.structuredContent.tasks[0].verification.by,'fixture-reviewer');
    assert.equal(result.structuredContent.build.version,'0.1.0');assert.ok(result.structuredContent.build.build_id);
    assert.ok(!('dispatches' in result.structuredContent.tasks[0]));
    assert.equal((await c.callTool({name:'get_task',arguments:{key:'unknown:reviewed'}})).isError,true);
    const resource=await c.readResource({uri:open._meta.ui.resourceUri});
    assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');
    assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains,[]);
    assert.ok(resource.contents[0].text.includes('天枢'));assert.ok(resource.contents[0].text.includes(result.structuredContent.build.build_id));
    assert.ok(!resource.contents[0].text.includes('preview-host-colors'));assert.equal(hash(),before);
  }finally{await c.close();f.cleanup();}
});
