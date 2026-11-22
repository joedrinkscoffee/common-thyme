-- How much Chef cares about sharing an ingredient across dinners.
--   use_up    plan around it within the week (fresh vegetables, cream, pesto, chicken breast)
--   stock_up  pricey but keeps for months; finish it over a few weeks (walnuts, golden raisins)
--   pantry    nice to share, only breaks ties (capers, olives)
--   ignore    cheap or always on hand (lemons, garlic, spices)
-- Null means "use the app's starting guess from the ingredient's name".
-- Chef sets it when the household says to treat an ingredient differently.
alter table public.ingredients
  add column if not exists share_tier text
  check (share_tier in ('use_up', 'stock_up', 'pantry', 'ignore'));
