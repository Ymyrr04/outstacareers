-- Job rates are now stored as USD hourly; the PHP monthly range is
-- derived only at display time. Convert legacy PHP-stored rates back to
-- their USD hourly source using the fixed display constants
-- (min ÷ 56 × 40 × 4 = 8960, max ÷ 56 × 50 × 4 = 11200).
with p as (
  select
    id,
    round(regexp_replace((regexp_matches(rate, '₱([0-9,]+)', 'g'))[1], ',', '', 'g')::numeric / 8960, 2) as min_hr,
    round(regexp_replace((regexp_matches(rate, '₱([0-9,]+)', 'g'))[2], ',', '', 'g')::numeric / 11200, 2) as max_hr
  from public.jobs
  where rate like '₱%'
)
update public.jobs j
set rate = case
  when p.max_hr <= p.min_hr
    then '$' || regexp_replace(p.min_hr::text, '\.?0+$', '') || '/hr'
  else '$' || regexp_replace(p.min_hr::text, '\.?0+$', '') || ' - $' || regexp_replace(p.max_hr::text, '\.?0+$', '') || '/hr'
end
from p
where j.id = p.id;