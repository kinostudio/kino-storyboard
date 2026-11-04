'use strict';
const {spawnSync,execFileSync}=require('node:child_process');
function accepted(run, sha) {return run.head_sha===sha && run.path==='.github/workflows/ci.yml' && run.event==='push' && run.status==='completed' && run.conclusion==='success';}
async function main(){
 const sha=process.env.WORKERS_CI_COMMIT_SHA;
 if(!/^[a-f0-9]{40}$/.test(sha||''))throw new Error('Missing Cloudflare commit SHA; refusing deployment.');
 if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==sha)throw new Error('Checkout differs from CI commit; deployment blocked.');
 for(let attempt=0;attempt<30;attempt++){
  const response=await fetch('https://api.github.com/repos/kinostudio/kino-storyboard/actions/workflows/ci.yml/runs?head_sha='+sha+'&event=push&per_page=5',{headers:{Accept:'application/vnd.github+json','User-Agent':'kino-storyboard-ci-gate'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('CI status lookup failed: HTTP '+response.status+'; deployment blocked.');
  const runs=(await response.json()).workflow_runs||[];
  const run=runs.filter(r=>r.head_sha===sha&&r.event==='push').sort((a,b)=>b.id-a.id)[0];
  if(run&&accepted(run,sha)){
   console.log('CI passed for '+sha+'; deploying this exact checkout.');
   const command=process.platform==='win32'?'npx.cmd':'npx';
   const result=spawnSync(command,['--no-install','wrangler','deploy'],{stdio:'inherit',shell:process.platform==='win32'});
   if(result.error)throw result.error;
   process.exitCode=result.status===null?1:result.status;return;
  }
  if(run&&run.status==='completed')throw new Error('CI '+run.conclusion+'; deployment blocked.');
  console.log('Waiting for Functional checks on '+sha+' ('+(attempt+1)+'/30)');
  await new Promise(r=>setTimeout(r,30000));
 }
 throw new Error('CI wait timed out; deployment blocked.');
}
module.exports={accepted};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
