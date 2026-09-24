-- Presencial 3-room cap, enforced in the DATABASE (2026-09-17).
--
-- Context: the practice has only 3 physical consultorios, so at most 3
-- PRESENCIAL sessions may overlap at any moment (across ALL therapists).
-- This rule already lived in the front-end (`src/lib/conflicts.js` roomsFull,
-- enforced in SesionDrawer + Sesiones), but it was CLIENT-SIDE ONLY: the public
-- /reservar booking function never checked it and let a 4th presencial into a
-- full 5pm slot (2026-09-17 incident). This trigger makes the cap authoritative
-- so NO write path — public booking, app, bulk SQL, future code — can exceed it.
--
-- En línea / llamada sessions need no room and never count. Cancelled / no_show
-- sessions free their room. Keep CAP in sync with conflicts.js CONSULTORIOS.
--
-- NOTE: one-off historical imports of overlapping presencial rows will now be
-- subject to this check. If a legitimate bulk load ever needs to bypass it,
-- wrap the load in:  ALTER TABLE public.sessions DISABLE TRIGGER
-- trg_enforce_presencial_room_cap;  ...load...;  ENABLE TRIGGER ...;

create or replace function public.enforce_presencial_room_cap()
returns trigger
language plpgsql
as $$
declare
  cap constant int := 3;          -- number of physical consultorios
  overlap_count int;
begin
  -- Flag-only updates (pagado, recordatorio_pago_at, pago_excluido, facturada…) don't
  -- touch the schedule, so they must never trip the cap — otherwise updating a
  -- presencial row in an already-full historical slot wrongly raises ROOMS_FULL
  -- (2026-09-24). Only enforce on INSERT or when a schedule field actually changes.
  if TG_OP = 'UPDATE'
     and NEW.modalidad is not distinct from OLD.modalidad
     and NEW.fecha is not distinct from OLD.fecha
     and NEW.hora_inicio is not distinct from OLD.hora_inicio
     and NEW.hora_fin is not distinct from OLD.hora_fin
     and NEW.estado is not distinct from OLD.estado then
    return NEW;
  end if;

  -- Only a non-cancelled PRESENCIAL session with a real time window occupies a
  -- room; everything else is exempt and passes straight through.
  if NEW.modalidad is distinct from 'presencial'
     or NEW.estado in ('cancelada', 'no_show')
     or NEW.fecha is null
     or NEW.hora_inicio is null
     or NEW.hora_fin is null then
    return NEW;
  end if;

  -- Serialize concurrent presencial writes for the SAME day so two simultaneous
  -- bookings can't each observe an open room and both insert a 4th (transaction
  -- lock, auto-released at commit/rollback).
  perform pg_advisory_xact_lock(hashtext('presencial_room:' || NEW.fecha::text));

  -- Count the other non-cancelled presencial sessions whose window overlaps
  -- NEW's (half-open intervals: back-to-back slots do NOT overlap).
  select count(*)
    into overlap_count
  from public.sessions s
  where s.id <> NEW.id
    and s.fecha = NEW.fecha
    and s.modalidad = 'presencial'
    and s.estado not in ('cancelada', 'no_show')
    and s.hora_inicio < NEW.hora_fin
    and NEW.hora_inicio < s.hora_fin;

  if overlap_count >= cap then
    raise exception
      'ROOMS_FULL: ya hay % sesiones presenciales en ese horario y solo hay % consultorios',
      cap, cap;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_presencial_room_cap on public.sessions;
create trigger trg_enforce_presencial_room_cap
  before insert or update on public.sessions
  for each row
  execute function public.enforce_presencial_room_cap();
