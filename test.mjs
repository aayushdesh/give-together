import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OAuth2Client } from 'google-auth-library';
import { createApp } from './server.mjs';
import { createGoogleVerifier } from './google-auth.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const google=new OAuth2Client();
google.getFederatedSignonCertsAsync=async()=>({certs:{'test-key':keys.publicKey.export({type:'spki',format:'pem'})},format:'PEM'});
const verifier=createGoogleVerifier(google);
const clientId='123456-test.apps.googleusercontent.com';
function token(sub,nonce,changes={}) {
 const now=Math.floor(Date.now()/1000);
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const data=enc({alg:'RS256',kid:'test-key'})+'.'+enc({sub,nonce,aud:clientId,iss:'https://accounts.google.com',iat:now,exp:now+3600,...changes});
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),keys.privateKey).toString('base64url');
}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
async function stop(server){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}

test('Google verification rejects wrong audience, issuer, expiry, nonce, and signature',async()=>{
 assert.deepEqual(await verifier(token('alice','nonce'),clientId,'nonce'),{sub:'alice',nonce:'nonce'});
 for(const changes of [{aud:'another-client'},{iss:'https://evil.example'},{exp:1,iat:0},{nonce:'other'}])await assert.rejects(verifier(token('alice','nonce',changes),clientId,'nonce'));
 const valid=token('alice','nonce');await assert.rejects(verifier(valid.slice(0,-10)+'aaaaaaaaaa',clientId,'nonce'));
});

test('Google-only accounts, nickname privacy, donation workflow and persistence',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'give-together-test-'));const dbPath=path.join(dir,'test.sqlite');
 let server=createApp({dbPath,clientId,verifyCredential:verifier}),base=await listen(server);
 async function req(route,data,cookie,origin=base){const r=await fetch(base+'/api'+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
 async function login(sub,nickname){const challenge=await req('/auth/challenge',{});const result=await req('/auth/google',{credential:token(sub,challenge.data.nonce,{email:'private@example.com',name:'Private Full Name'})},challenge.cookie);assert.equal(result.status,200);if(nickname)await req('/profile',{name:nickname},result.cookie);return result.cookie;}
 try{
  assert.equal((await fetch(base)).status,200);
  const quote=await req('/daily-quote');assert.equal(quote.status,200);assert.ok(quote.data.quote.length>0);assert.match(quote.data.date,/^\d{4}-\d{2}-\d{2}$/);assert.deepEqual((await req('/daily-quote')).data,quote.data);
  const checker=await fetch(base+'/donation-check.js');assert.equal(checker.status,200);assert.match(await checker.text(),/globalThis.DonationCheck/);
  assert.equal((await req('/register',{username:'old',password:'old'})).status,410);
  assert.equal((await req('/login',{username:'old',password:'old'})).status,410);
  assert.equal((await req('/auth/google',{credential:'fake'})).status,401);
  assert.equal((await req('/auth/challenge',{},null,'https://other.example')).status,403);
  const challenge=await req('/auth/challenge',{});
  const signedToken=token('replay-test',challenge.data.nonce);
  assert.equal((await req('/auth/google',{credential:signedToken},challenge.cookie)).status,200);
  assert.equal((await req('/auth/google',{credential:signedToken},challenge.cookie)).status,401);
  const owner=await login('owner');
  const payload={title:'Test drive',category:'Food',description:'Help out',items:'Rice',location:'School office',deadline:'2099-12-31',goal:5};
  assert.equal((await req('/drives',payload,owner)).status,403);
  assert.equal((await req('/profile',{name:'private@example.com'},owner)).status,400);
  await req('/profile',{name:'Kind Koala'},owner);
  const donor=await login('donor','Happy Helper');
  const center={name:'Test charity',kind:'Nonprofit',zip:'01234',address:'123 Example Road',items:'Books',website:'https://example.org/donate',notes:'Test only'};
  assert.equal((await req('/centers',center)).status,401);
  assert.equal((await req('/centers?zip=12')).status,400);
  assert.equal((await req('/centers?zip=94403&kind=wrong')).status,400);
  const official=(await req('/centers?zip=94403')).data;
  assert.equal(official[0].name,'Samaritan House');assert.equal(official[0].checked_on,'2026-10-18');
  assert.equal((await req('/centers?zip=94403&kind=City%20program')).data.length,0);
  assert.equal((await req('/centers?zip=94402&kind=City%20program')).data.length,1);
  for(const bad of [{zip:'1234'}, {zip:'123456'}, {kind:'Business'}, {website:'javascript:alert(1)'}, {website:'https://user:pass@example.org/'}, {name:''}])assert.equal((await req('/centers',{...center,...bad},owner)).status,400);
  assert.equal((await req('/centers',center,owner)).status,201);
  assert.equal((await req('/centers',center,owner)).status,400);
  const community=(await req('/centers?zip=01234')).data;
  assert.equal(community.length,1);assert.equal(community[0].checked_on,'');assert.equal(community[0].source,'');
  assert.equal(community[0].submitted_by,undefined);
  assert.deepEqual((await req('/centers?zip=99999')).data,[]);

  assert.equal((await req('/drives',payload)).status,401);
  const id=(await req('/drives',payload,owner)).data.id;
  assert.deepEqual((await req(`/drives/${id}/items`)).data,[]);
  const canned={name:'Cans of food',needed:30,donated:12};
  assert.equal((await req(`/drives/${id}/items`,canned)).status,401);
  assert.equal((await req(`/drives/${id}/items`,canned,donor)).status,403);
  for(const bad of [{needed:0},{needed:1.5},{donated:-1},{donated:'12'},{name:''}])assert.equal((await req(`/drives/${id}/items`,{...canned,...bad},owner)).status,400);
  const added=await req(`/drives/${id}/items`,canned,owner);assert.equal(added.status,201);
  const itemId=added.data.id;
  assert.equal((await req(`/drives/${id}/items`)).data[0].remaining,18);
  assert.equal((await req(`/drives/${id}/items`,{...canned,name:'cans of food'},owner)).status,400);
  assert.equal((await req(`/drives/${id}/items/${itemId}`,{...canned,donated:20},donor)).status,403);
  const otherId=(await req('/drives',{...payload,title:'Other test drive'},owner)).data.id;
  assert.equal((await req(`/drives/${otherId}/items/${itemId}`,canned,owner)).status,404);
  for(const [donated,remaining] of [[15,15],[30,0],[35,0]]){
   assert.equal((await req(`/drives/${id}/items/${itemId}`,{...canned,donated},owner)).status,200);
   assert.equal((await req(`/drives/${id}/items`)).data[0].remaining,remaining);
  }
  assert.deepEqual((await req(`/drives/${otherId}/items`)).data,[]);
  for(const pledge of ['Shoes','Rice and shoes','Rice shoes','Rice, shoes','ricecakes']){
   const rejected=await req(`/drives/${id}/join`,{pledge},donor);
   assert.equal(rejected.status,400);assert.match(rejected.data.error,/Please bring Rice/);
  }
  assert.deepEqual((await req(`/drives/${id}/roster`,undefined,owner)).data,[]);
  assert.equal((await req('/reminders',{},donor)).data.length,0);
  assert.equal((await req(`/drives/${id}/join`,{pledge:'3 bags of RICE'},donor)).status,200);
  assert.equal((await req(`/drives/${id}/join`,{pledge:'Rice'},donor)).status,400);
  assert.equal((await req(`/drives/${id}/roster`,undefined,donor)).status,403);
  const sid=(await req(`/drives/${id}/roster`,undefined,owner)).data[0].id;
  assert.equal((await req(`/signups/${sid}/received`,{donated:true},donor)).status,403);
  assert.equal((await req(`/signups/${sid}/dropoff`,{droppedOff:true},owner)).status,403);
  assert.equal((await req(`/signups/${sid}/dropoff`,{droppedOff:'yes'},donor)).status,400);
  assert.equal((await req(`/signups/${sid}/dropoff`,{droppedOff:true},donor)).status,200);
  const reported=(await req(`/drives/${id}/roster`,undefined,owner)).data[0];
  assert.ok(reported.reported_at>0);assert.equal(reported.donated,0);
  assert.equal((await req('/reminders',{},donor)).data.length,0);
  assert.equal((await req('/state',undefined,owner)).data.drives.find(d=>d.id===id).awaiting_confirmation,1);
  await req(`/signups/${sid}/dropoff`,{droppedOff:true},donor);
  assert.equal((await req(`/drives/${id}/roster`,undefined,owner)).data[0].reported_at,reported.reported_at);
  await stop(server);server=createApp({dbPath,clientId,verifyCredential:verifier});base=await listen(server);
  assert.equal((await req('/state',undefined,donor)).data.mine[0].reported_at,reported.reported_at);
  assert.equal((await req(`/signups/${sid}/dropoff`,{droppedOff:false},donor)).status,200);
  assert.equal((await req('/state',undefined,donor)).data.mine[0].reported_at,0);

  await req(`/signups/${sid}/reminders`,{enabled:false},donor);
  assert.equal((await req('/reminders',{},donor)).data.length,0);
  await req(`/signups/${sid}/reminders`,{enabled:true},donor);
  await req(`/signups/${sid}/received`,{donated:true},owner);
  assert.equal((await req(`/signups/${sid}/dropoff`,{droppedOff:true},donor)).status,400);
  assert.equal((await req('/reminders',{},donor)).data.length,0);
  await req(`/signups/${sid}/received`,{donated:false},owner);
  assert.equal((await req('/reminders',{},donor)).data.length,1);
  assert.equal((await req('/reminders',{},donor)).data.length,0);
  await req(`/signups/${sid}/received`,{donated:true},owner);
  await stop(server);server=createApp({dbPath,clientId,verifyCredential:verifier});base=await listen(server);
  assert.equal((await req('/centers?zip=01234')).data[0].name,'Test charity');
  assert.equal((await req('/centers?zip=94403')).data.length,1);
  const persistedItem=(await req(`/drives/${id}/items`)).data[0];
  assert.equal(persistedItem.donated,35);assert.equal(persistedItem.remaining,0);
  const snapshot=(await req('/state',undefined,donor)).data;
  assert.equal(snapshot.mine[0].donated,1);assert.equal(snapshot.user.name,'Happy Helper');
  assert.ok(!JSON.stringify(snapshot).includes('private@example.com'));
  assert.ok(!JSON.stringify(snapshot).includes('Private Full Name'));
  const again=await login('donor');assert.equal((await req('/state',undefined,again)).data.user.id,snapshot.user.id);
  await req(`/signups/${sid}/received`,{donated:false},owner);
  await req(`/signups/${sid}/leave`,{},again);
  assert.equal((await req('/state',undefined,again)).data.mine.length,0);
  assert.equal((await req(`/drives/${id}/join`,{pledge:'2 bags of rice'},again)).status,200);
  const rejoined=(await req('/state',undefined,again)).data.mine;
  assert.equal(rejoined.length,1);assert.equal(rejoined[0].pledge,'2 bags of rice');
  assert.equal(rejoined[0].donated,0);
  assert.equal((await req(`/signups/${rejoined[0].id}/leave`,{},again)).status,200);
  assert.equal((await req('/state',undefined,again)).data.mine.length,0);
  await req(`/drives/${id}/close`,{},owner);
  assert.equal((await req(`/drives/${id}/join`,{pledge:'Rice'},again)).status,400);
  await req('/logout',{},again);assert.equal((await req('/state',undefined,again)).data.user,null);
  const db=new DatabaseSync(dbPath);
  db.prepare('INSERT INTO users(name,username,salt,hash) VALUES(?,?,?,?)').run('Old account','old','salt','hash');
  const old=db.prepare('SELECT id FROM users WHERE username=?').get('old');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('legacy-token',old.id,Date.now()+60000);db.close();
  assert.equal((await req('/state',undefined,'session=legacy-token')).data.user,null);
 } finally {await stop(server);rmSync(dir,{recursive:true,force:true});}
});

test('Unconfigured Google fails closed while public browsing still works',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'give-together-test-'));
 const server=createApp({dbPath:path.join(dir,'test.sqlite'),clientId:''}),base=await listen(server);
 try{
  assert.equal((await (await fetch(base+'/api/auth/config')).json()).clientId,null);
  const r=await fetch(base+'/api/auth/google',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({credential:'fake'})});assert.equal(r.status,503);
  assert.equal((await fetch(base+'/google-setup.html')).status,200);
 }finally{await stop(server);rmSync(dir,{recursive:true,force:true});}
});


test('Donation list checking accepts listed items and quantities, not partial matches',()=>{
 const list='Unopened rice, pasta, and canned vegetables';
 assert.deepEqual(DonationCheck.options(list),['Unopened rice','pasta','canned vegetables']);
 for(const pledge of ['Unopened rice','3 bags of unopened rice','PASTA','pasta and canned vegetables','2 pasta, 3 canned vegetables'])assert.equal(DonationCheck.check(list,pledge).valid,true,pledge);
 for(const pledge of ['', 'rice', 'pasta and shoes','pasta shoes','toothpasta','pasta, shoes','not pasta'])assert.equal(DonationCheck.check(list,pledge).valid,false,pledge);
 assert.equal(DonationCheck.check('Coats; scarves\nNew socks','Coats & New socks').valid,true);
 assert.equal(DonationCheck.check('Toys','Rice').valid,false);
});
