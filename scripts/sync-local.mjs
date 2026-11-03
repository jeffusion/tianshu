// Developer-only shortcut; end users install the published npm package.
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
if(!process.argv.includes('--apply')){
  console.log('Dry run. npm run sync:local -- --apply builds and invokes tianshu install.');
  process.exit(0);
}
execFileSync('npm',['run','build'],{stdio:'inherit'});
const config=process.env.TIANSHU_CONFIG||(existsSync('.local/config.json')?resolve('.local/config.json'):null);
execFileSync(process.execPath,['bin/tianshu.mjs','install',...(config?['--config',config]:[])],{stdio:'inherit'});
