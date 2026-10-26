import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const db=new DatabaseSync(path.join(root,'data','give-together.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
try{
 const backupDir=path.join(root,'data','backups');mkdirSync(backupDir,{recursive:true});
 await backup(db,path.join(backupDir,`before-other-drives-${Date.now()}.sqlite`));
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec('CREATE TABLE IF NOT EXISTS practice_seed_drives(seed_key TEXT PRIMARY KEY, drive_id INTEGER NOT NULL REFERENCES drives(id))');
  const fixtures=[
   {key:'pantry',host:'Test Maple Owl',title:'Practice: Fill the Pantry',category:'Food',items:[['Cans of beans',30,12],['Bags of rice',20,5]]},
   {key:'warmth',host:'Test Sunny Fox',title:'Practice: Warm Winter Wishes',category:'Clothes',items:[['Winter coats',15,4],['Pairs of new socks',40,10]]},
   {key:'school',host:'Test River Panda',title:'Practice: Ready for School',category:'School supplies',items:[['Notebooks',50,18],['Backpacks',20,6]]}
  ];
  const deadline=new Date(Date.now()+21*86400000).toISOString().slice(0,10);
  for(const f of fixtures){
   const username='practice-organizer:'+f.key;
   db.prepare('INSERT OR IGNORE INTO users(name,username,salt,hash,nickname_set) VALUES(?,?,?,?,1)').run(f.host,username,'','');
   const owner=db.prepare('SELECT id,google_sub FROM users WHERE username=?').get(username);
   if(owner.google_sub!==null)throw Error('Refusing to use a real account as a fictional organizer.');
   const key='other-organizer-v1:'+f.key;
   if(db.prepare('SELECT drive_id FROM practice_seed_drives WHERE seed_key=?').get(key))continue;
   const result=db.prepare('INSERT INTO drives(owner,title,category,description,items,location,deadline,goal) VALUES(?,?,?,?,?,?,?,?)').run(owner.id,f.title,f.category,'TEST DRIVE: fictional organizer and item totals. Join to practice being a donor. No real collection or drop-off is happening.',f.items.map(i=>i[0]).join(', '),'Example community center — practice only',deadline,10);
   const driveId=Number(result.lastInsertRowid);
   db.prepare('INSERT INTO practice_seed_drives VALUES(?,?)').run(key,driveId);
   for(const [name,needed,donated] of f.items)db.prepare('INSERT INTO drive_items(drive_id,name,needed,donated) VALUES(?,?,?,?)').run(driveId,name,needed,donated);
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 const rows=db.prepare("SELECT d.id,d.title,u.name AS organizer,u.google_sub,(SELECT count(*) FROM drive_items WHERE drive_id=d.id) AS items FROM practice_seed_drives p JOIN drives d ON d.id=p.drive_id JOIN users u ON u.id=d.owner WHERE p.seed_key LIKE 'other-organizer-v1:%'").all();
 if(rows.length!==3||rows.some(r=>r.google_sub!==null||r.items!==2))throw Error('Unexpected practice-drive setup.');
 console.log(JSON.stringify(rows.map(({google_sub,...row})=>row),null,2));
}finally{db.close();}
