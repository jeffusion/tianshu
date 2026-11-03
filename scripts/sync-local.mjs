// Explicit installation entrypoint. No build or check script invokes this file.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {product} from '../src/contracts/product.mjs';
if(!process.argv.includes('--apply')){
  console.log('Dry run only. After explicit user authorization: npm run sync:local -- --apply');
  console.log(`Will build and install ${product.id}@${product.marketplace} ${product.version}; no version bump or ZIP.`);
  process.exit(0);
}
const config=resolve(process.env.TIANSHU_CONFIG||(existsSync('.local/config.json')?'.local/config.json':join(homedir(),'Library/Application Support/Tianshu/config.json')));
const python=process.env.TIANSHU_PYTHON||'python3';
execFileSync(python,['-c',"import sys;sys.path.insert(0,'ledger');from config import load_config;load_config(sys.argv[1])",config],{stdio:'inherit'});
execFileSync('npm',['run','build'],{stdio:'inherit'});
const root=resolve('dist/marketplace/plugins',product.id);
writeFileSync(join(root,'runtime-config.json'),JSON.stringify({config_path:config},null,2)+'\n');
// Desktop runtime does not expand plugin-root placeholders in MCP launch paths.
// Generate machine-specific wiring in the local marketplace, never edit installed cache.
const cacheRoot=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'plugins/cache',product.marketplace,product.id,product.version);
const mcp=join(root,'.mcp.json'),data=JSON.parse(readFileSync(mcp,'utf8'));
data.mcpServers[product.id]={command:process.execPath,args:[join(cacheRoot,'dist/server.mjs')]};
writeFileSync(mcp,JSON.stringify(data,null,2)+'\n');
execFileSync('codex',['plugin','marketplace','add',resolve('dist/marketplace'),'--json'],{stdio:'inherit'});
const installed=JSON.parse(execFileSync('codex',['plugin','add',`${product.id}@${product.marketplace}`,'--json'],{encoding:'utf8'}));
console.log(JSON.stringify(installed,null,2));
if(resolve(installed.installedPath)!==resolve(cacheRoot))throw new Error('Unexpected install path; verify MCP wiring before use');
console.log('Local installation requested. Reload the client and verify build identity; this does not remove old plugins or migrate data.');
