DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'test-portal@outsta.io';
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'test-portal@outsta.io', crypt('TestPortal2026!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', 'test-portal@outsta.io'), 'email', uid::text, now(), now(), now());
  END IF;

  INSERT INTO public.contractor_portal_users (user_id, contractor_assignment_id, email, must_change_password)
  VALUES (uid, '2665ed83-b6ab-447c-9560-f3c38651b46c', 'test-portal@outsta.io', false)
  ON CONFLICT DO NOTHING;
END $$;