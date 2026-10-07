-- #57 (2026-10-07): per-session exception to a therapist's rules.
-- sessions.excepcion_reglas (bool, default false). When true, enforce_therapist_rules
-- skips every MARIANA_RULE check for that row. Only the owner / service_role can SET
-- it to true (checked in the trigger — RLS can't see column values per role).
-- The trigger is never disabled; the 3-consultorio cap and other triggers still apply.
-- Supersedes the function body in therapist-rules-r1-11am.sql (#53).

alter table public.sessions
  add column if not exists excepcion_reglas boolean not null default false;

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
