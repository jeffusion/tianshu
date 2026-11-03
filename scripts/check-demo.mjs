import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const snapshot=JSON.parse(execFileSync(process.env.TIANSHU_PYTHON||'python3',[
  'ledger/read_ledger.py','--config',resolve('.local/demo/config.json'),
],{encoding:'utf8'}));
assert.equal(snapshot.readonly,true,'Demo projection must be readonly');
assert.ok(snapshot.sources.length>0 && snapshot.sources.every(s=>s.ok===true),'Demo sources must be healthy');
assert.ok(snapshot.tasks.some(t=>t.key==='demo:demo-introduction'),'Expected demo task is missing');
console.log('Demo projection healthy, readonly, and contains the expected task.');
