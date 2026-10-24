"use strict";
/* Pure grocery-plan calculations; does not fetch prices or assign nutrition targets. */
(function (root) {
  const factors={
    g:['mass',1],kg:['mass',1000],oz:['mass',28.349523125],lb:['mass',453.59237],
    ml:['volume',1],l:['volume',1000],'fl oz':['volume',29.5735295625],
    tsp:['volume',4.92892159375],tbsp:['volume',14.78676478125],cup:['volume',236.5882365],
    each:['each',1],slice:['slice',1],slices:['slice',1],scoop:['scoop',1],package:['package',1]
  };
  const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const displayIngredient=v=>{
    const text=String(v||'').trim();
    return /^:?\s*ratio\s+(?:protein\s+)?plain\b/i.test(text)?'Ratio yogurt':text;
  };
  const ingredientKey=v=>normalize(displayIngredient(v));
  function unitInfo(unit) {
    return factors[normalize(unit)]||[normalize(unit)||'unknown',1];
  }
  function aggregate(week,recipeById,pantry) {
    const map=new Map(),stock=pantry||{};
    (week||[]).forEach((day)=>{
      for(const slot of ['Breakfast','Lunch','Dinner','Snack']){
        const choice=day&&day[slot];
        if(!choice||!choice.recipeId)continue;
        const recipe=recipeById(choice.recipeId);
        if(!recipe||!Array.isArray(recipe.ingredients)||!recipe.serves||!Number.isInteger(choice.servings))continue;
        const multiple=choice.servings/recipe.serves;
        recipe.ingredients.forEach((item)=>{
          if (!Array.isArray(item)||!item[0])return;
          const name=displayIngredient(item[0]),unit=String(item[2]||'each');
          const nameKey=ingredientKey(item[0]),info=unitInfo(unit),key=nameKey+'|'+info[0];
          if(!map.has(key))map.set(key,{key,name,nameKey,dimension:info[0],unit:unit,
            amount:0,unknown:false,sources:new Set(),category:String(item[3]||'Other')});
          const entry=map.get(key),quantity=Number(item[1]);
          if(item[1]===null||!Number.isFinite(quantity)||quantity<0)entry.unknown=true;
          else entry.amount+=quantity*multiple*info[1];
          entry.sources.add(recipe.title||recipe.id);
        });
      }
    });
    const all=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    return all.map(item=>{
      // Existing pantry records use exact ingredient name + unit; known units in the same dimension are convertible.
      let available=0;
      const matches=[];
      for(const [storageKey,value] of Object.entries(stock)){
        const separator=storageKey.lastIndexOf('|');
        if(separator<0||ingredientKey(storageKey.slice(0,separator))!==item.nameKey)continue;
        const info=unitInfo(storageKey.slice(separator+1));
        if(info[0]===item.dimension && Number.isFinite(Number(value))&&Number(value)>0)
          matches.push({key:storageKey,amount:Number(value)*info[1]});
      }
      // Legacy alternate names for the SAME Ratio Plain tub must not be
      // counted as separate stock unless actual separate packages are recorded.
      if(item.nameKey==='ratio yogurt'){
        const canonical=matches.find(x=>x.key==='ratio yogurt|'+item.unit);
        available=canonical?canonical.amount:Math.max(0,...matches.map(x=>x.amount));
      }else available=matches.reduce((sum,x)=>sum+x.amount,0);
      const missing=Math.max(0,item.amount-available);
      const converted=unitInfo(item.unit)[1];
      return {key:item.key,name:item.name,unit:item.unit,dimension:item.dimension,
        amount:item.amount/converted,have:available/converted,missing:missing/converted,
        needBase:missing,unknown:item.unknown,sourceCount:item.sources.size,category:item.category};
    });
  }
  function groupBySlot(recipes,catalog,eligible) {
    const categories=new Map((catalog||[]).map(c=>[c.id,c.category]));
    const result={Breakfast:[],Lunch:[],Dinner:[],Snack:[]};
    (recipes||[]).filter(eligible).forEach(r=>{
      const value=String(r.category||r.mealType||categories.get(r.id)||'').toLowerCase();
      const slot=value.includes('breakfast')?'Breakfast':value.includes('lunch')?'Lunch':
        value.includes('dinner')?'Dinner':value.includes('snack')?'Snack':null;
      if(slot)result[slot].push(r);
    });
    return result;
  }
  function blankWeek() {
    return Array.from({length:7},()=>({Breakfast:{recipeId:'',servings:1},
      Lunch:{recipeId:'',servings:1},Dinner:{recipeId:'',servings:1},Snack:{recipeId:'',servings:1}}));
  }
  function rotateWeek(groups,servings) {
    const week=blankWeek();
    for(let i=0;i<7;i++)for(const slot of Object.keys(groups)){
      const options=groups[slot];
      if(options.length){
        const r=options[i%options.length];
        week[i][slot]={recipeId:r.id,servings};
      }
    }
    return week;
  }
  function purchaseCost(items,priceBook) {
    if(!priceBook||typeof priceBook!=='object')return {complete:false,total:null,lines:[],reasons:['No verified grocery price book available']};
    let total=0,complete=true;
    const lines=[],reasons=[];
    // Source-specific exact product/unit mapping is supplied by a server, not guessed in the browser.
    for(const it of items){
      if(it.missing<=1e-7&&!it.unknown){lines.push({...it,packages:0,cost:0});continue}
      const quote=priceBook[it.key];
      const dimension=unitInfo(quote?.packageUnit||'')[0];
      const factor=unitInfo(quote?.packageUnit||'')[1];
      const price=Number(quote?.packagePrice),size=Number(quote?.packageQuantity);
      const valid=!!quote&&quote.status==='verified'&&!!quote.sku&&
        Number.isFinite(price)&&price>0&&Number.isFinite(size)&&size>0&&
        dimension===it.dimension&&!!quote.quotedAt;
      if(!valid||it.unknown){
        complete=false;reasons.push('Missing checked product or compatible package for '+it.name);
        lines.push({...it,packages:null,cost:null});
        continue;
      }
      const count=Math.ceil(Math.max(0,it.needBase-1e-8)/(size*factor));
      const cost=count*price;
      total+=cost;
      lines.push({...it,packages:count,cost:cost,product:String(quote.title||''),sku:String(quote.sku),
        packageUnit:quote.packageUnit,packageQuantity:size,packagePrice:price,quotedAt:quote.quotedAt});
    }
    // Do not call incomplete item coverage a full total or guaranteed budget fit.
    return {complete,total:complete?Math.round(total*100)/100:null,
      knownSubtotal:Math.round(total*100)/100,lines,reasons};
  }
  function optimizeWeek(groups,servings,recipeById,pantry,priceBook) {
    const first=rotateWeek(groups,servings);
    if(!priceBook)return {week:first,evaluation:purchaseCost(aggregate(first,recipeById,pantry),null),optimized:false};
    const week=blankWeek(),used={};
    // Greedy incremental package-cost choice. Never treat an unpriced recipe as cheaper.
    for(let day=0;day<7;day++)for(const slot of ['Breakfast','Lunch','Dinner','Snack']){
      const options=groups[slot]||[];
      if(!options.length)continue;
      const candidates=options.map(recipe=>{
        const candidate=week.map(d=>Object.fromEntries(Object.entries(d).map(([k,v])=>[k,{...v}])));
        candidate[day][slot]={recipeId:recipe.id,servings};
        const evaluation=purchaseCost(aggregate(candidate,recipeById,pantry),priceBook);
        return {recipe,eval:evaluation};
      }).filter(c=>c.eval.complete);
      if(!candidates.length) {
        // Fall back to a transparent unpriced selection, not a fictional bargain.
        week[day][slot]={recipeId:options[day%options.length].id,servings};
        continue;
      }
      candidates.sort((a,b)=>(a.eval.total+((used[a.recipe.id]||0)*.015))-
        (b.eval.total+((used[b.recipe.id]||0)*.015)) || a.recipe.title.localeCompare(b.recipe.title));
      const winner=candidates[0].recipe;
      used[winner.id]=(used[winner.id]||0)+1;
      week[day][slot]={recipeId:winner.id,servings};
    }
    return {week,evaluation:purchaseCost(aggregate(week,recipeById,pantry),priceBook),optimized:true};
  }
  root.NQNGroceryLogic={unitInfo,normalize,aggregate,groupBySlot,blankWeek,rotateWeek,purchaseCost,optimizeWeek};
})(typeof window!=='undefined'?window:globalThis);
