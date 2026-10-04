-- lead-funnel-09-precio-signal.sql  (#37 + #40, 2026-10-04) — ADDITIVE ONLY
--
-- (1) leads.precio_visto_at — first time the lead saw a price (bot CANNED.precio /
--     CANNED.pareja, or Nicolás's manual reply containing "$<digits>"). The CAPI
--     LeadSubmitted event now fires on "≥2 inbound messages after the price" (or a
--     therapist picked) instead of "category picked" — see netlify/lib/capi.mjs.
-- (2) "Para mí" list drops the hijo / terapia_pareja rows (they have their own
--     buttons now). Rows stay; resolveCards doesn't filter on activo.
-- (3) Age-split routing for "Mi hijo/a": three hidden (activo=false) categories.

alter table public.leads add column if not exists precio_visto_at timestamptz;
-- who the therapy is for (first-question tap): 'yo' | 'pareja' | 'hijo'
alter table public.leads add column if not exists quien text;

update public.funnel_categorias set activo = false, updated_at = now()
 where clave in ('hijo', 'terapia_pareja');

insert into public.funnel_categorias (clave, etiqueta, orden, activo, terapeutas)
select v.clave, v.etiqueta, v.orden, false,
       array(select t.id from unnest(v.nombres) with ordinality as n(nombre, i)
             join public.therapists t on t.nombre = n.nombre order by n.i)
  from (values
    ('hijo_nino',        'Hijo/a menor de 12', 101, array['Francisco','Maria Gracia']),
    ('hijo_adolescente', 'Hijo/a de 12 a 17',  102, array['Francisco','Maria Gracia','Camila','Carolina']),
    ('hijo_adulto',      'Hijo/a de 18 o más', 103, array['Francisco','Sophia','Camila','Maria Gracia','Carolina'])
  ) as v(clave, etiqueta, orden, nombres)
 where not exists (select 1 from public.funnel_categorias c where c.clave = v.clave);
