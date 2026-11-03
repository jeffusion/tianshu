import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
if(pkg.name!=='@jeffusion/tianshu'||pkg.version!==process.env.RELEASE_VERSION||pkg.private)throw new Error('Release identity/version does not match the approved package');
const result=spawnSync('npm',['view',`${pkg.name}@${pkg.version}`,'version','--json','--registry=https://registry.npmjs.org/'],{encoding:'utf8'});
if(result.status===0)throw new Error('This npm version is already published; versions cannot be overwritten');
let error;try{error=JSON.parse(result.stdout).error;}catch{}
if(error?.code!=='E404')throw new Error('Cannot verify npm version availability; stop before publishing');
console.log(`Verified unpublished ${pkg.name}@${pkg.version}`);
