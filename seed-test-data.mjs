import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const db=new DatabaseSync(path.join(root,'data','give-together.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
try {
 const owners=db.prepare('SELECT id FROM users WHERE google_sub IS NOT NULL AND nickname_set=1').all();
 const requested=process.argv[2];
 const owner=requested?owners.find(u=>u.id===Number(requested)):owners.length===1?owners[0]:null;
 if(!owner)throw Error('Sign in and choose a nickname first. If there are multiple real accounts, run node seed-test-data.mjs YOUR_USER_ID.');
 const backupDir=path.join(root,'data','backups');mkdirSync(backupDir,{recursive:true});
 await backup(db,path.join(backupDir,`before-test-data-${Date.now()}.sqlite`));
 db.exec('BEGIN IMMEDIATE');
 try {
  db.exec('CREATE TABLE IF NOT EXISTS practice_seed_drives(seed_key TEXT PRIMARY KEY, drive_id INTEGER NOT NULL REFERENCES drives(id))');
  const people=[['koala','Test Kind Koala'],['otter','Test Happy Otter'],['panda','Test Helpful Panda'],['fox','Test Friendly Fox'],['owl','Test Caring Owl'],['rabbit','Test Sunny Rabbit']];
  const users=people.map(([key,name])=>{
   const username='practice-donor:'+key;
   db.prepare('INSERT OR IGNORE INTO users(name,username,salt,hash,nickname_set) VALUES(?,?,?, ?,1)').run(name,username,'','');
   const user=db.prepare('SELECT id,google_sub FROM users WHERE username=?').get(username);
   if(user.google_sub!==null)throw Error('Practice account name is already used by a real account.');
   return user.id;
  });
  const deadline=new Date(Date.now()+21*86400000).toISOString().slice(0,10);
  const fixtures=[
   {key:'food',title:'Practice: Community Food Drive',category:'Food',items:'Rice, pasta, and canned vegetables',pledges:['2 bags of rice','3 cans of beans','1 box of pasta','4 cans of vegetables','2 boxes of cereal','3 cans of soup'],received:[0,3]},
   {key:'toys',title:'Practice: Share a Little Joy',category:'Toys',items:'New toys, puzzles, and books',pledges:['1 puzzle','2 picture books','1 toy car','1 board game','1 teddy bear','2 coloring books'],received:[1]}
  ];
  for(const f of fixtures){
   const key=`sample-v1:${owner.id}:${f.key}`;
   let entry=db.prepare('SELECT drive_id FROM practice_seed_drives WHERE seed_key=?').get(key);
   if(!entry){
    const result=db.prepare('INSERT INTO drives(owner,title,category,description,items,location,deadline,goal) VALUES(?,?,?,?,?,?,?,?)').run(owner.id,f.title,f.category,'TEST DATA ONLY. These are fictional donors and donations for trying the checklist. No real collection is happening.',f.items,'Practice location — not a real drop-off',deadline,10);
    entry={drive_id:Number(result.lastInsertRowid)};
    db.prepare('INSERT INTO practice_seed_drives VALUES(?,?)').run(key,entry.drive_id);
   }
   users.forEach((id,i)=>db.prepare('INSERT OR IGNORE INTO signups(drive_id,user_id,pledge,donated,reminders) VALUES(?,?,?,?,0)').run(entry.drive_id,id,f.pledges[i],f.received.includes(i)?1:0));
  }
  db.exec('COMMIT');
  console.log('Ready: 6 test donors across 2 practice drives, owned by your account.');
  console.log('New data starts with 3 received donations and 9 pending donations. Reruns preserve changes.');
  console.log('Test donors cannot log in and their reminders are off.');
 }catch(e){db.exec('ROLLBACK');throw e;}
}finally{db.close();}
