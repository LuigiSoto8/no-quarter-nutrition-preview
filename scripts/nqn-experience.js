"use strict";
/* NQN client experience: this file contains no coach credential or macro-assignment controls.
   Membership entitlements MUST be enforced by a future authenticated service, never browser storage. */
(function () {
  const originalRenderPlanner = renderPlanner;
  let selectedDay = (new Date().getDay() + 6) % 7;
  let budgetPreview = null;
  const budgetStoreKey = "NQN.preview.grocery.store.1";
  const budgetPriceKey = "NQN.preview.grocery.costEstimates.1";
  const budgetLimitKey = "NQN.preview.grocery.weeklyBreakfastLimit.1";
  const dollar = n => "$" + Number(n).toFixed(2);
  const textSafe = value => htmlEscape(String(value));

  function weekSummary() {
    return allPlannedMeals().reduce((a, item) => {
      const recipe = recipeById(item.recipeId);
      if (!recipe) return a;
      a.meals += 1;
      a.servings += item.servings;
      const macro = hasRecipeNutrition(recipe) ? recipeMacros(recipe) : null;
      if (macro) {
        a.calories += macro[0] * item.servings;
        a.protein += macro[1] * item.servings;
        a.known += 1;
      } else {
        a.unavailable += 1;
      }
      return a;
    }, {meals:0,servings:0,calories:0,protein:0,known:0,unavailable:0});
  }

  function buildCalendarDay(dayIndex) {
    const scheduled = mealSlots.map(slot => {
      const item = mealEntry(dayIndex,slot);
      const recipe = recipeById(item.recipeId);
      return {slot,item,recipe};
    });
    const count = scheduled.filter(x => x.recipe).length;
    return '<button type="button" class="nqn-cal-day" data-calendar-day="' + dayIndex +
      '" aria-pressed="' + (selectedDay === dayIndex ? 'true' : 'false') + '">' +
      '<strong>' + textSafe(dayNames[dayIndex]) + '</strong>' +
      '<small>' + count + ' of 4 meals chosen</small>' +
      '<span class="nqn-cal-total">' +
      (count ? scheduled.filter(x => x.recipe).map(x => textSafe(x.slot)).join(' · ') : 'Choose meals') +
      '</span></button>';
  }

  function buildCalendarSlot(slot) {
    const entry = mealEntry(selectedDay,slot);
    const recipe = recipeById(entry.recipeId);
    const macro = hasRecipeNutrition(recipe) ? recipeMacros(recipe) : null;
    const options = recipes.filter(r => hasRecipeNutrition(r) || r.id === entry.recipeId).map(r =>
      '<option value="' + textSafe(r.id) + '"' +
        (entry.recipeId === r.id ? ' selected' : '') + '>' +
        textSafe(r.title) + (hasRecipeNutrition(r) ? '' : ' · Nutrition incomplete') + '</option>'
    ).join('');
    const id = 'servings-' + (slot === 'Breakfast' ? '' : slot + '-') + selectedDay;
    const description = macro ?
       calculatedMacro(macro[0] * entry.servings) + ' kcal · ' +
       calculatedMacro(macro[1] * entry.servings) + ' g protein, prepared servings' :
       recipe ? 'Nutrition incomplete; cannot be used in automatic planning' : 'Select a meal to see its nutrition';
    return '<div class="nqn-cal-edit-row">' +
      '<div class="nqn-meal-name">' + textSafe(slot) + '</div>' +
      '<select data-day="' + selectedDay + '" data-slot="' + textSafe(slot) +
      '" aria-label="' + textSafe(slot) + ' recipe for ' + textSafe(dayNames[selectedDay]) + '">' +
      '<option value="">No meal planned</option>' + options + '</select>' +
      '<div class="nqn-meal-serving"><label for="' + id + '">Servings</label>' +
      '<input id="' + id + '" type="number" inputmode="numeric" min="1" max="12" step="1" ' +
      'data-servings="' + selectedDay + '" data-slot="' + textSafe(slot) + '" value="' +
      entry.servings + '"' + (recipe ? '' : ' disabled') + '></div>' +
      '<div class="nqn-meal-macros">' + textSafe(description) + '</div>' +
      '</div>';
  }

  renderPlanner = function () {
    const area = document.getElementById('days-list');
    if (!area) return originalRenderPlanner();
    area.innerHTML = '<div class="nqn-calendar-grid" role="group" aria-label="Select a day of the week">' +
       dayNames.map((day,i) => buildCalendarDay(i)).join('') + '</div>' +
       '<section class="nqn-cal-editor" aria-label="Edit meals for selected day"><h3>' +
       textSafe(dayNames[selectedDay]) + ' · Your meals</h3>' +
       mealSlots.map(buildCalendarSlot).join('') + '</section>';
    const totals = weekSummary();
    const suffix = totals.unavailable ? ' (known meals only)' : '';
    document.getElementById('weekly-cal').textContent =
      (totals.known ? calculatedMacro(totals.calories) : totals.unavailable ? 'Unavailable' : '0.0') + suffix;
    document.getElementById('weekly-protein').textContent =
      (totals.known ? calculatedMacro(totals.protein) + 'g' : totals.unavailable ? 'Unavailable' : '0.0g') + suffix;
    document.getElementById('weekly-meals').textContent = totals.servings;
    document.getElementById('stat-days').textContent = totals.meals + ' / 28';
    document.getElementById('stat-items').textContent = groceryItems().length;
  };

  function storedPrices() {
    try {
      const result = JSON.parse(safeGet(budgetPriceKey) || '{}');
      return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
    } catch (_) { return {}; }
  }
  function chosenStore() {
    return document.getElementById('nqn-budget-store').value;
  }
  function pricedRecipes() {
    return recipes.filter(hasRecipeNutrition);
  }
  function renderBudget() {
    const store = chosenStore();
    const values = storedPrices()[store] || {};
    document.getElementById('nqn-budget-prices').innerHTML =
      pricedRecipes().map(recipe => {
        const value = Object.prototype.hasOwnProperty.call(values,recipe.id) ? values[recipe.id] : '';
        return '<label class="nqn-budget-price"><span>' + textSafe(recipe.title) +
          '</span><input aria-label="Estimated price per serving for ' + textSafe(recipe.title) +
          '" data-nqn-budget-price="' + textSafe(recipe.id) +
          '" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" placeholder="$ per serving" value="' +
          textSafe(value) + '"></label>';
      }).join('') || '<p class="fine">No eligible recipes are currently available to price.</p>';
    budgetPreview = null;
    document.getElementById('nqn-budget-result').textContent = '';
  }
  function savePrices() {
    const values = storedPrices();
    const store = chosenStore();
    const next = {};
    document.querySelectorAll('[data-nqn-budget-price]').forEach(input => {
      if (input.value.trim() && Number.isFinite(Number(input.value)) &&
        Number(input.value) > 0) {
        next[input.dataset.nqnBudgetPrice] = Number(input.value);
      }
    });
    values[store] = next;
    safeSet(budgetPriceKey,JSON.stringify(values));
  }

  function createBudgetPreview(event) {
    event.preventDefault();
    savePrices();
    const dollars = Number(document.getElementById('nqn-budget-limit').value);
    const servings = Number(document.getElementById('nqn-budget-servings').value);
    const output = document.getElementById('nqn-budget-result');
    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 10000 ||
        !Number.isInteger(servings) || servings < 1 || servings > 12) {
      output.textContent = 'Enter a valid budget and between 1 and 12 whole servings.';
      return;
    }
    const priceMap = storedPrices()[chosenStore()] || {};
    const items = pricedRecipes().map(recipe => ({
      recipe:recipe,
      mealCost:Number(priceMap[recipe.id]) * servings
    })).filter(x => Number.isFinite(x.mealCost) && x.mealCost > 0 && x.mealCost <= 10000)
      .sort((a,b) => a.mealCost - b.mealCost || a.recipe.title.localeCompare(b.recipe.title));
    if (!items.length) {
      output.textContent = 'Enter at least one realistic per-serving estimate for this store to build a plan.';
      return;
    }
    const cheapestWeek = items[0].mealCost * 7;
    if (cheapestWeek > dollars + 0.00001) {
      budgetPreview = null;
      output.textContent = 'Seven breakfasts cannot fit that amount using the prices supplied. Cheapest estimated week: ' +
        dollar(cheapestWeek) + '. Try reducing servings, changing recipes or adjusting your budget.';
      return;
    }
    // Start from a feasible week and add variety only when the extra estimated cost fits.
    const chosen = Array.from({length:7},()=>items[0]);
    let total = cheapestWeek;
    if (items.length > 1) {
      for (let i=0; i<7; i++) {
        const alternative = items[(i % (items.length - 1)) + 1];
        const extra = alternative.mealCost - items[0].mealCost;
        if (total + extra <= dollars + 0.00001) {
          chosen[i] = alternative;
          total += extra;
        }
      }
    }
    budgetPreview = {
      choices:chosen.map(x => ({recipeId:x.recipe.id,servings:servings})),
      total:total, limit:dollars, store:chosenStore()
    };
    output.innerHTML = '<h3>Your breakfast budget preview</h3>' +
      '<p class="fine">Selected grocery: ' + textSafe(budgetPreview.store) +
      ' · Estimated seven-breakfast cost: ' + dollar(total) +
      ' · Breakfast budget: ' + dollar(dollars) + '</p>' +
      '<ul>' + chosen.map((item,index) => '<li>' + textSafe(dayNames[index]) + ' · ' +
        textSafe(item.recipe.title) + ' · ' + dollar(item.mealCost) + '</li>').join('') + '</ul>' +
      '<p class="fine">Prices are manually entered estimates, not live retailer quotes. Lunch, dinner, snacks and other groceries remain outside this cost.</p>' +
      '<button class="btn" type="button" id="nqn-budget-apply">Use these breakfasts in my calendar →</button>';
    safeSet(budgetLimitKey,String(dollars));
  }

  function applyBudgetPreview() {
    if (!budgetPreview || budgetPreview.choices.length !== 7) return;
    if (plan.some(x => x.recipeId) &&
      !confirm('Replace seven current breakfasts with this budget preview? Lunch, dinner and snacks will stay unchanged.')) return;
    plan = budgetPreview.choices.map(x=>({recipeId:x.recipeId,servings:x.servings}));
    save();
    renderPlanner();
    renderMissing();
    notify('Breakfast preview added. The rest of your week was preserved.');
    route('planner');
  }

  const storeField = document.getElementById('nqn-budget-store');
  if (storeField) {
    const priorStore = safeGet(budgetStoreKey);
    if ([...storeField.options].some(x=>x.value === priorStore)) storeField.value=priorStore;
    const savedLimit = safeGet(budgetLimitKey);
    if (savedLimit && Number(savedLimit) > 0) document.getElementById('nqn-budget-limit').value=savedLimit;
    storeField.addEventListener('change',()=>{
      safeSet(budgetStoreKey,chosenStore());
      renderBudget();
    });
    document.getElementById('nqn-budget-prices').addEventListener('change',event=>{
      if (event.target.matches('[data-nqn-budget-price]')) {
        savePrices();
        budgetPreview = null;
        document.getElementById('nqn-budget-result').textContent =
          'Price updated. Build a new preview to apply this estimate.';
      }
    });
    document.getElementById('nqn-budget-form').addEventListener('submit',createBudgetPreview);
  }
  document.addEventListener('click',event => {
    const dayButton = event.target.closest('[data-calendar-day]');
    if (dayButton) {
      const day = Number(dayButton.dataset.calendarDay);
      if (!Number.isInteger(day) || day<0 || day>6) return;
      selectedDay = day;
      renderPlanner();
      document.querySelector('[data-calendar-day="' + day + '"]')?.focus();
      return;
    }
    if (event.target.id === 'nqn-budget-apply') applyBudgetPreview();
  });

  renderPlanner();
  if (storeField) renderBudget();
})();
