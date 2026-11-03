import {existsSync,readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {probe} from './probe.mjs';
import {configPath} from '../src/contracts/config-path.mjs';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
const print=value=>console.log(JSON.stringify(value,null,2));
const help=`天枢 Tianshu ${pkg.version}

  tianshu init     初始化独立台账；已有配置只校验，不覆盖
  tianshu doctor   检查本包依赖、配置和只读 MCP 查询

选项：--config <绝对路径>，--help，--version
环境：TIANSHU_CONFIG、TIANSHU_HOME、TIANSHU_PYTHON
插件安装和卸载请使用 Codex 原生命令；本命令不管理插件。`;
function run(python,args){return execFileSync(python,args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});}
function pythonRuntime(){
  const node=Number(process.versions.node.split('.')[0]);
  if(node<24||node>26)throw new Error('Node.js 24–26 is required');
  const executable=process.env.TIANSHU_PYTHON||'python3';
  const info=JSON.parse(run(executable,['-c','import sys,json;print(json.dumps({"version":list(sys.version_info[:2]),"path":sys.executable}))']));
  if(info.version[0]!==3||info.version[1]<12)throw new Error('Python 3.12+ is required');
  return info.path;
}
function validate(python,config){
  const result=JSON.parse(run(python,[join(packageRoot,'ledger/read_ledger.py'),'--config',config]));
  if(!result.sources?.length||result.sources.some(s=>!s.ok))throw new Error('Configured ledger is missing or unhealthy; no replacement database was created');
}
export async function main(argv=process.argv.slice(2)){
  if(!argv.length||argv.includes('--help'))return console.log(help);
  if(argv.length===1&&argv[0]==='--version')return console.log(pkg.version);
  const [command,...args]=argv;
  if(!['init','doctor'].includes(command))throw new Error('Unsupported command. Use Codex native plugin commands for installation and removal.');
  let explicit;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--config'&&args[i+1]&&!explicit)explicit=args[++i];
    else throw new Error('Unknown option: '+args[i]);
  }
  const python=pythonRuntime(),config=configPath(explicit);
  if(command==='doctor'){
    validate(python,config);
    const health=await probe(join(packageRoot,'dist/server.mjs'),python,config);
    return print({ok:true,config,health,scope:'this_package',host_ui_verified:false});
  }
  if(existsSync(config)){
    validate(python,config);
    return print({initialized:false,config,data_preserved:true});
  }
  if(explicit||process.env.TIANSHU_CONFIG)throw new Error('Explicit config does not exist; init never creates a replacement for a specified configuration');
  // Only explicit init creates data. Queries and plugin installation never do.
  const directory=dirname(config);
  if(existsSync(directory)&&lstatSync(directory).isSymbolicLink())throw new Error('Data home must not be a symbolic link');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const data=join(directory,'data');
  if(existsSync(data)&&lstatSync(data).isSymbolicLink())throw new Error('Data directory must not be a symbolic link');
  mkdirSync(data,{recursive:true,mode:0o700});
  const db=join(data,'coordinator.db');
  if(!existsSync(db))run(python,[join(packageRoot,'ledger/coordinator.py'),'--db',db,'init']);
  const value={sources:[{id:'daily',label:'日常任务',path:db}]};
  // Validate before publishing the config; exclusive creation protects existing choices.
  run(python,['-c','import sys;sys.path.insert(0,sys.argv[1]);from read_ledger import read_source;read_source({"id":"daily","label":"日常任务","path":sys.argv[2]})',join(packageRoot,'ledger'),db]);
  writeFileSync(config,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  return print({initialized:true,config,data_preserved:true});
}
