ALTER TABLE public.historical_pl_rows
  ADD COLUMN expense_after_1_percent numeric,
  ADD COLUMN income_after_3_percent numeric,
  ADD COLUMN gross_after_deductions numeric,
  ADD COLUMN client_deposit numeric,
  ADD COLUMN contractor_deposit numeric;