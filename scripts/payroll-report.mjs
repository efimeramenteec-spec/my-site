// scripts/payroll-report.mjs — #48: one therapist's payroll PDF (confirmed, non-llamada) from prod data.
// node scripts/payroll-report.mjs <Nombre> <desde YYYY-MM-DD> <hasta YYYY-MM-DD> <out.pdf>  (service key from .env)
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { downloadSessionReport } from '../src/lib/sessionReport.js'
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
const [name, desde, hasta, out] = process.argv.slice(2)
const { data: ther } = await sb.from('therapists').select('id,nombre,apellido,provision_rate,prueba_hasta')
const t = ther.find(x => x.nombre === name)
const SEL = 'id,patient_id,terapeuta_id,fecha,hora_inicio,hora_fin,tipo,modalidad,estado,monto,pagado,facturada,patient:patients(id,nombre,apellido,nombre_2,apellido_2,tipo_paciente)'
const { data: sessions, error } = await sb.from('sessions').select(SEL).eq('terapeuta_id', t.id).eq('estado','confirmada').neq('tipo','llamada').gte('fecha', desde).lte('fecha', hasta)
if (error) throw error
const png = fs.readFileSync('public/logos/LOGOTIPOLARGO (1).png')
const logo = { dataUrl: 'data:image/png;base64,' + png.toString('base64'), w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
const r = await downloadSessionReport({ sessions, therapists: ther, filters: { terapeuta: t.id, estado: 'confirmada', desde, hasta }, terapeutaName: [t.nombre, t.apellido].filter(Boolean).join(' '), logo, save: false })
if (!r.ok) throw new Error(r.error)
fs.writeFileSync(out, Buffer.from(r.pdf))
console.log(JSON.stringify({ therapist: t.nombre, id: t.id, count: r.count, pay: r.pay, fname: r.fname }))
