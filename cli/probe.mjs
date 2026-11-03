import {spawn} from 'node:child_process';

// Exercise the shipped server over stdio without SDK dependencies or host UI actions.
export function probe(server,python,config){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[server],{env:{...process.env,TIANSHU_PYTHON:python,TIANSHU_CONFIG:config,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
    let buffer='',bytes=0,finished=false;
    const timer=setTimeout(()=>finish(new Error('MCP health check timed out')),12000);
    function finish(error,value){if(finished)return;finished=true;clearTimeout(timer);child.kill();const force=setTimeout(()=>child.kill('SIGKILL'),1000);force.unref();child.once('close',()=>clearTimeout(force));error?reject(error):resolve(value);}
    const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
    child.on('error',error=>finish(error));child.on('exit',()=>{if(!finished)finish(new Error('MCP server exited before health check completed'));});
    child.stdin.on('error',error=>finish(error));child.stderr.resume();
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>4*1024*1024)return finish(new Error('MCP response exceeds health check limit'));
      buffer+=chunk.toString();let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
        try{
          const response=JSON.parse(line);if(response.error)throw new Error('MCP health request rejected');
          if(response.id===1){
            if(response.result?.serverInfo?.name!=='tianshu')throw new Error('Unexpected MCP server identity');
            send({jsonrpc:'2.0',method:'notifications/initialized'});send({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
          }else if(response.id===2){
            const tools=(response.result?.tools||[]).map(t=>t.name).sort();
            if(JSON.stringify(tools)!==JSON.stringify(['delete_task','get_task','list_tasks','open_workspace']))throw new Error('Unexpected MCP tool inventory');
            send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_tasks',arguments:{}}});
          }else if(response.id===3){
            const data=response.result?.structuredContent;
            if(response.result?.isError||!data?.readonly||!data.sources?.length||data.sources.some(s=>!s.ok))throw new Error('Configured ledger is not healthy/readable');
            finish(null,{build:data.build,task_count:data.tasks.length,tools:4});
          }
        }catch(error){finish(error);}
      }
    });
    send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'tianshu-doctor',version:'1'}}});
  });
}
