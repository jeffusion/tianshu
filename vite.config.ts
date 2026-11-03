import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {viteSingleFile} from 'vite-plugin-singlefile';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {buildIdentity} from './scripts/metadata.mjs';
export default defineConfig(()=>{
  const identity=buildIdentity();
  return {
    publicDir:false,
    plugins:[react(),viteSingleFile(),{
      name:'tianshu-build-identity',
      transformIndexHtml(){return [{tag:'meta',attrs:{name:'tianshu-build',content:identity.build_id},injectTo:'head'}];},
    },{
      name:'tianshu-readonly-preview',apply:'serve',
      configureServer(server){
        server.middlewares.use('/__preview-snapshot.json',(_req,res)=>{
          try{
            const body=execFileSync(process.env.TIANSHU_PYTHON||'python3',[resolve('ledger/read_ledger.py'),...(process.env.TIANSHU_CONFIG?['--config',process.env.TIANSHU_CONFIG]:[])],{encoding:'utf8',timeout:12000,maxBuffer:4*1024*1024});
            res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(body);
          }catch{res.statusCode=503;res.end(JSON.stringify({error:'预览台账配置缺失或不可读，请检查TIANSHU_CONFIG'}));}
        });
      },
    }],
    build:{outDir:'dist/ui',target:'es2022',sourcemap:false,emptyOutDir:true},
    server:{host:'127.0.0.1',port:8975,strictPort:true},
  };
});
