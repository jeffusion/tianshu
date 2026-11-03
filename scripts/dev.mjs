import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const env={...process.env};
if(!env.TIANSHU_CONFIG&&existsSync('.local/config.json'))env.TIANSHU_CONFIG=resolve('.local/config.json');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js',...process.argv.slice(2)],{stdio:'inherit',env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
