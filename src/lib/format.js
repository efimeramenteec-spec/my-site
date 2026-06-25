// es-MX formatting + small date utilities shared across pages.
const LOCALE = 'es-MX'

/** Accepts a Date or 'YYYY-MM-DD' string and returns a LOCAL Date (no TZ shift). */
export function toDate(d) {
  if (d instanceof Date) return d
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return new Date(d)
  }
  return new Date(d)
}

/** Date → 'YYYY-MM-DD' (local). */
export function dateKey(d = new Date()) {
  const dt = toDate(d)
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export function isSameDay(a, b) {
  return dateKey(a) === dateKey(b)
}

/** Monday → Sunday range that contains `d`, as { start, end } 'YYYY-MM-DD'. */
export function weekRange(d = new Date()) {
  const dt = toDate(d)
  const dow = (dt.getDay() + 6) % 7 // 0 = Monday
  const monday = new Date(dt)
  monday.setDate(dt.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: dateKey(monday), end: dateKey(sunday), monday, sunday }
}

export function addDays(d, n) {
  const dt = toDate(d)
  dt.setDate(dt.getDate() + n)
  return dt
}

// --- Display formatters ---

export function formatCurrency(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Number(n))
}

/** 'jueves 25 de junio' */
export function formatDateLong(d) {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toDate(d))
}

/** '25 jun' */
export function formatDateShort(d) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
  }).format(toDate(d))
}

/** 'HH:MM' or 'HH:MM:SS' → '5:00 p.m.' */
export function formatTime(hhmm) {
  if (!hhmm) return '—'
  const [h, m] = String(hhmm).split(':')
  const d = new Date(2000, 0, 1, Number(h), Number(m || 0))
  return new Intl.DateTimeFormat(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

/** Friendly relative day label for the upcoming list. */
export function relativeDayLabel(d) {
  const today = dateKey()
  const target = dateKey(d)
  if (target === today) return 'Hoy'
  if (target === dateKey(addDays(new Date(), 1))) return 'Mañana'
  return capitalize(
    new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric' }).format(toDate(d)),
  )
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function fullName(person) {
  if (!person) return '—'
  return [person.nombre, person.apellido].filter(Boolean).join(' ')
}

export function initials(person) {
  if (!person) return '—'
  return [person.nombre?.[0], person.apellido?.[0]].filter(Boolean).join('').toUpperCase()
}
