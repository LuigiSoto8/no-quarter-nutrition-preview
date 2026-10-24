"use strict";
/* All-recipe pantry directory. Source of truth: the existing 40-title cookbook
   plus authenticated user's own recipes; no copied/rewritten recipe manuscripts. */
(function () {
  const PAGE_SIZE = 22;
  const sourceKey = 'NQN.pantry.library.unitSelections.1';
  const searchField = document.getElementById('nqn-library-search');
  const categoryField = document.getElementById('nqn-library-category');
  const results = document.getElementById('nqn-library-results');
  const counter = document.getElementById('nqn-library-count');
  const pageBar = document.getElementById('nqn-library-pages');
  if (!searchField || !results || !categoryField || !pageBar || !counter) return;
  let page = 0;
  let unitChoices;
  try {
    unitChoices = JSON.parse(safeGet(sourceKey) || '{}');
    if (!unitChoices || typeof unitChoices !== 'object' || Array.isArray(unitChoices)) unitChoices={};
  } catch (_) { unitChoices={}; }

  function displayIngredient(name) {
    const text=String(name||'').trim();
    return /^:?\s*ratio\s+(?:protein\s+)?plain\b/i.test(text)?'Ratio yogurt':text;
  }
  function exactKey(name) {
    return displayIngredient(name).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  }
  function textSafe(value) { return htmlEscape(String(value)); }
  function sourceIngredients(recipe) {
    const rows = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    if (Array.isArray(recipe.ingredientItems) && recipe.ingredientItems.length) {
      return recipe.ingredientItems.map(it => ({
        name: it && it.name || '', unit: it && it.unit || '', category:'', sourceRecipe:recipe.title
      }));
    }
    return rows.map(it => {
      if (Array.isArray(it)) return {name:it[0],unit:it[2]||'',category:it[3]||'',sourceRecipe:recipe.title};
      if (it && typeof it === 'object') return {name:it.name||'',unit:it.unit||'',category:it.category||'',sourceRecipe:recipe.title};
      // Text-only ingredients are retained rather than silently discarded.
      return {name:String(it||''),unit:'',category:'',sourceRecipe:recipe.title};
    });
  }

  function buildDirectory() {
    const byName = new Map();
    const ready = new Map(recipes.filter(r => r && r.id).map(r => [r.id,r]));
    function addRows(rows,source,approval) {
      rows.forEach(item=>{
        const rawName=String(item.name||'').trim();
        if (!rawName) return;
        const name=displayIngredient(rawName);
        const key=exactKey(name);
        if (!byName.has(key)) byName.set(key,{
          key:key, name:name,units:new Set(),recipeNames:new Set(),statuses:new Set(),categories:new Set()
        });
        const entry=byName.get(key);
        if (item.unit) entry.units.add(String(item.unit).trim());
        if (item.category) entry.categories.add(String(item.category).trim());
        entry.recipeNames.add(source);
        entry.statuses.add(approval);
      });
    }
    NQN_COOKBOOK_CATALOG.forEach(c=>{
      const readyRecipe=ready.get(c.id);
      const rows=c.status==='ready' && readyRecipe ?
        sourceIngredients(readyRecipe) : sourceIngredients(c);
      addRows(rows,c.title,c.status==='ready'?'ready':'draft');
    });
    recipes.filter(r=> !NQN_COOKBOOK_CATALOG.some(c=>c.id===r.id))
      .forEach(r=>addRows(sourceIngredients(r),r.title,'personal'));
    return [...byName.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  function stockAmount(entry,unit) {
    const id=entry.key+'|'+unit;
    const records=Object.entries(pantry).filter(([key])=>{
      const separator=key.lastIndexOf('|');
      return separator>=0 && key.slice(separator+1)===unit &&
        exactKey(key.slice(0,separator))===entry.key;
    });
    // Old saved Ratio descriptions can refer to the same tub. Prefer the
    // canonical record, otherwise use the largest legacy entry without double counting.
    const canonical=Number(pantry[id]);
    if(Number.isFinite(canonical)&&canonical>0)return canonical;
    const amounts=records.map(([,value])=>Number(value)).filter(n=>Number.isFinite(n)&&n>0);
    return amounts.length?Math.max(...amounts):0;
  }
  function selectedUnit(entry) {
    const known=[...entry.units];
    const saved=unitChoices[entry.key];
    if (known.includes(saved))return saved;
    return known[0]||'each';
  }
  function classification(entry) {
    const explicit=[...entry.categories][0];
    if (explicit)return explicit;
    const name=entry.name.toLowerCase();
    if (/beef|chicken|turkey|sausage|steak|salmon|shrimp|tuna|fish|bacon|eggs?\b|egg whites|whey|protein powder/.test(name))return 'Protein';
    if (/cheese|milk|yogurt|cottage|cream|butter/.test(name))return 'Dairy';
    if (/strawberr|blueberr|banan|avocado|peppers?|onion|tomato|spinach|potato|lettuce|broccoli|zucchini|mushroom|cilantro|lime|lemon|carrot|celery|cucumber|jalape/.test(name))return 'Produce';
    if (/rice|oat|flour|bread|tortilla|pasta|noodle|quinoa|granola/.test(name))return 'Grains & Pasta';
    return 'Pantry & Seasonings';
  }
  function directory() { return buildDirectory(); }
  function inputRow(entry,index) {
    const unit=selectedUnit(entry);
    const amount=stockAmount(entry,unit);
    const draftOnly=!entry.statuses.has('ready') && !entry.statuses.has('personal');
    return '<div class="nqn-library-row">' +
      '<div class="nqn-library-item"><strong>'+textSafe(entry.name)+'</strong>' +
      '<span>'+entry.recipeNames.size+' recipe'+(entry.recipeNames.size===1?'':'s')+
      (draftOnly?' · includes unapproved recipe draft':'')+'</span></div>' +
      '<div class="nqn-library-stock">' +
      '<label><span>Unit</span><select data-nqn-library-unit="'+index+'" aria-label="Unit for '+textSafe(entry.name)+'">' +
        ([...entry.units].length?[...entry.units]:['each']).map(u=>
          '<option value="'+textSafe(u)+'"'+(u===unit?' selected':'')+'>'+textSafe(u)+'</option>').join('')+
      '</select></label>' +
      '<label><span>At home</span><input data-nqn-library-qty="'+index+'" type="number" min="0" step="any" inputmode="decimal" value="'+
         (amount||'')+'" placeholder="0" aria-label="Quantity of '+textSafe(entry.name)+' at home"></label>' +
      '</div></div>';
  }
  let currentRows=[];
  function renderLibrary() {
    const all=directory();
    const query=searchField.value.trim().toLowerCase();
    const category=categoryField.value;
    currentRows=all.filter(e=>
      (!category||classification(e)===category) &&
      (!query||e.name.toLowerCase().includes(query)||
        [...e.recipeNames].some(r=>r.toLowerCase().includes(query)))
    );
    const pageCount=Math.max(1,Math.ceil(currentRows.length/PAGE_SIZE));
    page=Math.min(page,pageCount-1);
    const sliced=currentRows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    results.innerHTML=sliced.length?sliced.map((x,i)=>inputRow(x,i+page*PAGE_SIZE)).join(''):
      '<p class="fine">No matching recipe ingredients. Try a different search or category.</p>';
    counter.textContent=all.length+' distinct recipe ingredients across '+NQN_COOKBOOK_CATALOG.length+
      ' cookbook titles'+(query||category?' · '+currentRows.length+' matching':'');
    pageBar.innerHTML='<button class="btn mini secondary" type="button" data-nqn-library-page="previous" '+
       (page===0?'disabled':'')+'>← Previous</button><span>Page '+(page+1)+' of '+pageCount+'</span>'+
       '<button class="btn mini secondary" type="button" data-nqn-library-page="next" '+
       (page>=pageCount-1?'disabled':'')+'>Next →</button>';
  }
  function updatePantryFromRow(input) {
    const i=Number(input.dataset.nqnLibraryQty);
    const entry=currentRows[i];
    if (!entry) return;
    const n=input.value.trim()===''?0:Number(input.value);
    if (!Number.isFinite(n)||n<0||n>100000){
      input.setCustomValidity('Enter a nonnegative amount below 100,000');
      input.reportValidity();return;
    }
    input.setCustomValidity('');
    const unit=selectedUnit(entry),id=entry.key+'|'+unit;
    if(n>0)pantry[id]=n;else delete pantry[id];
    safeSet(pantryKey,JSON.stringify(pantry));
    const status=document.getElementById('nqn-library-saved');
    if(status)status.textContent='Pantry amount saved for '+entry.name+' ('+unit+').';
    renderMissing();
    // The existing shopping list remains fully compatible with measured quantities.
    if(currentRoute==='groceries')renderGroceries();
  }

  categoryField.innerHTML='<option value="">All categories</option>'+
    [...new Set(directory().map(classification))].sort().map(x=>
      '<option value="'+textSafe(x)+'">'+textSafe(x)+'</option>').join('');
  searchField.addEventListener('input',()=>{page=0;renderLibrary()});
  categoryField.addEventListener('change',()=>{page=0;renderLibrary()});
  pageBar.addEventListener('click',event=>{
    const direction=event.target.closest('[data-nqn-library-page]')?.dataset.nqnLibraryPage;
    if(direction==='previous')page=Math.max(0,page-1);
    if(direction==='next')page+=1;
    if(direction){renderLibrary();results.scrollIntoView({block:'nearest',behavior:'smooth'});}
  });
  results.addEventListener('change',event=>{
    const unitSelect=event.target.closest('[data-nqn-library-unit]');
    if (unitSelect){
      const entry=currentRows[Number(unitSelect.dataset.nqnLibraryUnit)];
      if(!entry)return;
      unitChoices[entry.key]=unitSelect.value;
      safeSet(sourceKey,JSON.stringify(unitChoices));renderLibrary();return;
    }
    const input=event.target.closest('[data-nqn-library-qty]');
    if(input)updatePantryFromRow(input);
  });
  renderLibrary();
  // Pure functions exposed to the next feature module and test harness, not access control.
  window.NQNIngredientDirectory={
    list:()=>directory().map(e=>({name:e.name,key:e.key,units:[...e.units],category:classification(e),
      recipes:[...e.recipeNames],status:[...e.statuses]})),
    getQuantity:(name,unit)=>stockAmount({key:exactKey(name)},unit),
    refresh:renderLibrary
  };
})();
