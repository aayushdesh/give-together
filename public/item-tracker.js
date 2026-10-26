async function itemTracker(driveId){
 const drive=state.drives.find(d=>d.id===driveId);
 if(!drive)return toast('Please refresh to find this drive.');
 modal('<h2>Item tracker</h2><div id="tracker-loading"><p class="help">Loading items…</p></div>');
 const loading=$('#tracker-loading');
 try{
  const items=await api(`/drives/${driveId}/items`);
  if(!loading.isConnected)return;
  const owner=drive.owner===state.user?.id;
  modal(`<span class="eyebrow">${esc(drive.title)}</span><h2>Item tracker</h2><p class="help">See what’s arrived and what’s still needed. ${owner?'Enter the total received so far, not just today’s delivery.':''}</p><div class="item-list">${items.length?items.map(item=>`<article class="tracked-item"><div class="tracked-item-heading"><h3>${esc(item.name)}</h3><span class="badge">${item.remaining===0?'✓ Goal reached':esc(item.remaining)+' still needed'}</span></div><p class="help">${item.donated} received · Goal: ${item.needed}</p><progress class="progress" max="${Math.max(item.needed,item.donated)}" value="${item.donated}" aria-label="${esc(item.name)}: ${item.donated} received out of a goal of ${item.needed}"></progress>${owner?`<button class="secondary small" data-edit-item="${item.id}">Update item</button>`:''}</article>`).join(''):'<p class="help">No item goals yet. '+(owner?'Add your first item below.':'The organizer hasn’t added item goals yet.')+'</p>'}</div>${owner?'<button class="primary" id="add-tracked-item">＋ Add an item</button>':''}<p class="help">Item totals are updated by the organizer. The donor checklist and reminders are managed separately.</p>`);
  if(owner){
   $('#add-tracked-item').onclick=()=>editTrackedItem(driveId);
   document.querySelectorAll('[data-edit-item]').forEach(button=>button.onclick=()=>editTrackedItem(driveId,items.find(i=>i.id===Number(button.dataset.editItem))));
  }
 }catch(e){if(loading.isConnected){loading.innerHTML='<p class="error" role="alert"></p>';loading.querySelector('p').textContent=e.message;}}
}
function editTrackedItem(driveId,item){
 modal(`<h2>${item?'Update item':'Add an item'}</h2><form id="form"><label>Item name<input name="name" maxlength="80" required placeholder="e.g. Cans of food" value="${esc(item?.name||'')}"></label><div class="form-grid"><label>How many are needed?<input name="needed" type="number" step="1" min="1" max="1000000" required value="${item?.needed||''}"></label><label>Total received so far<input name="donated" type="number" step="1" min="0" max="1000000" required value="${item?.donated||0}"></label></div><p class="help">Example: if you had 12 cans and 3 more arrived, enter 15 received. Use the same unit for both numbers.</p>${errorBox}<button type="submit" class="primary">Save item</button><button type="button" class="secondary" id="cancel-item">Back to tracker</button></form>`);
 $('#cancel-item').onclick=()=>itemTracker(driveId);
 bindForm(async data=>{
  await api(`/drives/${driveId}/items${item?'/'+item.id:''}`,{name:data.name,needed:Number(data.needed),donated:Number(data.donated)});
  toast('Item saved.');await itemTracker(driveId);
 });
}
