
ALTER TABLE public.contract_template_fields DROP CONSTRAINT IF EXISTS contract_template_fields_field_type_check;
ALTER TABLE public.contract_template_fields ADD CONSTRAINT contract_template_fields_field_type_check
  CHECK (field_type IN ('text','date','signature','initials','attachment','checkbox','email'));
