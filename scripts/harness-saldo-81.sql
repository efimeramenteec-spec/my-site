-- #81 B + C harness for the DB credit triggers. Run in the Supabase SQL editor / connector.
-- Wrapped in BEGIN … ROLLBACK: it parks one patient's lotes, inserts test sessions dated
-- 2020 and test lotes, prints the checks, and leaves NOTHING behind. Expected value in ().
begin;
create temp table _r(n serial, k text, v text) on commit drop;
do $t$
declare pid uuid := '7069a6f4-5671-4159-a3c0-27fb509416fe'; tid uuid; l1 uuid; s uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
begin
  select terapeuta_id into tid from sessions where patient_id=pid limit 1;
  update saldo_lotes set remaining = 0 where patient_id = pid;
  insert into saldo_lotes(patient_id, amount, price_per_session, remaining, origin, note) values (pid,140,35,140,'package','t81') returning id into l1;
  insert into sessions(patient_id, terapeuta_id, fecha, hora_inicio, hora_fin, tipo, modalidad, estado, monto, excepcion_reglas) values (pid, tid, '2020-01-06','10:00','11:15','individual','en_linea','confirmada',39,true) returning id into s;
  insert into _r(k,v) values ('C unapproved: s1 pagado (false)', (select pagado::text from sessions where id=s)), ('C lote remaining (140)', (select remaining::text from saldo_lotes where id=l1));
  update saldo_lotes set aprobado_at = now() where id = l1;
  insert into _r(k,v) values ('approve settles s1 (true)', (select pagado::text from sessions where id=s)), ('remaining (105)', (select remaining::text from saldo_lotes where id=l1));
  insert into sessions(patient_id, terapeuta_id, fecha, hora_inicio, hora_fin, tipo, modalidad, estado, monto, excepcion_reglas) values (pid, tid, '2020-01-13','10:00','11:15','individual','en_linea','confirmada',39,true) returning id into s2;
  insert into sessions(patient_id, terapeuta_id, fecha, hora_inicio, hora_fin, tipo, modalidad, estado, monto, excepcion_reglas) values (pid, tid, '2020-01-20','10:00','11:15','individual','en_linea','confirmada',39,true) returning id into s3;
  insert into sessions(patient_id, terapeuta_id, fecha, hora_inicio, hora_fin, tipo, modalidad, estado, monto, excepcion_reglas) values (pid, tid, '2020-01-27','10:00','11:15','individual','en_linea','programada',39,true) returning id into s4;
  update sessions set estado='confirmada' where id=s4;
  insert into sessions(patient_id, terapeuta_id, fecha, hora_inicio, hora_fin, tipo, modalidad, estado, monto, excepcion_reglas) values (pid, tid, '2020-02-03','10:00','11:15','individual','en_linea','confirmada',39,true) returning id into s5;
  insert into _r(k,v) values ('4 covered, 5th not (true,true,true,true,false)', (select string_agg(pagado::text, ',' order by fecha) from sessions where id in (s,s2,s3,s4,s5))),
    ('remaining (0)', (select remaining::text from saldo_lotes where id=l1)), ('consumos (4 x 35)', (select count(*)||' x '||max(amount) from saldo_consumos where lote_id=l1));
  update sessions set estado='cancelada', pagado=false where id=s4;
  insert into _r(k,v) values ('cancel refunds (35)', (select remaining::text from saldo_lotes where id=l1)), ('consumo revertido (true)', (select (revertido_at is not null)::text from saldo_consumos where session_id=s4));
  update sessions set estado = estado where id=s5;
  insert into _r(k,v) values ('s5 paid from refund (true)', (select pagado::text from sessions where id=s5)), ('remaining (0)', (select remaining::text from saldo_lotes where id=l1));
  insert into saldo_lotes(patient_id, amount, price_per_session, remaining, origin, aprobado_at, note) values (pid,20,39,20,'overpayment',now(),'t81');
  insert into saldo_lotes(patient_id, amount, price_per_session, remaining, origin, aprobado_at, note) values (pid,19,39,19,'overpayment',now(),'t81');
  insert into sessions(patient_id, terapeuta_id, fecha, hora_inicio, hora_fin, tipo, modalidad, estado, monto, excepcion_reglas) values (pid, tid, '2020-02-10','10:00','11:15','individual','en_linea','confirmada',39,true) returning id into s;
  insert into _r(k,v) values ('fragments pooled pay $39 (true)', (select pagado::text from sessions where id=s)), ('fragments left (0)', (select sum(remaining)::text from saldo_lotes where patient_id=pid and note='t81' and origin='overpayment'));
end $t$;
select k, v from _r order by n;
rollback;
