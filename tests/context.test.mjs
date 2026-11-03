import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContext, signature, observationStatus, needsAttention} from '../src/contracts/task-context.mjs';
const task={key:'test:one',id:'one',revision:2,mandate_version:1,state:'ready',objective:'核验',source_label:'Test',host_id:'local',thread_id:'bound-thread',observed_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:05:00Z',allowed:['read'],forbidden:['部署'],summary:'待验收',acceptance:['独立核验'],evidence:['report.json']};
test('carry task creates only a versioned background snapshot, without a preselected operation',()=>{
  const p=buildContext(task);
  assert.equal(p.structuredContent.intent,undefined);
  assert.deepEqual(p.structuredContent.selectedTask,{key:'test:one',id:'one',revision:2,mandate_version:1});
  const text=p.content[0].text;
  assert.ok(text.includes('local / bound-thread'));
  assert.ok(text.includes('禁止：部署'));
  assert.ok(text.includes('\n任务：one\n'));
  assert.ok(!text.includes('操作：'));
});
test('attachment freshness and attention reflect independent task and incident states',()=>{
  assert.notEqual(signature(task),signature({...task,revision:3}));
  assert.match(observationStatus(task,Date.parse('2026-11-01T00:16:00Z')),/超过15分钟/);
  assert.match(observationStatus({...task,observed_at:null}),/尚无/);
  assert.match(observationStatus({...task,state:'accepted'}),/任务已结束/);
  assert.equal(needsAttention({...task,state:'running',incident:{status:'open'}}),true);
  assert.equal(needsAttention({...task,state:'running',incident:{status:'resolved'}}),false);
});
