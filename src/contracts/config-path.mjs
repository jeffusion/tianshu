import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';

export function dataHome(){
  return process.env.TIANSHU_HOME||(process.platform==='darwin'
    ?join(homedir(),'Library/Application Support/Tianshu')
    :join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'tianshu'));
}

export function configPath(explicit){
  const path=explicit||process.env.TIANSHU_CONFIG||join(dataHome(),'config.json');
  if(!isAbsolute(path))throw new Error('Config path must be absolute');
  return path;
}
