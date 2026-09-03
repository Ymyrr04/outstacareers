UPDATE public.contractor_assignments SET country = trim(country) WHERE country IS NOT NULL AND country <> trim(country);

UPDATE public.contractor_assignments SET country = 'Philippines'
WHERE country IN ('Philppines','Phillippines','Phillipines','philippines','PHILIPPINES','Davao','Cebu','Manila');

UPDATE public.contractor_assignments SET country = 'El Salvador'
WHERE country IN ('El salvador','el salvador','San Salvador','EL SALVADOR');

UPDATE public.contractor_assignments SET country = 'Mexico'
WHERE country IN ('México','Mexico ','mexico','MEXICO');

UPDATE public.contractor_assignments SET country = 'Nicaragua'
WHERE country IN ('Managua','nicaragua','NICARAGUA');