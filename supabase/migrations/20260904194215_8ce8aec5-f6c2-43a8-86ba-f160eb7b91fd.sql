ALTER TABLE public.auto_reply_rules
  ADD COLUMN IF NOT EXISTS delay_minutes integer NOT NULL DEFAULT 5;
ALTER TABLE public.auto_reply_rules
  ADD CONSTRAINT auto_reply_rules_delay_minutes_check CHECK (delay_minutes >= 1 AND delay_minutes <= 1440);