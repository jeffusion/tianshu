import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export function notices(output){
  const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
  const sections=['Third-party notices\n\nTianshu is MIT licensed. Bundled dependencies retain their respective licenses.\nThis inventory conservatively includes installed build dependencies.\n'];
  for(const path of Object.keys(lock.packages).sort()){
    if(!path.startsWith('node_modules/')||!existsSync(join(path,'package.json')))continue;
    const pkg=JSON.parse(readFileSync(join(path,'package.json'),'utf8'));
    const files=readdirSync(path).filter(name=>/^(licen[cs]e|notice|copying)([.-].*)?$/i.test(name));
    if(!files.length)continue;
    sections.push(`\n===== ${pkg.name}@${pkg.version} (${pkg.license||'see license'}) =====\n`);
    for(const file of files)sections.push(`\n--- ${file} ---\n`+readFileSync(join(path,file),'utf8'));
  }
  writeFileSync(output,sections.join('\n')+'\n');
}
