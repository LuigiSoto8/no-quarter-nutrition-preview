"use strict";
/* NQN client-side auto planning with location-scoped price adapter.
   No retailer secrets in browser; genuine prices only from an authenticated backend. */
(function () {
  const logic=window.NQNGroceryLogic;
  if(!logic)return;
  const zipKey='NQN.client.grocery.zip.1',retailerKey='NQN.client.grocery.retailer.1';
  const budgetKey='NQN.client.grocery.budget.1',headsKey='NQN.client.grocery.household.1';
  const deferredKey='NQN.client.grocery.setupDeferred.1';
  const groceryForm=document.getElementById('nqn-budget-form');
  const zipField=document.getElementById('nqn-budget-zip');
  const retailerField=document.getElementById('nqn-budget-store');
  const budgetField=document.getElementById('nqn-budget-limit');
  const householdField=document.getElementById('nqn-budget-servings');
  const storeField=document.getElementById('nqn-budget-specific-store');
  const storeStatus=document.getElementById('nqn-budget-store-status');
  const priceStatus=document.getElementById('nqn-budget-prices');
  const result=document.getElementById('nqn-budget-result');
  const setupDialog=document.getElementById('nqn-shopping-setup-dialog');
  const setupForm=document.getElementById('nqn-shopping-setup-form');
  if(!groceryForm || !logic || !zipField)return;
  const providerBase=typeof window.NQN_PRICING_ENDPOINT==='string' &&
    /^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[a-z0-9/_-]*)?$/i.test(window.NQN_PRICING_ENDPOINT)?
    window.NQN_PRICING_ENDPOINT.replace(/\/+$/,''):null;
  let providerStoreOptions=[];
  let proposal=null;
  let loading=false;
  const money=n=>'$'+Number(n).toFixed(2);
  const safe=v=>htmlEscape(String(v));
  const isZip=z=>/^[0-9]{5}$/.test(String(z||'').trim());

  function restoreProfile(){
    const storedZip=safeGet(zipKey);
    if(isZip(storedZip))zipField.value=storedZip;
    const preferred=safeGet(retailerKey);
    if(preferred && [...retailerField.options].some(o=>o.value===preferred))retailerField.value=preferred;
    if(safeGet(budgetKey))budgetField.value=safeGet(budgetKey);
    if(safeGet(headsKey))householdField.value=safeGet(headsKey);
  }
  function saveProfile(){
    const zip=zipField.value.trim();
    if(!isZip(zip))return false;
    safeSet(zipKey,zip);
    safeSet(retailerKey,retailerField.value);
    safeSet(budgetKey,budgetField.value);
    safeSet(headsKey,householdField.value);
    return true;
  }
  function showPriceStatus(message){
    priceStatus.textContent=message;
  }
  function selectedStore(){
    if(!providerBase)return null;
    return providerStoreOptions.find(x=>x.id===storeField.value)||null;
  }
  async function discoverStores(){
    providerStoreOptions=[];
    storeField.innerHTML='<option value="">Select a nearby store</option>';
    storeField.disabled=true;
    if(!isZip(zipField.value)){
      storeStatus.textContent='Enter a five-digit ZIP code to find a local store.';
      return;
    }
    if(!providerBase){
      storeStatus.textContent='Preferred retailer saved for this location. Live store and price lookup is not yet connected to this test site.';
      return;
    }
    storeStatus.textContent='Looking for participating stores…';
    try{
      const params=new URLSearchParams({zip:zipField.value.trim(),retailer:retailerField.value});
      const response=await fetch(providerBase+'/v1/stores?'+params,{credentials:'omit',mode:'cors'});
      if(!response.ok)throw Error('The store service is unavailable (HTTP '+response.status+').');
      const body=await response.json();
      const stores=Array.isArray(body?.stores)?body.stores:[];
      providerStoreOptions=stores.filter(x=>x && typeof x.id==='string' &&
        x.id.length<=48 && typeof x.name==='string' && x.name.length<=180 &&
        typeof x.address==='string' && x.address.length<=300);
      providerStoreOptions.forEach(store=>{
        const opt=document.createElement('option');
        opt.value=store.id;
        opt.textContent=store.name+' · '+store.address;
        storeField.appendChild(opt);
      });
      storeField.disabled=!providerStoreOptions.length;
      storeStatus.textContent=providerStoreOptions.length?
        'Choose the exact participating store for location-specific prices.':
        'No supported live-price stores found for this retailer and ZIP code.';
    }catch(error){
      storeStatus.textContent='Local store lookup failed. You can still generate meals and a shopping list without prices.';
    }
  }

  function eligibleGroups() {
    return logic.groupBySlot(recipes,NQN_COOKBOOK_CATALOG,hasRecipeNutrition);
  }
  function missingCategories(groups) {
    return ['Breakfast','Lunch','Dinner','Snack'].filter(slot=>!groups[slot].length);
  }
  function recipeBy(id){return recipeById(id);}
  function availableIngredientChoices(groups,servings){
    // Price the pool of all currently usable recipes, not a guessed product per person.
    const map=new Map();
    for(const slot of ['Breakfast','Lunch','Dinner','Snack']){
      for(const recipe of groups[slot]){
        const testWeek=logic.blankWeek();
        testWeek[0][slot]={recipeId:recipe.id,servings:servings};
        logic.aggregate(testWeek,recipeBy,pantry).forEach(item=>{
          if(!map.has(item.key))map.set(item.key,item);
          else if(item.amount>map.get(item.key).amount)map.set(item.key,item);
        });
      }
    }
    return [...map.values()];
  }
  async function fetchPriceBook(groups,servings){
    if(!providerBase)return {prices:null,note:'Live price integration has not been activated for this preview.'};
    const store=selectedStore();
    if(!store)return {prices:null,note:'Choose a participating physical store before requesting its live prices.'};
    const productLines=availableIngredientChoices(groups,servings);
    if(productLines.length>120)return {prices:null,note:'Too many unique items to verify in one request.'};
    const payload={zip:zipField.value.trim(),retailer:retailerField.value,storeId:store.id,
      ingredients:productLines.map(item=>({key:item.key,name:item.name,unit:item.unit,
        dimension:item.dimension,quantity:item.amount}))};
    const response=await fetch(providerBase+'/v1/price-book',{
      method:'POST',credentials:'omit',mode:'cors',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!response.ok)throw Error('Store-price service returned HTTP '+response.status);
    const body=await response.json();
    if(body?.storeId!==store.id || body?.zip!==payload.zip ||
       !body?.quotedAt || typeof body?.prices!=='object' || Array.isArray(body.prices))
      throw Error('Store-pricing response failed location or timestamp validation');
    // Never treat guessed matches or missing package units as verified quotations.
    const validated={};
    productLines.forEach(item=>{
      const q=body.prices[item.key];
      if(!q||q.status!=='verified'||!q.sku||!q.quotedAt)return;
      if(typeof q.packagePrice!=='number'||!Number.isFinite(q.packagePrice)||q.packagePrice<=0)return;
      if(typeof q.packageQuantity!=='number'||!Number.isFinite(q.packageQuantity)||q.packageQuantity<=0)return;
      const checkedTime=Date.parse(q.quotedAt);
      if(!Number.isFinite(checkedTime)||checkedTime>Date.now()+60000 ||
        Date.now()-checkedTime>6*60*60*1000)return;
      validated[item.key]={status:'verified',sku:String(q.sku).slice(0,64),
        title:String(q.title||'').slice(0,160),packageUnit:String(q.packageUnit||'').slice(0,20),
        packageQuantity:q.packageQuantity,packagePrice:q.packagePrice,
        quotedAt:q.quotedAt};
    });
    return {prices:validated,note:'Store prices quoted '+new Date(body.quotedAt).toLocaleString()+'.'};
  }

  function displayGroceryList(items,evalResult) {
    if(!items.length)return '<p class="fine">No meals currently eligible to generate ingredients.</p>';
    const pricedByKey=new Map((evalResult?.lines||[]).map(x=>[x.key,x]));
    return '<div class="nqn-generated-groceries"><h3>Ingredients automatically generated</h3>' +
      '<p class="fine">Combined quantities for this preview, minus measured pantry quantities in compatible units. Unknown pantry amounts cannot be deducted.</p>' +
      '<div class="nqn-generated-items">'+items.map(item=>{
        const priced=pricedByKey.get(item.key);
        return '<div class="nqn-generated-item"><strong>'+safe(item.name)+'</strong>' +
          '<span>Need '+safe(item.amount.toFixed(2))+' '+safe(item.unit) +
          ' · At home '+safe(item.have.toFixed(2))+' '+safe(item.unit) +
          ' · To buy '+safe(item.missing.toFixed(2))+' '+safe(item.unit) +
          (item.unknown?' · Quantity to confirm':'')+'</span>' +
          (priced&&priced.packages!=null?
          '<small>'+priced.packages+' package(s) · '+money(priced.cost)+
          (priced.product?' · '+safe(priced.product):'')+'</small>':'')+
          '</div>';
      }).join('')+'</div></div>';
  }
  function renderProposal(week,calc,groups,statusMessage,budget){
    const all=logic.aggregate(week,recipeBy,pantry);
    proposal={week:week,items:all,quoted:calc,store:selectedStore(),zip:zipField.value.trim(),budget:budget};
    const missing=missingCategories(groups);
    const meals=week.flatMap(d=>Object.values(d)).filter(x=>x.recipeId).length;
    const costLine=calc?.complete ?
      '<strong>Priced cart estimate: '+money(calc.total)+'</strong>' +
      '<p class="fine">'+(calc.total<=budget?
        'This quoted ingredient cart fits the entered budget, before taxes, price changes or substitutions.':
        'This quoted ingredient cart exceeds the entered budget. Do not treat it as a budget-matched plan.')+'</p>':
      '<strong>Total price not available</strong><p class="fine">Local store prices have not been fully verified. The plan is not certified to fit your spending limit.</p>';
    result.innerHTML='<div class="nqn-budget-summary"><h3>Automatically generated meal calendar</h3>' +
      '<p class="fine">'+meals+' eligible meals placed across seven days. '+safe(statusMessage)+'</p>'+
      (missing.length?'<p class="fine">Still awaiting eligible recipes for: '+safe(missing.join(', '))+
       '. These meal slots are not included in budget calculations.</p>':'')+
      '<div class="nqn-generated-week">'+week.map((day,i)=>
        '<div class="nqn-generated-day"><strong>'+safe(dayNames[i])+'</strong>' +
        ['Breakfast','Lunch','Dinner','Snack'].map(slot=>{
          const item=day[slot],recipe=recipeBy(item?.recipeId);
          return '<span>'+safe(slot)+': '+(recipe?safe(recipe.title)+' · '+item.servings+' serving(s)':'Awaiting approved recipe')+'</span>';
        }).join('')+'</div>').join('')+'</div>'+
      '<div class="nqn-budget-total">'+costLine+'</div>'+
      displayGroceryList(all,calc)+
      '<p class="fine">Current cookbook recipes still require final full nutrition and fiber verification before a client launch. A preview plan does not override any coach-assigned targets.</p>'+
      '<button type="button" class="btn" id="nqn-budget-apply">Add meals and ingredients to my calendar and shopping list →</button></div>';
  }
  async function buildPlan(event){
    if(event)event.preventDefault();
    if(loading)return;
    const zip=zipField.value.trim(),budget=Number(budgetField.value),servings=Number(householdField.value);
    if(!isZip(zip)||!Number.isFinite(budget)||budget<1||budget>10000 ||
       !Number.isInteger(servings)||servings<1||servings>12){
      result.textContent='Enter a valid five-digit ZIP, grocery budget and household serving count.';
      return;
    }
    saveProfile();
    const groups=eligibleGroups();
    if(!Object.values(groups).some(x=>x.length)){
      result.textContent='No eligible recipes are available to build a plan yet.';
      return;
    }
    loading=true;
    showPriceStatus('Building your meal and grocery list…');
    try{
      const prices=await fetchPriceBook(groups,servings);
      const planResult=logic.optimizeWeek(groups,servings,recipeBy,pantry,prices.prices);
      showPriceStatus(prices.note);
      renderProposal(planResult.week,planResult.evaluation,groups,prices.note,budget);
    }catch(error){
      const week=logic.rotateWeek(groups,servings);
      const check=logic.purchaseCost(logic.aggregate(week,recipeBy,pantry),null);
      const message='The local pricing lookup failed. Meals and ingredients are generated, but dollar totals cannot be verified.';
      showPriceStatus(message);
      renderProposal(week,check,groups,message,budget);
    }finally{loading=false;}
  }

  function applyProposal(){
    if(!proposal)return;
    const count=proposal.week.flatMap(day=>Object.values(day)).filter(x=>x.recipeId).length;
    if(!count)return;
    // Only overwrite slots included in the proposal; do not erase other client choices.
    const replaced=proposal.week.some((day,i)=>['Breakfast','Lunch','Dinner','Snack'].some(slot=>{
      const candidate=day[slot],prior=mealEntry(i,slot);
      return candidate.recipeId && prior.recipeId && prior.recipeId!==candidate.recipeId;
    }));
    if(replaced&&!confirm('Replace the selected meal slots with these generated meals? Unavailable meal slots and the remaining entries will stay unchanged.'))return;
    proposal.week.forEach((day,i)=>{
      for(const slot of ['Breakfast','Lunch','Dinner','Snack']){
        if(day[slot]?.recipeId){
          setMeal(i,slot,{recipeId:day[slot].recipeId,servings:day[slot].servings});
        }
      }
    });
    if(!save())return;
    const missing=groceryItems().map(balanceItem).filter(it=>!it.fullyCovered);
    missing.forEach(it=>shoppingSelected.add(it.key));
    persistShopping();
    renderMissing();renderGroceries();renderPlanner();
    notify('Generated meals saved and needed ingredients added to Shopping List.');
    route('planner');
  }
  const setupZip=document.getElementById('nqn-onboard-zip');
  const setupStore=document.getElementById('nqn-onboard-store');
  if(setupForm&&setupZip&&setupStore){
    setupForm.addEventListener('submit',event=>{
      event.preventDefault();
      if(!isZip(setupZip.value)){
        setupZip.setCustomValidity('Enter a US ZIP code with five digits.');
        setupZip.reportValidity();return;
      }
      setupZip.setCustomValidity('');
      zipField.value=setupZip.value.trim();
      retailerField.value=setupStore.value;
      saveProfile();
      setupDialog.close();
      discoverStores();
      notify('Shopping location saved on this device. You can change it under Budget Planner.');
    });
    setupZip.addEventListener('input',()=>setupZip.setCustomValidity(''));
    document.getElementById('nqn-onboard-skip')?.addEventListener('click',()=>{
      safeSet(deferredKey,'1');setupDialog.close();
    });
    if(!isZip(safeGet(zipKey))&&safeGet(deferredKey)!=='1'&&typeof setupDialog.showModal==='function'){
      setupDialog.showModal();
    }
  }
  zipField.addEventListener('change',()=>{
    saveProfile();proposal=null;discoverStores();
  });
  retailerField.addEventListener('change',()=>{
    saveProfile();proposal=null;discoverStores();
  });
  budgetField.addEventListener('change',saveProfile);
  householdField.addEventListener('change',saveProfile);
  groceryForm.addEventListener('submit',buildPlan);
  result.addEventListener('click',event=>{
    if(event.target.closest('#nqn-budget-apply'))applyProposal();
  });
  document.getElementById('nqn-change-location')?.addEventListener('click',()=>{
    zipField.focus();route('budget');
  });

  restoreProfile();
  discoverStores();
  showPriceStatus(providerBase?
    'Connect to a participating store to request current ingredient prices.':
    'Live grocery pricing requires a supported retailer connection. This preview generates meals and ingredients without inventing prices.');
})();
