import {readFileSync} from 'node:fs';

export function setupCenters(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS donation_centers (
    id INTEGER PRIMARY KEY, seed_key TEXT UNIQUE, name TEXT NOT NULL,
    kind TEXT NOT NULL, zip TEXT NOT NULL, address TEXT NOT NULL,
    items TEXT NOT NULL, website TEXT NOT NULL, notes TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '', checked_on TEXT NOT NULL DEFAULT '',
    submitted_by INTEGER REFERENCES users(id),
    UNIQUE(name, zip, address)
  ); CREATE INDEX IF NOT EXISTS centers_zip ON donation_centers(zip);`);
  const seeds=JSON.parse(readFileSync(new URL('donation-centers.json',import.meta.url),'utf8'));
  const insert=db.prepare(`INSERT OR IGNORE INTO donation_centers
    (seed_key,name,kind,zip,address,items,website,notes,source,checked_on)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for(const c of seeds)insert.run(c.key,c.name,c.kind,c.zip,c.address,c.items,c.website,c.notes,c.source,'2026-10-18');
}

export function searchCenters(db,zip,kind='') {
  if(!/^\d{5}$/.test(zip))throw Object.assign(Error('Enter a five-digit U.S. ZIP code.'),{status:400});
  if(!['','Nonprofit','City program'].includes(kind))throw Object.assign(Error('Choose a listed organization type.'),{status:400});
  return db.prepare(`SELECT id,name,kind,zip,address,items,website,notes,source,checked_on
    FROM donation_centers WHERE zip=? AND (?='' OR kind=?) ORDER BY name COLLATE NOCASE`).all(zip,kind,kind);
}

export function addCenter(db,b,userId) {
  const fail=message=>{throw Object.assign(Error(message),{status:400});};
  const text=(key,max)=>{if(typeof b[key]!=='string'||!b[key].trim()||b[key].trim().length>max)fail(`Please fill in ${key} (up to ${max} characters).`);return b[key].trim();};
  const name=text('name',100),kind=text('kind',30),zip=text('zip',5),address=text('address',200),items=text('items',400),notes=text('notes',400);
  if(!/^\d{5}$/.test(zip))fail('Enter a five-digit U.S. ZIP code.');
  if(!['Nonprofit','City program'].includes(kind))fail('Choose a listed organization type.');
  let website;
  try {website=new URL(text('website',500));}catch{fail('Enter the organization’s full HTTPS website address.');}
  if(website.protocol!=='https:'||website.username||website.password||!website.hostname.includes('.'))fail('Use a public HTTPS website address without login details.');
  if(db.prepare('SELECT count(*) AS n FROM donation_centers WHERE submitted_by=?').get(userId).n>=10)fail('You can add up to ten centers.');
  if(db.prepare('SELECT id FROM donation_centers WHERE lower(name)=lower(?) AND zip=? AND lower(address)=lower(?)').get(name,zip,address))fail('That center is already listed.');
  const result=db.prepare(`INSERT INTO donation_centers(name,kind,zip,address,items,website,notes,submitted_by) VALUES(?,?,?,?,?,?,?,?)`).run(name,kind,zip,address,items,website.href,notes,userId);
  return {id:Number(result.lastInsertRowid)};
}
