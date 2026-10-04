-- Per-therapist hard booking rules, enforced in the DATABASE (#43, 2026-10-04).
--
-- Mariana Villegas is back from maternity leave. Until further notice her sessions
-- obey 4 hard rules on EVERY write path (drawer, Sesiones, /reservar, lead bot, SQL):
--   R1 start >= 10:00 and end <= 20:00
--   R2 starts at least 120 min apart from her other sessions that day
--   R3 max 3 sessions per day
--   R4 en línea only (no presencial)
-- Only non-cancelled sessions count (cancelada / legacy no_show are exempt).
--
-- JS source of truth: src/lib/therapistRules.js (slot engine + UI). This trigger
-- is the authoritative backstop — keep the numbers in sync with that file.
-- Raises 'MARIANA_RULE: <friendly reason>' (mapped in queries.js#friendlySessionError
-- and booking.mjs → public-booking 409).
--
-- Pre-rule data: the check only runs on INSERT, or on an UPDATE that changes
-- fecha / hora_inicio / hora_fin / modalidad / terapeuta_id — so flipping
-- estado / pagado / facturada on an old session that already breaks a rule is
-- never blocked. Additive: does not touch enforce_presencial_room_cap.

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

  -- R1
  if NEW.hora_inicio < time '10:00' or coalesce(NEW.hora_fin, NEW.hora_inicio) > time '20:00' then
    raise exception 'MARIANA_RULE: Mariana atiende de 10:00 a 20:00';
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

drop trigger if exists trg_enforce_therapist_rules on public.sessions;
create trigger trg_enforce_therapist_rules
  before insert or update on public.sessions
  for each row
  execute function public.enforce_therapist_rules();

-- Data (#43): her bookable windows → mon–sat 10:00–20:00. recibe_nuevos stays false, activo true.
update public.therapists
   set booking_availability = '{"mon":[["10:00","20:00"]],"tue":[["10:00","20:00"]],"wed":[["10:00","20:00"]],"thu":[["10:00","20:00"]],"fri":[["10:00","20:00"]],"sat":[["10:00","20:00"]]}'::jsonb
 where id = 'b219e764-4664-594c-9eb3-d2b19e52caac';
