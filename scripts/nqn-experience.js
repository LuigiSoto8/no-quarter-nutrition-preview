"use strict";
/* NQN client experience: this file contains no coach credential or macro-assignment controls.
   Membership entitlements MUST be enforced by a future authenticated service, never browser storage. */
(function () {
  const originalRenderPlanner = renderPlanner;
  let selectedDay = (new Date().getDay() + 6) % 7;
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
    const options = recipes.filter(r => isRecipeSelectable(r) || r.id === entry.recipeId).map(r =>
      '<option value="' + textSafe(r.id) + '"' +
        (entry.recipeId === r.id ? ' selected' : '') + '>' +
        textSafe(r.title) + (r.cookbookWorking ? ' · Working recipe' : hasRecipeNutrition(r) ? '' : ' · Nutrition incomplete') + '</option>'
    ).join('');
    const id = 'servings-' + (slot === 'Breakfast' ? '' : slot + '-') + selectedDay;
    const description = macro ?
       calculatedMacro(macro[0] * entry.servings) + ' kcal · ' +
       calculatedMacro(macro[1] * entry.servings) + ' g protein, prepared servings' :
       recipe && recipe.cookbookWorking ? 'Ingredients included in shopping list · macro and fiber panel in review' : recipe ? 'Nutrition incomplete' : 'Select a meal to see its nutrition';
    return '<div class="nqn-cal-edit-row">' +
      '<div class="nqn-meal-name">' + textSafe(slot) + '</div>' +
      '<select data-day="' + selectedDay + '" data-slot="' + textSafe(slot) +
      '" aria-label="' + textSafe(slot) + ' recipe for ' + textSafe(dayNames[selectedDay]) + '">' +
      '<option value="">No meal planned</option>' + options + '</select>' +
      '<div class="nqn-meal-serving"><label for="' + id + '">Servings</label>' +
      '<input id="' + id + '" type="number" inputmode="numeric" min="1" max="12" step="1" ' +
      'data-servings="' + selectedDay + '" data-slot="' + textSafe(slot) + '" value="' +
      entry.servings + '"' + (recipe ? '' : ' disabled') + '></div>' +
      '<div class="nqn-meal-macros">' + textSafe(description) + (recipe && recipe.cookbookWorking ? ' <button type="button" class="nqn-calendar-view-recipe" data-nqn-view-recipe="' + textSafe(recipe.id) + '">View recipe</button>' : '') + '</div>' +
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

  document.addEventListener('click',event => {
    const viewRecipe = event.target.closest('[data-nqn-view-recipe]');
    if (viewRecipe) {showRecipe(viewRecipe.dataset.nqnViewRecipe);return;}
    const dayButton = event.target.closest('[data-calendar-day]');
    if (!dayButton) return;
    const day=Number(dayButton.dataset.calendarDay);
    if (!Number.isInteger(day)||day<0||day>6)return;
    selectedDay=day;
    renderPlanner();
    document.querySelector('[data-calendar-day="' + day + '"]')?.focus();
  });
  renderPlanner();
})();
