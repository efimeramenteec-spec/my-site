import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Efimeramente HQ (#96) — owner-only. The AI staff on one office floor, built from Nicolás's
// mockup (efimeramente-hq.html): same pixel faces, layout and brand colours. Live parts:
// each employee's status pill and their last 3 WhatsApp orders (hq_orders, read through the
// owner-gated hq-status function because the table is service_role only).
const STATUS_FN = '/.netlify/functions/hq-status'

const FONTS = 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap'

// Original 16x16 pixel portraits (from the mockup). Palette keys: . transparent, k ink, s skin, h hair.
const FACES = {
  owner: { pal: { k: '#2A2140', s: '#F1C7A3', h: '#3B2A1E', g: '#FFD84A', w: '#FFFFFF', c: '#7E52C2', b: '#B48AE4' }, map: [
    '................', '....gggggggg....', '...gggggggggg...', '....hhhhhhhh....', '...hhhhhhhhhh...', '...hssssssssh...', '...ssksssskss...', '...ssssssssss...', '...sssskkssss...', '....ssssssss....', '.....ssssss.....', '...cccbwwbccc...', '..ccccbwwbcccc..', '..ccccbbbbcccc..', '..cccccccccccc..', '..cccccccccccc..'] },
  michael: { pal: { k: '#2A2140', s: '#F0C29B', h: '#4A3426', w: '#FFFFFF', t: '#B48AE4', j: '#3D3550', m: '#FFD84A' }, map: [
    '................', '....hhhhhhhh....', '...hhhhhhhhhh...', '...hhhhhhhhhhh..', '...hssssssssh...', '...ssksssskss...', '...ssssssssss...', '...ssskkkksss...', '....ssssssss....', '.....ssssss.....', '...jjjwttwjjj...', '..jjjjwttwjjjj..', '..jjjjjttjjjjm..', '..jjjjjttjjjmm..', '..jjjjjjjjjjmm..', '..jjjjjjjjjj....'] },
  alex: { pal: { k: '#2A2140', s: '#E8B48C', h: '#2B2B2B', w: '#FFFFFF', r: '#1F9D63', y: '#FFD84A', n: '#2A2140' }, map: [
    '................', '....yyyyyyyy....', '...yyyyyyyyyy...', '...yyyyyyyyyyyy.', '...ssssssssss...', '...skksssskks...', '...ssssssssss...', '...ssssssssss...', '...shhhhhhhhs...', '....hhhhhhhh....', '.....hhhhhh.....', '...rrrrrrrrrr...', '..rrrrrrrrrrrr..', '..rrrrwrrrrrrr..', '..rrrrrrrrrrrr..', '..rrrrrrrrrrrr..'] },
  vince: { pal: { k: '#2A2140', s: '#F3CDB0', h: '#8A8A8A', w: '#FFFFFF', g: '#2A2140', v: '#A9D8FF', p: '#FCD1B5' }, map: [
    '................', '.....hhhhhh.....', '....hhhhhhhh....', '...hhhhhhhhhh...', '...hssssssssh...', '...gggsssgggs...', '...gwgggggwgs...', '...gggsssgggs...', '...ssssssssss...', '....sskkkkss....', '.....ssssss.....', '...vvvvvvvvvv...', '..vvvvvvvvvvvp..', '..vvvvvvvvvvpp..', '..vvvvvvvvvvp...', '..vvvvvvvvvv....'] },
  tim: { pal: { k: '#2A2140', s: '#F6DCCB', h: '#1C1C1C', w: '#FFFFFF', u: '#1C1C1C', z: '#E9E9E9', c: '#FFFFFF' }, map: [
    '...h..h..h......', '..hhhhhhhhhh....', '..hhhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhssssssshhh..', '..hsskkssskksh..', '...ssssssssss...', '...sssssssssss..', '...ssskkkksss...', '....ssssssss....', '.....ssssss.....', '...uzuzuzuzuz...', '..uuzuzuzuzuuu..', '..uuuuuuuuuuuu..', '..uuuuuuuuuuuu..', '..uuuuuuuuuuuu..'] },
  wes: { pal: { k: '#2A2140', s: '#F1CBA8', h: '#C98B4E', w: '#FFFFFF', x: '#FCD1B5', o: '#B7F5D8', m: '#B48AE4' }, map: [
    '................', '...hhhhhhhhhh...', '..hhhhhhhhhhhh..', '..hhhhhhhhhhhh..', '..hhssssssshhh..', '..hssksssskssh..', '..hsssssssssh...', '...ssssssssss...', '...sssskkssss...', '....ssssssss....', '.....ssssss.....', '...xxxxooxxxx...', '..xxxxxooxxxxx..', '..xxxxxmmxxxxx..', '..xxxxxxxxxxxx..', '..xxxxxxxxxxxx..'] },
}

function Face({ who, label }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = FACES[who]; const cv = ref.current
    if (!d || !cv) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, 16, 16)
    d.map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.' && d.pal[ch]) { ctx.fillStyle = d.pal[ch]; ctx.fillRect(x, y, 1, 1) }
    }))
  }, [who])
  return <canvas ref={ref} className="face" width="16" height="16" aria-label={label} />
}

// Static badge content from the mockup; the pill and the orders come from hq-status.
const STAFF = {
  michael: { name: 'Michael Scott', role: 'CEO', reports: 'Nicolás', boss: true,
    blurb: 'Runs the ship. Reviews every project daily, scores priorities, writes the orders for Terminal and calls you out when you drift from the one-new-patient-a-day goal.',
    dl: [['Owns', 'Morning brief, company memory, priorities, prompts for Terminal'], ['Schedule', 'Brief every day 07:51'], ['Call him', <><code>/michael</code> · WhatsApp <code>Michael: …</code></>], ['Never', 'Touches code or the database himself']] },
  alex: { name: 'Alex Hormozi', role: 'Marketing Manager', reports: 'Michael', boss: true,
    blurb: 'Owns the strategy: which offer, which angle, which channel. Reads the numbers every Monday and decides what the producers make next.',
    dl: [['Owns', 'Meta ads (now off), weekly report, content calendar'], ['Schedule', <>Monday Meta report <code>/marketize</code></>], ['Call him', <><code>/alex</code> · WhatsApp <code>Alex: …</code></>]] },
  vince: { name: 'Vince Gilligan', role: 'Ad scriptwriter', reports: 'Alex',
    blurb: 'Writes the ad scripts: angle, hook, voiceover. Waits for your OK before anything goes to production.',
    dl: [['Command', <><code>/vince</code> · <code>/adscript</code></>], ['Hands off to', 'Tim Burton, with the closed script']] },
  tim: { name: 'Tim Burton', role: 'Animated ad producer', reports: 'Alex',
    blurb: 'Turns a closed script into the finished animated ad. Needs 10 style screenshots and, if you have it, the recorded voiceover.',
    dl: [['Commands', <><code>/tim</code> · <code>/adgenerator</code> then <code>/adgenclose</code></>], ['Delivers', 'The ad file, saved, status updated']] },
  wes: { name: 'Wes Anderson', role: 'Carousel producer', reports: 'Alex',
    blurb: 'Takes your Spanish text and lays it out on brand: violet in every post, 8 colour pairs in rotation, Chetta titles, handle on the last slide only.',
    dl: [['Flow', 'Link to 9933, your text, render, Drive and WhatsApp, your “sí”, post 19:00 Mon/Wed/Fri'], ['Command', <code>/wes</code>]] },
}

const ESTADO = { nuevo: 'nuevo', respondido: 'respondido', en_cola: 'en cola', hecho: 'hecho' }
const when = (iso) => {
  const d = new Date(iso)
  return d.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Badge({ k, live }) {
  const s = STAFF[k]
  const emp = live?.empleados?.find((e) => e.key === k)
  const pill = emp ? emp.status : (live?.error ? 'sin datos' : '…')
  return (
    <article className={`badge${s.boss ? ' boss' : ''}`}>
      <div className="top">
        <Face who={k} label={`Pixel face of ${s.name}`} />
        <div className="who">
          <div className="name">{s.name}</div>
          <div className="role">{s.role}</div>
          <div className="reports">reports to {s.reports} · <span className={`pill ${emp?.ocupado ? 'plan' : 'live'}`}>{pill}</span></div>
        </div>
      </div>
      <div className="body">
        <p>{s.blurb}</p>
        <dl>{s.dl.map(([t, d]) => <React.Fragment key={t}><dt>{t}</dt><dd>{d}</dd></React.Fragment>)}</dl>
        <div className="orders">
          <div className="orders-h">Últimas órdenes</div>
          {!emp?.ordenes?.length && <div className="none">{live ? 'Ninguna todavía.' : 'Cargando…'}</div>}
          {emp?.ordenes?.map((o) => (
            <div key={o.id} className="order">
              <div className="order-meta"><span>{when(o.created_at)}</span><span className={`pill ${o.estado === 'en_cola' || o.estado === 'nuevo' ? 'plan' : 'live'}`}>{ESTADO[o.estado] || o.estado}</span></div>
              <div className="order-q">“{o.texto || '(vacía)'}”</div>
              {o.respuesta && <div className="order-a">{o.respuesta}</div>}
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

export default function HQ() {
  const [live, setLive] = useState(null)
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; document.head.appendChild(l)
    }
    let alive = true
    const load = async () => {
      try {
        const { data } = (await supabase?.auth.getSession()) || {}
        const token = data?.session?.access_token
        if (!token) throw new Error('sin sesión')
        const res = await fetch(STATUS_FN, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        if (alive) setLive(j)
      } catch (e) { if (alive) setLive({ error: e.message }) }
    }
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return (
    <div className="hq">
      <style>{CSS}</style>
      <div className="wrap">
        <header>
          <div className="eyebrow">Efimeramente · Quito · AI staff</div>
          <h1>Efimeramente HQ</h1>
          <p className="lede">Each employee is a specialist with one job, its own rules and its own channel. You talk to Michael; Michael runs the floor. Orders by WhatsApp, work done by Terminal, memory in one shared file.</p>
          {live?.error && <p className="warn">No pude leer el estado en vivo ({live.error}).</p>}
        </header>

        <section className="tier">
          <div className="owner">
            <Face who="owner" label="Pixel face of the owner" />
            <div className="who">
              <div className="name">Nicolás</div>
              <p><strong>Owner.</strong> Approves plans and patient-facing copy. Gives facts only he knows. Nothing else.</p>
            </div>
          </div>
          <div className="connector" aria-hidden="true" />
          <div className="row"><Badge k="michael" live={live} /></div>
        </section>

        <section className="tier">
          <div className="tier-head"><h2>Marketing</h2><span>one manager, three producers</span></div>
          <div className="row"><Badge k="alex" live={live} /></div>
          <div className="row">
            <Badge k="vince" live={live} />
            <Badge k="tim" live={live} />
            <Badge k="wes" live={live} />
          </div>
        </section>

        <section className="tier">
          <div className="tier-head"><h2>Empty desks</h2><span>to be hired next</span></div>
          <div className="row">
            <div className="empty"><div className="name">Finance</div><div>Receipts, credit, invoices, payroll</div></div>
            <div className="empty"><div className="name">Engineering</div><div>Terminal: builds, migrations, deploys</div></div>
            <div className="empty"><div className="name">Admin &amp; legal</div><div>ACESS permit, email, paperwork</div></div>
          </div>
        </section>

        <section className="tier">
          <div className="tier-head"><h2>Giving orders</h2><span className="pill live">live</span>{live?.costo_30d != null && <span>costo últimos 30 días: ${live.costo_30d.toFixed(2)}</span>}</div>
          <div className="wa">
            <div className="chat" aria-label="Example WhatsApp exchange">
              <div className="msg me">Michael: ¿qué tenemos pendiente hoy?</div>
              <div className="msg them">Michael: 3 cosas. 1) Recibo de Luna, ¿lo aplico? 2) Nómina de octubre cierra el sábado. 3) Wes espera tu texto del POST-02.</div>
              <div className="msg me">Wes: aquí va el texto del post 2 …</div>
              <div className="msg them">Wes: Recibido. Te mando las láminas en 10 min.</div>
            </div>
            <p className="foot">Start a message to 9933 with an employee's name. Only your number is obeyed. Money, patient messages and anything public still wait for your “sí”.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

// Scoped copy of the mockup's stylesheet (light theme, like the rest of the panel).
const CSS = `
.hq{--bg:#FEF8E9;--ink:#2A2140;--muted:#6B5F86;--violet:#B48AE4;--violet-deep:#7E52C2;--yellow:#FFD84A;--mint:#B7F5D8;--peach:#FCD1B5;--sky:#A9D8FF;--card:#FFFFFF;--line:#E7DCF6;--live:#1F9D63;--plan:#C27A00;
--f-display:"Silkscreen",ui-monospace,monospace;--f-body:"Instrument Sans",system-ui,-apple-system,sans-serif;--f-mono:"JetBrains Mono",ui-monospace,monospace;
background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.5;border-radius:24px;margin:-8px 0 24px}
.hq .wrap{max-width:1080px;margin:0 auto;padding:32px 16px 64px;display:flex;flex-direction:column;gap:40px}
.hq header{display:flex;flex-direction:column;gap:10px}
.hq .eyebrow{font-family:var(--f-mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hq h1{font-family:var(--f-display);font-weight:700;font-size:clamp(34px,7vw,64px);line-height:1;margin:0;color:var(--violet-deep);text-wrap:balance}
.hq .lede{max-width:62ch;margin:0;color:var(--muted)}
.hq .warn{margin:0;color:var(--plan);font-family:var(--f-mono);font-size:12px}
.hq h2{font-family:var(--f-display);font-size:18px;margin:0;letter-spacing:.02em}
.hq .tier{display:flex;flex-direction:column;gap:14px}
.hq .tier-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.hq .tier-head>span{font-family:var(--f-mono);font-size:12px;color:var(--muted)}
.hq .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.hq .badge{background:var(--card);border:2px solid var(--line);border-radius:4px;display:flex;flex-direction:column;min-width:0;box-shadow:4px 4px 0 var(--line)}
.hq .badge.boss{border-color:var(--violet);box-shadow:6px 6px 0 var(--violet)}
.hq .top{display:flex;gap:14px;padding:16px;align-items:center;border-bottom:2px dashed var(--line)}
.hq canvas.face{width:84px;height:84px;image-rendering:pixelated;flex:none;border-radius:2px}
.hq .who{min-width:0;display:flex;flex-direction:column;gap:2px}
.hq .name{font-family:var(--f-display);font-size:19px;line-height:1.1}
.hq .role{font-weight:600}
.hq .reports{font-family:var(--f-mono);font-size:12px;color:var(--muted)}
.hq .body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px}
.hq .body p{margin:0}
.hq dl{margin:0;display:grid;grid-template-columns:92px 1fr;gap:6px 10px;font-size:14px}
.hq dt{font-family:var(--f-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding-top:2px}
.hq dd{margin:0;min-width:0}
.hq code{font-family:var(--f-mono);font-size:12.5px;background:color-mix(in srgb,var(--violet) 18%,transparent);padding:1px 5px;border-radius:3px;white-space:nowrap}
.hq .pill{font-family:var(--f-mono);font-size:11px;padding:2px 7px;border:1.5px solid currentColor;border-radius:99px;white-space:nowrap}
.hq .live{color:var(--live)} .hq .plan{color:var(--plan)}
.hq .owner{display:flex;gap:14px;align-items:center;padding:14px 16px;border:2px solid var(--ink);border-radius:4px;background:var(--yellow);color:#2A2140;max-width:560px}
.hq .owner .name{font-size:17px}
.hq .owner p{margin:0;font-size:14px}
.hq .connector{height:22px;border-left:3px dotted var(--violet);margin-left:42px}
.hq .orders{border-top:2px dashed var(--line);padding-top:10px;display:flex;flex-direction:column;gap:8px}
.hq .orders-h{font-family:var(--f-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.hq .none{font-size:13px;color:var(--muted)}
.hq .order{display:flex;flex-direction:column;gap:3px;font-size:13px}
.hq .order-meta{display:flex;justify-content:space-between;gap:8px;font-family:var(--f-mono);font-size:11px;color:var(--muted)}
.hq .order-q{font-weight:600}
.hq .order-a{color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hq .empty{border:2px dashed var(--line);border-radius:4px;padding:16px;color:var(--muted);display:flex;flex-direction:column;gap:6px;justify-content:center}
.hq .empty .name{font-size:15px;color:var(--muted)}
.hq .wa{background:var(--card);border:2px solid var(--line);border-radius:4px;padding:16px;display:flex;flex-direction:column;gap:10px}
.hq .chat{display:flex;flex-direction:column;gap:8px;max-width:520px}
.hq .msg{padding:8px 12px;border-radius:10px;font-size:14px;max-width:85%}
.hq .me{align-self:flex-end;background:var(--mint);color:#1D3A2E}
.hq .them{align-self:flex-start;background:color-mix(in srgb,var(--violet) 22%,var(--card))}
.hq .foot{font-size:13px;color:var(--muted)}
@media (max-width:420px){.hq dl{grid-template-columns:1fr} .hq canvas.face{width:68px;height:68px}}
@media (prefers-reduced-motion:no-preference){.hq .badge{transition:transform .15s} .hq .badge:hover{transform:translate(-2px,-2px)}}
`
