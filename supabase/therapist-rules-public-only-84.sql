-- #84 (2026-10-22, Nicolás): Mariana's rules apply ONLY to the public booking link.
-- Writes from the panel by the OWNER account or by MARIANA's own account skip every
-- MARIANA_RULE check (any time, day, presencial or en línea). Public flows
-- (/agendar, /reservar, public-booking.mjs, lead bot) write as service_role → still
-- enforced. sessions.excepcion_reglas (#57) keeps working for old rows / service writes.
-- The 3-consultorio cap (enforce_presencial_room_cap) is untouched and applies to all.
-- Supersedes the function body in sessions-excepcion-reglas.sql (#57).
-- JS mirror: src/lib/therapistRules.js#panelBypassesRules.

create or replace function public.enforce_therapist_rules()
returns trigger
language plpgsql
as $$
declare
  mariana constant uuid := 'b219e764-4664-594c-9eb3-d2b19e52caac';
  same_day int;
  too_close int;
begin
  -- #57: only the owner (or service_role / postgres) may turn the exception ON.
  -- Keeping an already-true flag on an edit is fine (the panel round-trips it).
  if NEW.excepcion_reglas
     and (TG_OP = 'INSERT' or OLD.excepcion_reglas is distinct from true)
     and not (public.is_owner()
              or coalesce(auth.role(), '') = 'service_role'
              or current_user in ('postgres', 'service_role', 'supabase_admin')) then
    raise exception 'EXCEPCION_REGLAS: solo el dueño puede marcar una excepción a las reglas';
  end if;

  if NEW.excepcion_reglas then
    return NEW;  -- #57: owner-approved exception skips ALL of Mariana's rules
  end if;

  -- #84: the rules bind ONLY the public booking link (public-booking / lead bot,
  -- which write as service_role). A panel write by the owner or by Mariana's own
  -- login is never blocked — any time, day or modalidad. (Room cap still applies.)
  if public.is_owner() or public.my_terapeuta_id() = mariana then
    return NEW;
  end if;

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

  -- R1 (#53): start between 11:00 and 20:00 inclusive; end not checked.
  if NEW.hora_inicio < time '11:00' then
    raise exception 'MARIANA_RULE: La primera sesión de Mariana empieza a las 11:00';
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
