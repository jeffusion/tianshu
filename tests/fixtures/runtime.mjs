import {mkdtempSync,cpSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
export function runtime(){
  const root=mkdtempSync(join(tmpdir(),'tianshu-test-'));
  cpSync('dist/package',root,{recursive:true});
  const db=join(root,'fixture.db'),config=join(root,'config.json');
  const cli=(command,data)=>JSON.parse(execFileSync('python3',[join(root,'ledger/coordinator.py'),'--db',db,command,...(data?['--input','-']:[])],{input:data?JSON.stringify(data):undefined,encoding:'utf8'})).result;
  cli('init');
  const configure=(sources=[{id:'test',label:'Fixture',path:db}])=>writeFileSync(config,JSON.stringify({sources}));configure();
  const create=(id,execution=null)=>cli('task-create',{task_id:id,objective:'isolated fixture',owner_thread_id:'fixture-owner',owner_host_id:'local',execution,acceptance:['actual fixture output'],allowed:['isolated test'],forbidden:['production'],authorization_source:'isolated automated test'});
  const mutate=(id,command,data)=>cli(command,{task_id:id,expected_revision:cli('task-show',{task_id:id}).revision,...data});
  const connect=async()=>{const client=new Client({name:'tianshu-test',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'dist/server.mjs')],env:{...process.env,TIANSHU_CONFIG:config},stderr:'pipe'}));return client;};
  return {root,db,config,cli,create,mutate,configure,connect,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
