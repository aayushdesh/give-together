import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./item_tracker_bridge.py',import.meta.url));
export function calculateItemProgress(items){
 if(!items.length)return Promise.resolve([]);
 return new Promise((resolve,reject)=>{
  const command=process.env.PYTHON_PATH||(process.platform==='win32'?'py':'python3');
  const args=process.env.PYTHON_PATH||process.platform!=='win32'?[script]:['-3',script];
  const child=spawn(command,args,{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'},stdio:['pipe','pipe','pipe']});
  let output='',errorText='',finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
  const failure=()=>Object.assign(new Error('The Python item tracker could not run. Check Python is installed and student_features.py has no errors, then reopen the tracker.'),{status:503});
  const timer=setTimeout(()=>{child.kill();finish(failure());},10000);
  child.on('error',()=>finish(failure()));
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000){child.kill();finish(failure());}});
  child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-4000);});
  child.stdin.on('error',()=>finish(failure()));
  child.on('close',code=>{
   if(code!==0){console.error('Item tracker Python error:',errorText);return finish(failure());}
   try{const rows=JSON.parse(output);if(!Array.isArray(rows)||rows.length!==items.length||rows.some((r,i)=>r.id!==items[i].id||!Number.isSafeInteger(r.remaining)||r.remaining<0))throw Error();finish(null,rows);}catch{finish(failure());}
  });
  child.stdin.end(JSON.stringify(items));
 });
}
