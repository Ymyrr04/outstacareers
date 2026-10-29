-- Titles carry trailing spaces; match on trimmed title.
update public.jobs j
set rate = v.usd_rate
from (values
  ('Marketing Specialist', '$5.50/hr'),
  ('Packaging & Graphic Designer', '$5.50/hr')
) as v(title, usd_rate)
where btrim(j.title) = v.title
  and j.region = 'philippines'
  and j.is_active is true
  and (j.rate is null or j.rate = '');