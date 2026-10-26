import http from 'node:http';
import {dailyQuote} from './daily-quote.mjs';
import {setupCenters,searchCenters,addCenter} from './centers.mjs';
import './public/donation-check.js';
import {calculateItemProgress} from './item-tracker.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { verifyGoogleCredential } from './google-auth.mjs';
import { loadEnvFile } from 'node:process';
try { loadEnvFile(new URL('.env', import.meta.url)); } catch (e) { if(e.code!=='ENOENT') throw e; }
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
export function createApp({dbPath=process.env.DB_PATH || path.join(root,'data','give-together.sqlite'),clientId=process.env.GOOGLE_CLIENT_ID || '',verifyCredential=verifyGoogleCredential}={}) {
mkdirSync(path.dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS drives(id INTEGER PRIMARY KEY,owner INTEGER REFERENCES users(id),title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,items TEXT NOT NULL,location TEXT NOT NULL,deadline TEXT NOT NULL,goal INTEGER NOT NULL,closed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS signups(id INTEGER PRIMARY KEY,drive_id INTEGER REFERENCES drives(id),user_id INTEGER REFERENCES users(id),pledge TEXT NOT NULL,donated INTEGER NOT NULL DEFAULT 0,reminders INTEGER NOT NULL DEFAULT 1,last_reminder INTEGER NOT NULL DEFAULT 0,UNIQUE(drive_id,user_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS drive_items (
 id INTEGER PRIMARY KEY,drive_id INTEGER NOT NULL REFERENCES drives(id),
 name TEXT NOT NULL,needed INTEGER NOT NULL CHECK(needed>0),
 donated INTEGER NOT NULL DEFAULT 0 CHECK(donated>=0)
);`);
const signupColumns=db.prepare('PRAGMA table_info(signups)').all().map(c=>c.name);
if(!signupColumns.includes('reported_at'))db.exec('ALTER TABLE signups ADD COLUMN reported_at INTEGER NOT NULL DEFAULT 0');
const columns=db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
if(!columns.includes('google_sub'))db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
if(!columns.includes('nickname_set'))db.exec('ALTER TABLE users ADD COLUMN nickname_set INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub); CREATE TABLE IF NOT EXISTS login_challenges(nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
const configured=/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId);
setupCenters(db);
const sessions=db.prepare('DELETE FROM sessions WHERE expires < ?');
function cookie(req,key){return (req.headers.cookie||'').split(/;\s*/).find(v=>v.startsWith(key+'='))?.slice(key.length+1)||'';}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function str(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label} is required (up to ${max} characters).`);return value.trim();}
function user(req){const token=(req.headers.cookie||'').split('; ').find(v=>v.startsWith('session='))?.slice(8);return db.prepare('SELECT u.id,u.name,u.nickname_set FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.google_sub IS NOT NULL').get(token||'',Date.now());}
function signed(req,requireNickname=true){const u=user(req);if(!u)fail('Please sign in with Google first.',401);if(requireNickname&&!u.nickname_set)fail('Choose your nickname first.',403);return u;}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)fail('That request is too large.',413);}try{return JSON.parse(s||'{}');}catch{fail('Please send valid information.');}}
function drive(id){const d=db.prepare('SELECT * FROM drives WHERE id=?').get(id);if(!d)fail('Drive not found.',404);return d;}
function active(d){if(d.closed||d.deadline<new Date().toISOString().slice(0,10))fail('This drive has ended.');}
const server=http.createServer(async(req,res)=>{
 const send=(data,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
 try{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/')){
   const files={'/donation-check.js':'donation-check.js','/':'index.html','/app.js':'app.js','/item-tracker.js':'item-tracker.js','/style.css':'style.css','/google-signin.js':'google-signin.js','/google-setup.html':'google-setup.html','/student-features.json':'student-features.json'};const f=files[url.pathname];if(!f)fail('Not found',404);
   res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':'text/css','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer-when-downgrade','Cross-Origin-Opener-Policy':'same-origin-allow-popups','Content-Security-Policy':"default-src 'self'; style-src 'self' https://accounts.google.com/gsi/style; script-src 'self' https://accounts.google.com/gsi/client; img-src 'self' data:; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});return res.end(readFileSync(path.join(root,'public',f)));
  }
  if(req.method==='POST' && (req.headers.origin!==`http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')))fail('Please use the sign-in button on this website.',403);
  const b=req.method==='POST'?await body(req):{};const route=url.pathname;
  if(route==='/api/daily-quote'&&req.method==='GET')return send(await dailyQuote());
  if(route==='/api/auth/config'&&req.method==='GET')return send({clientId:configured?clientId:null});
  if((route==='/api/login'||route==='/api/register'))fail('This app now uses Google sign-in only.',410);
  if(route==='/api/auth/challenge'&&req.method==='POST'){
   if(!configured)fail('Google sign-in is not connected yet. Ask the site organizer to follow the setup guide.',503);
   db.prepare('DELETE FROM login_challenges WHERE expires<?').run(Date.now());
   db.prepare('DELETE FROM login_challenges WHERE nonce=?').run(cookie(req,'google_nonce'));
   const nonce=randomBytes(32).toString('hex');db.prepare('INSERT INTO login_challenges VALUES(?,?)').run(nonce,Date.now()+600000);
   return send({nonce},200,{'Set-Cookie':`google_nonce=${nonce}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`});
  }
  if(route==='/api/auth/google'&&req.method==='POST'){
   if(!configured)fail('Google sign-in is not connected yet.',503);
   const nonce=cookie(req,'google_nonce');
   if(!nonce||!db.prepare('SELECT nonce FROM login_challenges WHERE nonce=? AND expires>?').get(nonce,Date.now()))fail('Please reopen sign-in and try again.',401);
   const credential=str(b.credential,'Google sign-in',12000);
   let identity;try{identity=await verifyCredential(credential,clientId,nonce);}catch{fail('Google sign-in did not finish. Please try again.',401);}
   if(!identity?.sub||identity.nonce!==nonce)fail('Please try signing in again.',401);
   if(!db.prepare('DELETE FROM login_challenges WHERE nonce=? AND expires>?').run(nonce,Date.now()).changes)fail('Please reopen sign-in and try again.',401);
   let u=db.prepare('SELECT id FROM users WHERE google_sub=?').get(identity.sub);
   if(!u){const result=db.prepare('INSERT INTO users(name,username,salt,hash,google_sub) VALUES(?,?,?,?,?)').run('Kind Helper','google:'+identity.sub,'','',identity.sub);u={id:Number(result.lastInsertRowid)};}
   sessions.run(Date.now());db.prepare('DELETE FROM sessions WHERE token=?').run(cookie(req,'session'));
   const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,u.id,Date.now()+7*86400000);
   return send({ok:true},200,{'Set-Cookie':[`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,'google_nonce=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0']});
  }
  if(route==='/api/profile'&&req.method==='POST'){
   const u=signed(req,false),name=str(b.name,'Nickname',24);
   if(!/^[a-zA-Z][a-zA-Z0-9 -]{1,23}$/.test(name))fail('Choose a nickname with 2–24 letters, numbers, spaces, or hyphens.');
   db.prepare('UPDATE users SET name=?,nickname_set=1 WHERE id=?').run(name,u.id);return send({ok:true});
  }
  if(route==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').split('; ').find(v=>v.startsWith('session='))?.slice(8);db.prepare('DELETE FROM sessions WHERE token=?').run(token||'');return send({ok:true},200,{'Set-Cookie':'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(route==='/api/state'&&req.method==='GET'){
   const u=user(req);const drives=db.prepare(`SELECT d.*,u.name AS host,(SELECT count(*) FROM signups WHERE drive_id=d.id) AS joined,(SELECT count(*) FROM signups WHERE drive_id=d.id AND donated=1) AS received,(SELECT count(*) FROM signups WHERE drive_id=d.id AND donated=0 AND reported_at>0) AS awaiting_confirmation FROM drives d JOIN users u ON u.id=d.owner ORDER BY d.id DESC`).all();
   const mine=u?db.prepare('SELECT * FROM signups WHERE user_id=?').all(u.id):[];
   return send({user:u||null,drives,mine});
  }
  if(route==='/api/centers'&&req.method==='GET')return send(searchCenters(db,url.searchParams.get('zip')||'',url.searchParams.get('kind')||''));
  if(route==='/api/centers'&&req.method==='POST')return send(addCenter(db,b,signed(req).id),201);
  const itemRoute=route.match(/^\/api\/drives\/(\d+)\/items(?:\/(\d+))?$/);
  if(itemRoute){
   const d=drive(Number(itemRoute[1]));
   if(req.method==='GET'&&!itemRoute[2]){
    const rows=db.prepare('SELECT * FROM drive_items WHERE drive_id=? ORDER BY id').all(d.id);
    return send(await calculateItemProgress(rows));
   }
   if(req.method==='POST'){
    const organizer=signed(req);
    if(d.owner!==organizer.id)fail('Only the organizer can update item counts.',403);
    const name=str(b.name,'Item name',80),needed=b.needed,donated=b.donated;
    if(!Number.isSafeInteger(needed)||needed<1||needed>1000000)fail('The item goal must be a whole number from 1 to 1,000,000.');
    if(!Number.isSafeInteger(donated)||donated<0||donated>1000000)fail('Items received must be a whole number from 0 to 1,000,000.');
    const itemId=itemRoute[2]?Number(itemRoute[2]):null;
    if(itemId&&!db.prepare('SELECT id FROM drive_items WHERE id=? AND drive_id=?').get(itemId,d.id))fail('Item not found in this drive.',404);
    if(db.prepare('SELECT id FROM drive_items WHERE drive_id=? AND lower(name)=lower(?) AND id!=?').get(d.id,name,itemId||-1))fail('That item is already listed. Update its total instead.');
    if(!itemId&&db.prepare('SELECT count(*) n FROM drive_items WHERE drive_id=?').get(d.id).n>=50)fail('This drive already has 50 tracked items.');
    if(itemId){db.prepare('UPDATE drive_items SET name=?,needed=?,donated=? WHERE id=? AND drive_id=?').run(name,needed,donated,itemId,d.id);return send({ok:true,id:itemId});}
    const result=db.prepare('INSERT INTO drive_items(drive_id,name,needed,donated) VALUES(?,?,?,?)').run(d.id,name,needed,donated);
    return send({ok:true,id:Number(result.lastInsertRowid)},201);
   }
   fail('Use GET or POST for the item tracker.',405);
  }
  const u=signed(req);
  if(route==='/api/drives'&&req.method==='POST'){
   const title=str(b.title,'Drive name',80),category=str(b.category,'Category',20),description=str(b.description,'Description',700),items=str(b.items,'Requested items',300),location=str(b.location,'Drop-off spot',150),deadline=str(b.deadline,'End date',10),goal=Number(b.goal);
   if(!['Food','Toys','Clothes','School supplies','Other'].includes(category))fail('Choose a category.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||new Date(deadline).toISOString().slice(0,10)!==deadline||deadline<new Date().toISOString().slice(0,10))fail('Choose today or a future date.');
   if(!Number.isInteger(goal)||goal<1||goal>10000)fail('Choose a goal between 1 and 10,000 donors.');
   const result=db.prepare('INSERT INTO drives(owner,title,category,description,items,location,deadline,goal) VALUES(?,?,?,?,?,?,?,?)').run(u.id,title,category,description,items,location,deadline,goal);return send({id:Number(result.lastInsertRowid)},201);
  }
  const match=route.match(/^\/api\/drives\/(\d+)(?:\/(join|roster|close))?$/);
  if(match){const d=drive(Number(match[1]));const action=match[2];
   if(action==='join'&&req.method==='POST'){active(d);const pledge=str(b.pledge,'Your donation',200);const checked=DonationCheck.check(d.items,pledge);if(!checked.valid)fail(checked.message);if(db.prepare('SELECT id FROM signups WHERE drive_id=? AND user_id=?').get(d.id,u.id))fail('You already joined this drive.');db.prepare('INSERT INTO signups(drive_id,user_id,pledge) VALUES(?,?,?)').run(d.id,u.id,pledge);return send({ok:true});}
   if(d.owner!==u.id)fail('Only the organizer can manage this drive.',403);
   if(action==='roster'&&req.method==='GET')return send(db.prepare('SELECT s.id,s.pledge,s.donated,s.reported_at,u.name FROM signups s JOIN users u ON u.id=s.user_id WHERE s.drive_id=? ORDER BY (s.reported_at>0 AND s.donated=0) DESC,s.id').all(d.id));
   if(action==='close'&&req.method==='POST'){db.prepare('UPDATE drives SET closed=1 WHERE id=?').run(d.id);return send({ok:true});}
  }
  const signup=route.match(/^\/api\/signups\/(\d+)\/(received|reminders|leave|dropoff)$/);
  if(signup&&req.method==='POST'){
   const s=db.prepare('SELECT s.*,d.owner FROM signups s JOIN drives d ON d.id=s.drive_id WHERE s.id=?').get(Number(signup[1]));if(!s)fail('Sign-up not found.',404);
   if(signup[2]==='dropoff'){
    if(s.user_id!==u.id)fail('Only the donor can report this drop-off.',403);
    if(s.donated)fail('The organizer has already confirmed this donation.');
    if(typeof b.droppedOff!=='boolean')fail('Choose dropped off or not yet.');
    db.prepare('UPDATE signups SET reported_at=? WHERE id=?').run(b.droppedOff?(s.reported_at||Date.now()):0,s.id);
    return send({ok:true});
   }
   if(signup[2]==='received'){if(s.owner!==u.id)fail('Only the organizer can check off donations.',403);if(typeof b.donated!=='boolean')fail('Choose received or pending.');db.prepare('UPDATE signups SET donated=?,reported_at=CASE WHEN ?=0 THEN 0 ELSE reported_at END WHERE id=?').run(b.donated?1:0,b.donated?1:0,s.id);}
   else{if(s.user_id!==u.id)fail('This sign-up belongs to someone else.',403);if(signup[2]==='leave'){if(s.donated)fail('A received donation stays on the list.');db.prepare('DELETE FROM signups WHERE id=?').run(s.id);}else{if(typeof b.enabled!=='boolean')fail('Choose reminders on or off.');db.prepare('UPDATE signups SET reminders=? WHERE id=?').run(b.enabled?1:0,s.id);}}
   return send({ok:true});
  }
  if(route==='/api/reminders'&&req.method==='POST'){
   const due=db.prepare(`SELECT s.id,d.title FROM signups s JOIN drives d ON d.id=s.drive_id WHERE s.user_id=? AND s.donated=0 AND s.reported_at=0 AND s.reminders=1 AND d.closed=0 AND d.deadline>=? AND s.last_reminder<?`).all(u.id,new Date().toISOString().slice(0,10),Date.now()-86400000);
   for(const s of due)db.prepare('UPDATE signups SET last_reminder=? WHERE id=?').run(Date.now(),s.id);return send(due);
  }
  fail('Not found.',404);
 }catch(e){if(!e.status)console.error(e);send({error:e.status?e.message:'Something went wrong. Please try again.'},e.status||500);}
});
server.on('close',()=>db.close());
return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createApp();
 server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Give Together is ready: http://localhost:${server.address().port}`));
}
