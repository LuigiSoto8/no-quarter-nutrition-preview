'use strict';
/* One shopping state for recipe and scanned lines. No recipe/pantry mutations. */
(function(){
 const key='NQN.shopping.controls.1';
 let state;try{state=JSON.parse(safeGet(key)||'{}')}catch(_){state={}}
 if(!state||typeof state!=='object'||Array.isArray(state))state={};
 let undo=[];
 const persist=()=>safeSet(key,JSON.stringify(state));
 const originalPurchase=purchaseText;
 const pack=(amount,size,label)=>Math.max(1,Math.ceil((amount-1e-8)/size))+' × '+label;
 purchaseText=function(it){
  if(state[it.key]?.quantity)return state[it.key].quantity;
  const units=window.NQNGroceryLogic;
  if(!units)return originalPurchase(it);
  const parts=[...it.parts];
  const dimensions=[...new Set(parts.map(([unit])=>units.unitInfo(unit)[0]))];
  const dimension=dimensions.length===1?dimensions[0]:null;
  const amount=parts.reduce((sum,[unit,value])=>sum+Number(value)*units.unitInfo(unit)[1],0);
  const name=it.name.toLowerCase();
  if(it.unknown||!dimension||!Number.isFinite(amount)||amount<=0)
    return 'a package that covers your recipe amounts';
  if(dimension==='each'){
    if(/\beggs?\b/.test(name))return pack(amount,12,'dozen eggs');
    return Math.ceil(amount)+' individual '+(Math.ceil(amount)===1?'item':'items');
  }
  if(dimension==='mass'){
    if(name==='ratio yogurt')return pack(amount,24*28.349523125,'24 oz Ratio yogurt tubs');
    if(/greek yogurt|cottage cheese/.test(name))return pack(amount,32*28.349523125,'32 oz tubs');
    if(/banza|chickpea rotini|protein pasta/.test(name))return pack(amount,8*28.349523125,'8 oz pasta boxes');
    if(/cheddar|mozzarella|shredded cheese/.test(name))return pack(amount,8*28.349523125,'8 oz cheese packages');
    if(/potatoes?/.test(name)){
      if(amount<=453.59237)return 'about 1 lb of potatoes';
      if(amount<=907.18474)return '1 × 2 lb bag of potatoes';
      return pack(amount,5*453.59237,'5 lb bags of potatoes');
    }
    if(/chicken|turkey|beef|steak|salmon|shrimp|fish/.test(name))return pack(amount,453.59237,'1 lb meat or seafood packages');
    if(/oat flour|rolled oats|uncooked rice|dry rice/.test(name)){
      if(amount<=453.59237)return '1 × 1 lb bag';
      return pack(amount,907.18474,'2 lb bags');
    }
  }
  if(dimension==='volume'){
    if(/egg whites/.test(name))return pack(amount,16*29.5735295625,'16 fl oz egg-white cartons');
    if(/fairlife/.test(name)&&/milk/.test(name))return pack(amount,52*29.5735295625,'52 fl oz fairlife bottles');
    if(/milk/.test(name)){
      if(amount<=946.352946)return '1 quart carton of milk';
      if(amount<=1892.705892)return '1 half-gallon carton of milk';
      return pack(amount,3785.411784,'1 gallon milk containers');
    }
    if(/blueberr/.test(name))return pack(amount,473.176473,'1 pint containers of blueberries');
    if(/vanilla extract|olive oil|vinegar/.test(name))return '1 bottle';
  }
  if(/cinnamon|sea salt|baking powder|paprika|garlic powder|onion powder|seasoning/.test(name))return '1 standard spice or baking container';
  return 'a standard package covering the recipe quantities';
 };
 const saveAll=()=>{persist();persistShopping();safeSet(checkedKey,JSON.stringify([...checked]));};
 const controls=(id,name,done)=>'<div class="grocery-controls"><label class="purchase-check"><input type="checkbox" data-shop-check="'+escapeHtml(id)+'" '+(done?'checked':'')+'> Purchased</label><button class="btn mini ghost" data-shop-edit="'+escapeHtml(id)+'" aria-label="Edit shopping quantity for '+escapeHtml(name)+'">Edit quantity</button><button class="btn mini ghost" data-shop-remove="'+escapeHtml(id)+'" aria-label="Remove '+escapeHtml(name)+' from shopping list">Remove</button></div>';
 const editDialog=document.createElement('dialog');
 editDialog.id='nqn-shop-edit-dialog';
 editDialog.className='nqn-shop-edit-dialog';
 editDialog.innerHTML='<form id="nqn-shop-edit-form"><div class="eyebrow">SHOPPING LIST</div><h3>Edit purchase amount</h3><p id="nqn-shop-edit-name" class="fine"></p><label for="nqn-shop-edit-input">What would you like to buy?<input id="nqn-shop-edit-input" type="text" maxlength="160" autocomplete="off" placeholder="e.g. 2 cartons"></label><p class="fine">Leave blank to restore the automatic package suggestion. Your recipe measurements stay unchanged.</p><div class="actions"><button class="btn" type="submit">Save amount</button><button class="btn secondary" type="button" id="nqn-shop-edit-cancel">Cancel</button></div></form>';
 document.body.append(editDialog);
 let activeEditId=null;
 function openQuantityEditor(id){
  activeEditId=id;
  const item=groceryItems().map(balanceItem).find(it=>it.key===id);
  const scan=id.startsWith('scan:')?shoppingExtras.find(p=>'scan:'+p.code===id):null;
  editDialog.querySelector('#nqn-shop-edit-name').textContent=item?.name||scan?.name||'Shopping item';
  editDialog.querySelector('#nqn-shop-edit-input').value=state[id]?.quantity||'';
  editDialog.showModal();
  editDialog.querySelector('#nqn-shop-edit-input').focus();
 }
 editDialog.querySelector('#nqn-shop-edit-cancel').addEventListener('click',()=>editDialog.close());
 editDialog.addEventListener('close',()=>{activeEditId=null});
 editDialog.querySelector('form').addEventListener('submit',event=>{
  event.preventDefault();
  if(!activeEditId)return;
  const value=editDialog.querySelector('#nqn-shop-edit-input').value.trim();
  if(value)state[activeEditId]={...state[activeEditId],quantity:value};
  else delete state[activeEditId];
  persist();editDialog.close();renderGroceries();
  notify(value?'Shopping amount updated.':'Suggested package amount restored.');
 });
 renderExtraShopping=function(){
  const el=$('#shopping-extra-items');if(!el)return;
  el.innerHTML=shoppingExtras.map(p=>{const id='scan:'+p.code;return '<div class="grocery-row"><div class="grocery-detail"><strong>'+escapeHtml(p.name)+'</strong><span>'+escapeHtml(state[id]?.quantity||('1 package, '+p.size+' '+p.unit+' (confirm label)'))+'</span>'+controls(id,p.name,checked.has(id))+'</div></div>'}).join('')||'<p class="fine">No scanned products selected.</p>';
 };
 renderGroceries=function(){
  renderPantry();renderExtraShopping();
  const items=groceryItems().map(balanceItem).filter(x=>!x.fullyCovered&&shoppingSelected.has(x.key));
  const el=$('#grocery-list');
  el.innerHTML='<div class="actions"><button class="btn mini secondary" data-shop-clear>Clear purchased</button><button class="btn mini ghost" data-shop-undo '+(!undo.length?'disabled':'')+'>Undo removal</button></div>'+(items.length?items.map(it=>'<div class="grocery-row"><div class="grocery-detail"><strong>'+escapeHtml(it.name)+'</strong><div class="buy-line"><span class="buy-text">Buy '+escapeHtml(purchaseText(it))+'</span><small class="nqn-package-note">'+(state[it.key]?.quantity?'Your custom amount':'Suggested package size · confirm with the store')+'</small></div><details><summary>Recipe quantities</summary><small>Still need: '+escapeHtml(recipeNeed(it))+'</small></details>'+controls(it.key,it.name,checked.has(it.key))+'</div></div>').join(''):'<div class="empty">No missing ingredients selected. Add ingredients from My Pantry → Still Need.</div>');
 };
 function remove(ids){
  const snapshot=ids.map(id=>({id,selected:shoppingSelected.has(id),extra:id.startsWith('scan:')?shoppingExtras.find(p=>'scan:'+p.code===id):null,checked:checked.has(id)}));
  undo.push(snapshot);if(undo.length>20)undo.shift();
  ids.forEach(id=>{shoppingSelected.delete(id);shoppingExtras=shoppingExtras.filter(p=>'scan:'+p.code!==id);checked.delete(id)});
  saveAll();renderMissing();renderGroceries();
 }
 document.addEventListener('click',e=>{
  const removeBtn=e.target.closest('[data-shop-remove]');if(removeBtn){remove([removeBtn.dataset.shopRemove]);return}
  const edit=e.target.closest('[data-shop-edit]');if(edit){openQuantityEditor(edit.dataset.shopEdit);return;}
  if(e.target.closest('[data-shop-clear]')){const ids=[...checked].filter(id=>shoppingSelected.has(id)||shoppingExtras.some(p=>'scan:'+p.code===id));if(ids.length)remove(ids);return}
  if(e.target.closest('[data-shop-undo]')){
   const batch=undo.pop();if(!batch)return;
   batch.forEach(x=>{if(x.selected)shoppingSelected.add(x.id);if(x.extra&&!shoppingExtras.some(p=>p.code===x.extra.code))shoppingExtras.push(x.extra);if(x.checked)checked.add(x.id)});
   saveAll();renderMissing();renderGroceries();
  }
 });
 document.addEventListener('change',e=>{if(!e.target.matches('[data-shop-check]'))return;const id=e.target.dataset.shopCheck;if(e.target.checked)checked.add(id);else checked.delete(id);saveAll()});
 renderGroceries();
})();
