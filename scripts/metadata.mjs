import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {product} from '../src/contracts/product.mjs';
export function buildIdentity(){
  const files=['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','preview.html'];
  const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()&&entry.name!=='__pycache__')walk(path);else if(entry.isFile()&&!path.endsWith('.pyc'))files.push(path);}};
  for(const dir of ['src','ledger','skills','scripts','config'])walk(dir);
  const digest=createHash('sha256');
  for(const path of files.sort()){digest.update(path);digest.update('\0');digest.update(readFileSync(path));}
  return {name:product.id,version:product.version,build_id:digest.digest('hex').slice(0,20)};
}
