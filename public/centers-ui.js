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
