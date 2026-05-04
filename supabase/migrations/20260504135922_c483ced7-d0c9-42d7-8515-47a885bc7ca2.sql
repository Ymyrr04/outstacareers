-- Fresh start: remove existing contractor portal users and their auth accounts
DELETE FROM auth.users WHERE id IN (SELECT user_id FROM public.contractor_portal_users);
DELETE FROM public.contractor_portal_users;