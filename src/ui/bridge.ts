import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import {product} from '../contracts/product.mjs';
import { buildContext } from '../contracts/task-context.mjs';
import type { Snapshot, TaskBridge } from '../contracts/types';

export function createHostBridge():TaskBridge {
  const app=new App({name:product.name,version:product.version},{},{autoResize:true});
  const extensions=new OpenAIExtensions(app);
  const theme=()=>{
    const context=app.getHostContext();
    if(context?.theme){applyDocumentTheme(context.theme);document.documentElement.dataset.theme=context.theme;}
    if(context?.styles?.variables)applyHostStyleVariables(context.styles.variables);
  };
  return {
    async start(onData,onReady){
      app.ontoolresult=result=>{const d=result.structuredContent as unknown as Snapshot;if(d?.tasks&&d?.sources)onData(d);};
      app.onhostcontextchanged=theme;
      await app.connect();theme();onReady(!!app.getHostCapabilities()?.updateModelContext);
      const result=await app.callServerTool({name:'list_tasks',arguments:{}});
      if(result.isError)throw new Error('台账暂不可读，请重试');
      onData(result.structuredContent as unknown as Snapshot);
    },
    async refresh(){const result=await app.callServerTool({name:'list_tasks',arguments:{}});if(result.isError)throw new Error('刷新失败，请稍后重试');return result.structuredContent as unknown as Snapshot;},
    async attach(task){const raw=buildContext(task);const context={...raw,content:raw.content.map(block=>({...block,type:'text' as const}))};if(extensions.modelContext)await extensions.modelContext.update(context);else await app.updateModelContext(context);},
    close(){void app.close();},
  };
}
