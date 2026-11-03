import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runtime} from './fixtures/runtime.mjs';
test('configured MCP deletion preserves boundaries, archive and retry identity',async()=>{
  const f=runtime();f.create('closed');f.create('active');
  f.mutate('closed','task-transition',{state:'stopped',reason:'fixture ended',stop_authorization_source:'test',execution_stop_evidence:'unbound fixture'});
  const c=await f.connect(),request={key:'test:closed',expected_revision:2,reason:'explicit cleanup',authorization_source:'isolated test'};
  try{
    for(const ids of [['test','test:nested'],['test','test']]){
      f.configure(ids.map(id=>({id,label:id,path:f.db})));
      assert.equal((await c.callTool({name:'delete_task',arguments:request})).isError,true);
      assert.equal(f.cli('task-show',{task_id:'closed'}).state,'stopped');
    }
    f.configure();
    for(const args of [{...request,key:'../../etc/passwd'},{...request,key:'other:closed'},{...request,key:'test:active',expected_revision:1},{...request,expected_revision:1}])assert.equal((await c.callTool({name:'delete_task',arguments:args})).isError,true);
    const deleted=await c.callTool({name:'delete_task',arguments:request});assert.equal(deleted.structuredContent.deleted,true);
    const retry=await c.callTool({name:'delete_task',arguments:request});assert.equal(retry.structuredContent.already_deleted,true);assert.equal(retry.structuredContent.archive_id,deleted.structuredContent.archive_id);
    assert.deepEqual((await c.callTool({name:'list_tasks',arguments:{}})).structuredContent.tasks.map(t=>t.id),['active']);
    const audit=JSON.parse(execFileSync('python3',['-c','import sqlite3,json,sys;d=sqlite3.connect(sys.argv[1]);print(json.dumps({"snapshot":json.loads(d.execute("select snapshot from task_deletions").fetchone()[0]),"fk":d.execute("pragma foreign_key_check").fetchall()}))',f.db],{encoding:'utf8'}));
    assert.equal(audit.snapshot.id,'closed');assert.equal(audit.snapshot.events.length,2);assert.deepEqual(audit.fk,[]);
  }finally{await c.close();f.cleanup();}
});
