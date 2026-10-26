globalThis.DonationCheck = (() => {
  function options(list) {
    return String(list).split(/[,;\n]+|\s+(?:and|or|&)\s+/i)
      .map(item => item.replace(/^\s*(?:and|or)\s+/i, '').trim())
      .filter(Boolean);
  }
  function normalize(item) {
    return item.normalize('NFKC').toLowerCase().trim()
      .replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  }
  function withoutQuantity(item) {
    return normalize(item).replace(/^\d+(?:\.\d+)?\s+(?:(?:bags?|boxes?|cans?|packs?|bottles?|pairs?)\s+of\s+)?/, '');
  }
  function check(list, pledge) {
    const accepted = options(list);
    const entered = options(pledge);
    const valid = entered.length > 0 && entered.every(item => accepted.some(
      option => normalize(item) === normalize(option) || withoutQuantity(item) === normalize(option)
    ));
    return {valid, message: valid ? '' : `Please bring ${accepted.join(', ')}. Choose from this drive’s list; use the item buttons if you need help.`};
  }
  return {options, check};
})();

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories=['All drives','Food','Toys','Clothes','School supplies','Other'];
const icons={Food:'🍎',Toys:'🧸',Clothes:'🧣','School supplies':'📚',Other:'💛'};
let studentFeatures={ideas:{},progressMessages:[]};
let state={user:null,drives:[],mine:[]},view='explore',filter='All drives',toastTimer;
const ended=d=>Boolean(d.closed)||d.deadline<new Date().toISOString().slice(0,10);
const date=s=>new Date(s+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
async function api(url,data){const r=await fetch('/api'+url,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'Please try again.'),{status:r.status});return result;}
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',5000);}
function modal(html){$('#modal-content').innerHTML=html;const heading=$('#modal-content h2');if(heading){heading.id='dialog-title';$('#modal').setAttribute('aria-labelledby','dialog-title');}if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();}
$('#close-modal').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
async function refresh(){state=await api('/state');render();}
function render(){
 $('#account').innerHTML=state.user?`<button class="nickname-button" id="nickname">Hi, ${esc(state.user.name)}! ✎</button><button class="link-button" id="logout">Sign out</button>`:'<button class="secondary small" id="signin">Join with Google ↗</button>';
 if(state.user)$('#nickname').onclick=()=>nickname();
 if(state.user)$('#logout').onclick=()=>run(async()=>{await api('/logout',{});window.google?.accounts.id.disableAutoSelect();view='explore';await refresh();});else $('#signin').onclick=()=>auth();
 $('#stat-drives').textContent=state.drives.filter(d=>!ended(d)).length;$('#stat-joined').textContent=state.drives.reduce((a,d)=>a+d.joined,0);$('#stat-received').textContent=state.drives.reduce((a,d)=>a+d.received,0);
 $('#my-count').textContent=state.mine.filter(s=>!s.donated&&state.drives.some(d=>d.id===s.drive_id&&!ended(d))).length||'';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));

 $('#filters').innerHTML=categories.map(c=>`<button class="filter ${c===filter?'active':''}" aria-pressed="${c===filter}" data-category="${c}">${c==='All drives'?'':icons[c]+' '}${c}</button>`).join('');
 document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{filter=b.dataset.category;render();});
 const pending=state.mine.filter(s=>!s.donated&&!s.reported_at&&s.reminders&&state.drives.some(d=>d.id===s.drive_id&&!ended(d)));
 $('#reminder-panel').hidden=!pending.length;
 $('#reminder-panel').innerHTML=pending.length?`<div class="reminder"><div><h3>♡ A friendly nudge: ${pending.length} donation${pending.length===1?'':'s'} to drop off</h3><p>Check My giving for the details. Plans changed? You can leave a drive anytime.</p></div><button class="secondary small" id="enable-notifications">Turn on pop-up reminders</button></div>`:'';
 if(pending.length)$('#enable-notifications').onclick=()=>run(async()=>{if(!('Notification'in window)){toast('This browser supports in-app reminders only.');return;}const p=await Notification.requestPermission();toast(p==='granted'?'Browser reminders are on while this site is open.':'You can still see reminders here in the app.');if(p==='granted')await checkReminders();});
 const q=$('#search').value.trim().toLowerCase();
 const signedUp=new Set(state.user?state.mine.map(s=>s.drive_id):[]);
 const matching=state.drives.filter(d=>(filter==='All drives'||d.category===filter)&&($('#show-ended').checked||!ended(d))&&`${d.title} ${d.description} ${d.items} ${d.location}`.toLowerCase().includes(q));
 const created=state.user?matching.filter(d=>d.owner===state.user.id):[];
 const joined=state.user?matching.filter(d=>d.owner!==state.user.id&&signedUp.has(d.id)):[];
 const drives=matching.filter(d=>(!state.user||d.owner!==state.user.id)&&!signedUp.has(d.id));
 $('#new-count').textContent=drives.length;
 $('#joined-count').textContent=joined.length;
 $('#created-count').textContent=created.length;
 $('#new-title-text').textContent=state.user?'New to you':'Discover drives';
 $('#cards').innerHTML=drives.length?drives.map(card).join(''):`<div class="empty"><h3>No new drives here yet.</h3><p>${q||filter!=='All drives'?'Try another search or category.':'Check the groups below for drives you’ve joined or created.'}</p></div>`;
 function personalCards(list,type){
  if(!state.user)return `<div class="empty"><h3>Your ${type==='mine'?'giving':'drives'}, all in one place.</h3><p>Sign in to see the drives you’ve ${type==='mine'?'joined':'created'}.</p><button class="primary" data-personal-signin="${type}">Join with Google ↗</button></div>`;
  if(list.length)return list.map(card).join('');
  if(q||filter!=='All drives')return '<div class="empty"><p>No drives in this group match your search.</p></div>';
  return type==='mine'?'<div class="empty"><h3>Your giving starts here.</h3><p>Explore drives to find one to join. Your sign-ups and completed donations will appear here.</p><a class="primary text-link" href="#drives">Explore drives ↗</a></div>':'<div class="empty"><h3>Your first drive starts here.</h3><p>Create a drive to bring people together. Your drives and checklists will appear here.</p><button class="primary" data-create>＋ Start a drive</button></div>';
 }
 $('#giving-cards').innerHTML=personalCards(joined,'mine');
 $('#created-cards').innerHTML=personalCards(created,'created');
 document.querySelectorAll('[data-personal-signin]').forEach(b=>b.onclick=()=>auth(false,()=>selectView(b.dataset.personalSignin)));
 document.querySelectorAll('[data-create]').forEach(b=>b.onclick=create);
 document.querySelectorAll('[data-items]').forEach(b=>b.onclick=()=>itemTracker(Number(b.dataset.items)));
 document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>details(Number(b.dataset.detail)));
 document.querySelectorAll('[data-manage]').forEach(b=>b.onclick=()=>run(()=>manage(Number(b.dataset.manage))));

 if($('#examples'))$('#examples').onclick=seed;
 updateActiveSection();
}
function card(d){const s=state.mine.find(s=>s.drive_id===d.id),owner=d.owner===state.user?.id;return `<article class="card"><div class="card-art ${d.category==='School supplies'?'school':d.category.toLowerCase()}"><span class="category-label">${esc(d.category)}${ended(d)?' · Ended':''}</span><span aria-hidden="true">${icons[d.category]}</span></div><div class="card-body">${state.user?`<span class="relationship">${owner?'Created by you':s?'You’ve joined':'New to you'}</span>`:''}<h3>${esc(d.title)}</h3><p class="description">${esc(d.description.length>115?d.description.slice(0,112)+'…':d.description)}</p><div class="meta">⌖ ${esc(d.location)}<br>◷ Drop off by ${date(d.deadline)}</div>${s?`<div class="badge ${s.donated?'':'pending'}">${s.donated?'✓ Your donation was received. Thank you!':s.reported_at?'↗ Drop-off reported · Awaiting confirmation':'♡ You’re signed up · Drop-off pending'}</div>`:''}<progress class="progress" value="${d.received}" max="${Math.max(d.goal,d.received)}" aria-label="${d.received} of ${d.goal} donor goal"></progress><div class="progress-text"><span><b>${d.received}</b> of ${d.goal} donors gave</span><span>${d.joined} signed up</span></div><p class="python-message">${esc(studentFeatures.progressMessages[Math.min(100,Math.floor(d.received/d.goal*100))]||'Every little gift helps.')}</p>${owner&&d.awaiting_confirmation?`<div class="badge pending">${d.awaiting_confirmation} drop-off${d.awaiting_confirmation===1?'':'s'} to confirm</div>`:''}<div class="card-actions"><button class="${owner?'secondary':'primary'} small" data-detail="${d.id}">${s||ended(d)?'View details':owner?'View drive':'I’d like to help'} ↗</button>${owner?`<button class="primary small" data-manage="${d.id}">Checklist</button>`:''}</div><button class="link-button tracker-link" data-items="${d.id}">${owner?'Item tracker':'Items needed'} ↗</button></div></article>`;}
function bindForm(action){$('#form').onsubmit=async e=>{e.preventDefault();const button=$('#form button[type="submit"]');button.disabled=true;$('#form-error').textContent='';try{await action(Object.fromEntries(new FormData(e.target)));}catch(e){$('#form-error').textContent=e.message;}finally{button.disabled=false;}};}
const errorBox='<div id="form-error" class="error" role="alert"></div>';
function create(){if(!ready(create))return;modal(`<span class="eyebrow">BRING PEOPLE TOGETHER</span><h2>Start something good.</h2><form id="form"><label>Drive name<input name="title" placeholder="e.g. Our neighborhood food drive" required maxlength="80"></label><div class="form-grid"><label>What are you collecting?<select name="category">${categories.slice(1).map(c=>`<option>${c}</option>`).join('')}</select></label><label>How many helpers?<input name="goal" type="number" value="20" min="1" max="10000" required></label></div><label>Tell people about your drive<textarea name="description" placeholder="Who will this help? Why does it matter?" required maxlength="700"></textarea></label><label>Items people can bring<input name="items" placeholder="e.g. Unopened rice, pasta, and canned vegetables" required maxlength="300"></label><p class="help">Separate items with commas. People will choose from this list when they sign up.</p><label>Public drop-off spot and hours<input name="location" placeholder="e.g. School office, weekdays 3–4 pm" required maxlength="150"></label><p class="help">Plan this with a trusted adult. Choose a school or community spot. Leave out home addresses and phone numbers.</p><label>Last day to donate<input name="deadline" type="date" min="${new Date().toISOString().slice(0,10)}" required></label>${errorBox}<button type="submit" class="primary">Create my drive ↗</button></form>`);bindForm(async data=>{const newDrive=await api('/drives',data);filter='All drives';view='explore';$('#search').value='';await refresh();closeModal();toast('Your drive is ready. Add item goals next!');await itemTracker(newDrive.id);});}
function details(id){const d=state.drives.find(d=>d.id===id),s=state.mine.find(s=>s.drive_id===id);modal(`<span class="eyebrow">${esc(d.category)} DRIVE · BY ${esc(d.host)}</span><h2>${esc(d.title)}</h2><p class="help">${esc(d.description)}</p><div class="detail-block"><strong>What to bring</strong>${esc(d.items)}<strong>Where & when</strong>${esc(d.location)}<br>Drop off by ${date(d.deadline)}</div>${s?`<div class="badge ${s.donated?'':'pending'}">${s.donated?'✓ Received — you made a difference!':s.reported_at?'Drop-off reported. Waiting for the organizer to confirm.':ended(d)?'This drive has ended.':'You’re on the list! The organizer will check you off when you drop off your items.'}</div><p class="help"><b>You signed up to bring:</b> ${esc(s.pledge)}</p>${!s.donated?`<button id="report-dropoff" class="${s.reported_at?'secondary':'primary'}">${s.reported_at?'Undo my drop-off report':'I dropped it off ↗'}</button><p class="help">${s.reported_at?'Reminders are paused while the organizer checks your donation.':'Let the organizer know your items have arrived. They will confirm receipt; item totals are updated separately.'}</p>`:''}${!s.donated&&!s.reported_at&&!ended(d)?`<label class="help"><input id="reminder-toggle" type="checkbox" ${s.reminders?'checked':''}> Remind me until I donate</label><p class="help">In-app reminders appear when you visit. Optional browser alerts run once a day while this site is open. No email or text messages.</p><button class="link-button" id="leave">I can’t take part — leave this drive</button>`:''}`:ended(d)?'<p class="help">This drive has ended. Explore another drive to help out.</p>':`<form id="form"><label>What will you bring?<input id="pledge" name="pledge" aria-describedby="pledge-help form-error" placeholder="Choose below, or type an item from the list" maxlength="200" required></label><p class="help" id="pledge-help">Choose one or more items below. You can add a number, like “3 rice”. Separate different items with commas.</p><div class="pledge-options">${DonationCheck.options(d.items).map((item,i)=>`<button type="button" class="secondary small" data-pledge-option="${i}">${esc(item)}</button>`).join('')}</div><p class="help">We’ll remind you gently. You can turn reminders off or leave anytime — that’s okay! Bring a trusted adult when you drop things off.</p>${errorBox}<button class="primary" type="submit">Count me in ♡</button></form>`}`);
 if($('#pledge')){
  const input=$('#pledge');
  const validate=()=>{const result=DonationCheck.check(d.items,input.value);$('#form-error').textContent=result.message;input.setAttribute('aria-invalid',String(!result.valid));return result.valid;};
  input.onblur=()=>{if(input.value.trim())validate();};
  input.oninput=()=>{$('#form-error').textContent='';input.removeAttribute('aria-invalid');};
  document.querySelectorAll('[data-pledge-option]').forEach(button=>button.onclick=()=>{
   const option=DonationCheck.options(d.items)[Number(button.dataset.pledgeOption)];
   input.value=input.value.trim()?input.value.trim()+', '+option:option;
   validate();input.focus();
  });
 }
 if($('#form'))bindForm(async data=>{const checked=DonationCheck.check(d.items,data.pledge);if(!checked.valid){$('#pledge').setAttribute('aria-invalid','true');$('#pledge').focus();throw Error(checked.message);}if(!ready(()=>details(id)))return;await api(`/drives/${id}/join`,data);await refresh();details(id);toast('You’re on the list. Thank you!');});
 if($('#report-dropoff'))$('#report-dropoff').onclick=()=>run(async()=>{const button=$('#report-dropoff');button.disabled=true;try{await api(`/signups/${s.id}/dropoff`,{droppedOff:!s.reported_at});await refresh();details(id);toast(s.reported_at?'Drop-off report undone.':'Drop-off reported to the organizer. Thank you!');}finally{button.disabled=false;}});
 if($('#reminder-toggle'))$('#reminder-toggle').onchange=e=>run(async()=>{await api(`/signups/${s.id}/reminders`,{enabled:e.target.checked});await refresh();details(id);});
 if($('#leave'))$('#leave').onclick=()=>run(async()=>{await api(`/signups/${s.id}/leave`,{});await refresh();closeModal();toast('You left the drive. Reminders have stopped.');});
}
async function manage(id){const d=state.drives.find(d=>d.id===id),roster=await api(`/drives/${id}/roster`);modal(`<span class="eyebrow">ORGANIZER’S CHECKLIST</span><h2>${esc(d.title)}</h2><p class="help">Reported drop-offs appear first. Check Received after you confirm the items arrived. Reporting alone does not change donation totals.</p>${roster.length?roster.map(s=>`<div class="roster-row"><div><b>${esc(s.name)}</b><small>${esc(s.pledge)}</small>${s.reported_at&&!s.donated?`<small class="dropoff-report">↗ Donor reported a drop-off on ${esc(new Date(s.reported_at).toLocaleString())} · Please confirm</small>`:''}</div><label><input type="checkbox" data-received="${s.id}" ${s.donated?'checked':''}> Received</label></div>`).join(''):'<p class="help">No sign-ups yet. Your drive is ready for people to join.</p>'}<p class="help">${roster.filter(s=>s.donated).length} of ${roster.length} signed-up donors have given.</p>${!d.closed?'<button id="end-drive" class="secondary small">End this drive</button>':'<p class="help">This drive is closed. Reminders have stopped.</p>'}`);
 document.querySelectorAll('[data-received]').forEach(box=>box.onchange=()=>run(async()=>{await api(`/signups/${box.dataset.received}/received`,{donated:box.checked});await refresh();await manage(id);toast(box.checked?'Donation received. Thank you!':'Donation marked pending.');}));
 if($('#end-drive'))$('#end-drive').onclick=()=>{modal('<h2>Finish this drive?</h2><p class="help">This stops new sign-ups and reminders. You can still check off donations already on the list.</p><button id="confirm-end" class="primary">Yes, end this drive</button> <button id="cancel-end" class="secondary">Keep it open</button>');$('#cancel-end').onclick=()=>run(()=>manage(id));$('#confirm-end').onclick=()=>run(async()=>{await api(`/drives/${id}/close`,{});await refresh();await manage(id);});};
}
async function seed(){if(!ready(seed))return;await run(async()=>{const deadline=new Date(Date.now()+14*86400000).toISOString().slice(0,10);for(const d of [{title:'Practice: Fill a pantry, share some hope',category:'Food',description:'An example food drive. Try joining and checking off a donation. This is practice, not a real collection.',items:'Unopened pasta, rice, canned vegetables',location:'Example community center · Not a real drop-off'},{title:'Practice: A little joy for every child',category:'Toys',description:'An example toy drive to help you learn how the site works. No real donations are collected here.',items:'New books, puzzles, and toys',location:'Example library · Not a real drop-off'},{title:'Practice: Warm hearts, warmer days',category:'Clothes',description:'An example clothing drive. Use it to practice organizing a drive with friends.',items:'Clean coats, scarves, and new socks',location:'Example school office · Not a real drop-off'}])await api('/drives',{...d,deadline,goal:20});await refresh();toast('Practice drives added. Try joining one!');});}
async function checkReminders(){if(!state.user||!('Notification'in window)||Notification.permission!=='granted')return;const due=await api('/reminders',{});if(due.length){const n=new Notification('A little kindness is waiting ♡',{body:`You have ${due.length} donation${due.length===1?'':'s'} to drop off. Open My giving for details.`,tag:'give-together-reminder'});n.onclick=()=>{window.focus();selectView('mine');n.close();};}}
async function run(fn){try{await fn();}catch(e){toast(e.message);}}
$('#start').onclick=create;$('#search').oninput=render;$('#show-ended').onchange=render;
const sectionIds={explore:'drives',mine:'my-giving',created:'my-drives',centers:'donation-centers'};
function selectView(next){
 view=next;
 $('#'+sectionIds[next]).scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 updateActiveSection();
}
function updateActiveSection(){
 let active='explore';
 for(const [key,id] of Object.entries(sectionIds))if($('#'+id).getBoundingClientRect().top<=180)active=key;
 view=active;
 document.querySelectorAll('[data-view]').forEach(link=>{link.classList.toggle('active',link.dataset.view===active);if(link.dataset.view===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
}
window.addEventListener('scroll',updateActiveSection,{passive:true});
window.addEventListener('hashchange',updateActiveSection);
run(async()=>{await refresh();if(state.user&&!state.user.nickname_set)nickname();await checkReminders();});
setInterval(()=>run(async()=>{await refresh();await checkReminders();}),60000);

$('#privacy').onclick=()=>modal('<h2>Your privacy matters.</h2><p class="help">Google checks who you are. We save your Google account ID, your nickname, and your drives and sign-ups on this computer. We do not save your Google email, name, photo, or password.</p><p class="help">Your nickname appears on drives you organize. Only a drive’s organizer can see its full donation checklist. Please leave personal contact details out of anything you write.</p><p class="help">You can turn reminders off, leave a drive, or sign out anytime. There are no public donor rankings or private messages here.</p>');
fetch('/student-features.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{studentFeatures=data;render();}).catch(()=>{});
$('#ideas').onclick=()=>{
 modal('<h2>What could I give?</h2><p class="help">Pick a category for ideas, then check what your drive accepts.</p><form><label>Category<select id="idea-category">'+categories.slice(1).map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></label></form><ul id="idea-list" class="help"></ul>');
 const show=()=>{$('#idea-list').innerHTML=(studentFeatures.ideas[$('#idea-category').value]||['Ask the organizer what they need most.']).map(item=>'<li>'+esc(item)+'</li>').join('');};
 $('#idea-category').onchange=show;show();
};
let quoteLoading=false;
async function showDailyQuote(){
 if(quoteLoading)return;
 const target=document.getElementById('daily-quote');
 if(!target)return;
 quoteLoading=true;
 try {const data=await api('/daily-quote');target.textContent=data.quote;}
 catch {target.textContent='A little kindness goes a long way.';}
 finally {quoteLoading=false;}
}
showDailyQuote();
setInterval(()=>{if(!document.hidden)showDailyQuote();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)showDailyQuote();});

let centerRequest=0;
async function findCenters() {
 const zip=$('#center-zip').value.trim(),kind=$('#center-kind').value;
 const request=++centerRequest;
 $('#center-results').innerHTML='';
 if(!/^\d{5}$/.test(zip)){$('#center-status').textContent='Enter a five-digit U.S. ZIP code.';return;}
 $('#center-status').textContent='Looking for centers…';
 $('#center-results').setAttribute('aria-busy','true');
 try {
  const rows=await api('/centers?zip='+encodeURIComponent(zip)+'&kind='+encodeURIComponent(kind));
  if(request!==centerRequest)return;
  $('#center-status').textContent=rows.length?`${rows.length} center${rows.length===1?'':'s'} listed in ${zip}.`:`No matching centers are listed in ${zip} yet. This does not mean there are none. Try another ZIP, add a center, or use the nationwide directory below.`;
  $('#center-results').innerHTML=rows.map(c=>`<article class="card center-card"><div class="card-body"><span class="eyebrow">${esc(c.kind)}</span><h3>${esc(c.name)}</h3><p class="meta">${esc(c.address)}</p><p><b>What to bring</b><br>${esc(c.items)}</p><p class="help">${esc(c.notes)}</p><p class="badge">${c.checked_on?`Source checked ${esc(c.checked_on)}`:'Community listing · not verified'}</p><a class="secondary small center-website" href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">${c.checked_on?'Official donation information':'Visit listed website'} ↗</a></div></article>`).join('');
 } catch(error) {
  if(request!==centerRequest)return;
  $('#center-status').textContent=[401,404].includes(error.status)?'The center directory needs the updated server. In VS Code, stop the server with Ctrl+C and run npm.cmd start, then search again.':'Could not load the directory. Please try again. '+error.message;
 } finally {if(request===centerRequest)$('#center-results').removeAttribute('aria-busy');}
}
$('#center-search').onsubmit=e=>{e.preventDefault();findCenters();};
$('#center-kind').onchange=()=>{if($('#center-zip').value.trim())findCenters();};
$('#center-zip').oninput=()=>{++centerRequest;$('#center-results').innerHTML='';$('#center-results').removeAttribute('aria-busy');$('#center-status').textContent='Press Find centers to search this ZIP code.';};
function addCenterForm() {
 if(!ready(addCenterForm))return;
 modal(`<span class="eyebrow">HELP OUR DIRECTORY GROW</span><h2>Add a donation center</h2><p class="help">Use public details from the organization’s website. This listing will be searchable and labeled “Community listing · not verified.” Adding a listing does not prove an affiliation with the organization. Do not enter a home address.</p><form id="form"><label>Organization name<input name="name" required maxlength="100"></label><label>Organization type<select name="kind"><option>Nonprofit</option><option>City program</option></select></label><label>ZIP code<input name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" required></label><label>Public donation-center address<input name="address" maxlength="200" required></label><label>Organization’s donation webpage<input name="website" type="url" placeholder="https://…" maxlength="500" required></label><label>Accepted items<textarea name="items" maxlength="400" required></textarea></label><label>Drop-off instructions<textarea name="notes" placeholder="Hours, appointments, or how to confirm details" maxlength="400" required></textarea></label>${errorBox}<button type="submit" class="primary">Add to directory</button></form>`);
 bindForm(async data=>{await api('/centers',data);closeModal();$('#center-zip').value=data.zip;$('#center-kind').value='';selectView('centers');await findCenters();toast('Center added as a community listing.');});
}
$('#add-center').onclick=addCenterForm;
