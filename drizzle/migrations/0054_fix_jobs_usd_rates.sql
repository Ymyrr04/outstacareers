-- Restore USD hourly rates for the active jobs whose legacy PHP rates were
-- blanked by migration 0053 (its regexp_matches subscript returned NULL for the
-- second peso figure). Values reverse-computed from the captured ₱/month data:
-- ₱44,800-₱56,000 → $5/hr, ₱43,904-₱54,880 → $4.90/hr, ₱49,280-₱61,600 → $5.50/hr,
-- ₱53,760-₱67,200 → $6/hr, ₱60,928-₱76,160 → $6.80/hr, ₱89,600-₱112,000 → $10/hr.
update public.jobs j
set rate = v.usd_rate
from (values
  ('Accounting Specialist', '$5/hr'),
  ('Business Assistant', '$5/hr'),
  ('Customer Service and Admin Assistant', '$4.90/hr'),
  ('E-commerce Virtual Assistant', '$5/hr'),
  ('Executive Assistant', '$5/hr'),
  ('Marketing Specialist', '$5.50/hr'),
  ('Packaging & Graphic Designer', '$5.50/hr'),
  ('Paralegal', '$6/hr'),
  ('Production Assistant (Apparel Production & PLM Systems)', '$5.58 - $5.80/hr'),
  ('Senior Automation Specialist (n8n expert)', '$6.80/hr'),
  ('Senior Software Developer', '$10/hr'),
  ('Social Media Graphic Designer', '$5/hr'),
  ('Video Editor', '$5/hr')
) as v(title, usd_rate)
where j.title = v.title
  and j.region = 'philippines'
  and j.is_active is true
  and j.rate is null;