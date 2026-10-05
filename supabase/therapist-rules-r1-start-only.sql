-- #46 (2026-10-05): Mariana's R1 checks the START only.
-- She finishes work at 21:00, so her LAST session STARTS at 20:00 (any duration —
-- a 75-min /reservar session at 20:00 ending 21:15 is fine). R1 is now
-- hora_inicio between 10:00 and 20:00 inclusive; hora_fin is not checked.
-- R2 (starts ≥2h apart), R3 (max 3/day), R4 (en línea only) unchanged.
-- Supersedes the function body in therapist-rules-trigger.sql (#43); the trigger
-- itself is unchanged. JS mirror: src/lib/therapistRules.js (startWindow).

create or replace function public.enforce_therapist_rules()
returns trigger
language plpgsql
as $$
declare
  mariana constant uuid := 'b219e764-4664-594c-9eb3-d2b19e52caac';
  same_day int;
  too_close int;
begin
  if NEW.terapeuta_id is distinct from mariana
     or NEW.estado in ('cancelada', 'no_show')
     or NEW.fecha is null
     or NEW.hora_inicio is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
     and NEW.fecha is not distinct from OLD.fecha
     and NEW.hora_inicio is not distinct from OLD.hora_inicio
     and NEW.hora_fin is not distinct from OLD.hora_fin
     and NEW.modalidad is not distinct from OLD.modalidad
     and NEW.terapeuta_id is not distinct from OLD.terapeuta_id then
    return NEW;
  end if;

  -- R4
  if NEW.modalidad = 'presencial' then
    raise exception 'MARIANA_RULE: Mariana atiende solo en línea por ahora';
  end if;

  -- R1 (#46): start between 10:00 and 20:00 inclusive; end not checked.
  if NEW.hora_inicio < time '10:00' then
    raise exception 'MARIANA_RULE: La primera sesión de Mariana empieza a las 10:00';
  end if;
  if NEW.hora_inicio > time '20:00' then
    raise exception 'MARIANA_RULE: La última sesión de Mariana empieza a las 20:00';
  end if;

  -- Serialize her writes for the day so two concurrent bookings can't both pass.
  perform pg_advisory_xact_lock(hashtext('therapist_rules:' || NEW.terapeuta_id::text || ':' || NEW.fecha::text));

  select count(*),
         count(*) filter (where abs(extract(epoch from (s.hora_inicio - NEW.hora_inicio))) < 120 * 60)
    into same_day, too_close
  from public.sessions s
  where s.id <> NEW.id
    and s.terapeuta_id = NEW.terapeuta_id
    and s.fecha = NEW.fecha
    and s.estado not in ('cancelada', 'no_show')
    and s.hora_inicio is not null;

  -- R3
  if same_day >= 3 then
    raise exception 'MARIANA_RULE: Mariana tiene máximo 3 sesiones por día';
  end if;

  -- R2
  if too_close > 0 then
    raise exception 'MARIANA_RULE: Mariana necesita 1 hora libre entre sesiones';
  end if;

  return NEW;
end;
$$;

-- Data: her bookable windows → mon–sat 10:00–21:15 so the slot engine can place a
-- 20:00 start (60 or 75 min). The engine clamps her STARTS to 10:00–20:00 via
-- therapistRules.js, so nothing after 20:00 is ever offered.
update public.therapists
   set booking_availability = '{"mon":[["10:00","21:15"]],"tue":[["10:00","21:15"]],"wed":[["10:00","21:15"]],"thu":[["10:00","21:15"]],"fri":[["10:00","21:15"]],"sat":[["10:00","21:15"]]}'::jsonb
 where id = 'b219e764-4664-594c-9eb3-d2b19e52caac';
