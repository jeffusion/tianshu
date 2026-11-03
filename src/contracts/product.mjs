import pkg from '../../package.json' with {type:'json'};
export const product={
  id:pkg.name,version:pkg.version,name:'天枢',englishName:'Tianshu',
  workspace:'任务中心',marketplace:pkg.name,skill:'coordinator',
  resourceUri:`ui://${pkg.name}/task-center`,
  developerName:'Jeffusion',category:'Productivity',capabilities:['Read','Write'],
};
