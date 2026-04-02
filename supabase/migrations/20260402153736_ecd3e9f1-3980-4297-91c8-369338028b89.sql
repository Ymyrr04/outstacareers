CREATE TABLE public.email_fetch_state (
  id integer PRIMARY KEY DEFAULT 1,
  current_offset integer NOT NULL DEFAULT 0,
  last_run_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.email_fetch_state (id, current_offset) VALUES (1, 0);

ALTER TABLE public.email_fetch_state ENABLE ROW LEVEL SECURITY;
