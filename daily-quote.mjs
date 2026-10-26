import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
export async function dailyQuote(){
 const script=fileURLToPath(new URL('./daily_quote_bridge.py',import.meta.url));
 const command=process.env.PYTHON_PATH||(process.platform==='win32'?'py':'python3');
 const args=process.env.PYTHON_PATH||process.platform!=='win32'?[script]:['-3',script];
 try {
  const {stdout}=await execute(command,args,{windowsHide:true,timeout:10000,maxBuffer:16000,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
  const data=JSON.parse(stdout);
  if(typeof data.quote!=='string'||!data.quote.trim()||data.quote.length>500||!/^\d{4}-\d{2}-\d{2}$/.test(data.date))throw Error('Invalid quote');
  return data;
 } catch {throw Object.assign(Error('The daily quote is unavailable. Check greetings.py and your Python installation.'),{status:503});}
}
