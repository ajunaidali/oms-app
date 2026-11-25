// Calendar-period maths for the shared PeriodPicker. Everything is a plain
// "YYYY-MM-DD" string (PKT calendar day), so there are no timezone surprises.

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const SHORT_MONTH_NAMES = MONTH_NAMES;

export const PERIOD_MODES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'range', label: 'Range' },
];

const pad = (value) => String(value).padStart(2, '0');

function keyToUtc(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToKey(ms) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  return utcToKey(keyToUtc(value)) === value;
}

export function isMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY_RE.test(value) && Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12;
}

export function getTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(key, days) {
  return utcToKey(keyToUtc(key) + days * MS_PER_DAY);
}

export function addMonths(monthKey, months) {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${pad((((index % 12) + 12) % 12) + 1)}`;
}

export function getWeekRange(key) {
  const weekday = new Date(keyToUtc(key)).getUTCDay();
  const from = addDays(key, -((weekday + 6) % 7));
  return { from, to: addDays(from, 6) };
}

export function getMonthRange(key) {
  const monthKey = key.slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${pad(lastDay)}` };
}

export function countPeriodDays(from, to) {
  if (!isDateKey(from) || !isDateKey(to)) return 0;
  return Math.round((keyToUtc(to) - keyToUtc(from)) / MS_PER_DAY) + 1;
}

export function listDateKeys(from, to, max = 366) {
  const total = Math.min(countPeriodDays(from, to), max);
  return Array.from({ length: total }, (_, index) => addDays(from, index));
}

export function buildPeriod(mode, anchor) {
  if (!isDateKey(anchor)) return { mode, from: '', to: '' };
  if (mode === 'week') return { mode, ...getWeekRange(anchor) };
  if (mode === 'month') return { mode, ...getMonthRange(anchor) };
  return { mode, from: anchor, to: anchor };
}

export function detectPeriodMode(from, to) {
  if (!isDateKey(from) || !isDateKey(to)) return 'range';
  if (from === to) return 'day';
  const month = getMonthRange(from);
  if (month.from === from && month.to === to) return 'month';
  const week = getWeekRange(from);
  if (week.from === from && week.to === to) return 'week';
  return 'range';
}

export function periodFromMonthYear(monthYear) {
  return isMonthKey(monthYear)
    ? { mode: 'month', ...getMonthRange(monthYear) }
    : { mode: 'month', from: '', to: '' };
}

// 'YYYY-MM' when the period is exactly one whole calendar month, otherwise ''.
export function getFullMonthKey(period) {
  if (!period?.from || !period?.to) return '';
  const month = getMonthRange(period.from);
  return month.from === period.from && month.to === period.to ? period.from.slice(0, 7) : '';
}

export function isSingleDay(period) {
  return Boolean(period?.from) && period.from === period.to;
}

export function shiftPeriod(period, direction) {
  if (!period?.from) return period;
  const step = direction < 0 ? -1 : 1;

  if (period.mode === 'day') {
    const next = addDays(period.from, step);
    return { mode: 'day', from: next, to: next };
  }
  if (period.mode === 'week') {
    return { mode: 'week', from: addDays(period.from, 7 * step), to: addDays(period.to, 7 * step) };
  }
  if (period.mode === 'month') {
    return { mode: 'month', ...getMonthRange(`${addMonths(period.from.slice(0, 7), step)}-01`) };
  }

  const span = countPeriodDays(period.from, period.to || period.from);
  return {
    mode: 'range',
    from: addDays(period.from, span * step),
    to: addDays(period.to || period.from, span * step),
  };
}

export function withRangeFrom(period, from) {
  const to = period.to && from && period.to < from ? from : period.to;
  return { mode: 'range', from, to };
}

export function withRangeTo(period, to) {
  const from = period.from && to && period.from > to ? to : period.from;
  return { mode: 'range', from, to };
}

export function getPeriodPresets(todayKey = getTodayKey()) {
  const thisWeek = getWeekRange(todayKey);
  const lastWeek = getWeekRange(addDays(todayKey, -7));
  const thisMonth = getMonthRange(todayKey);
  const lastMonth = getMonthRange(`${addMonths(todayKey.slice(0, 7), -1)}-01`);
  const yesterday = addDays(todayKey, -1);

  return [
    { id: 'today', label: 'Today', mode: 'day', from: todayKey, to: todayKey },
    { id: 'yesterday', label: 'Yesterday', mode: 'day', from: yesterday, to: yesterday },
    { id: 'this-week', label: 'This week', mode: 'week', ...thisWeek },
    { id: 'last-week', label: 'Last week', mode: 'week', ...lastWeek },
    { id: 'last-7', label: 'Last 7 days', mode: 'range', from: addDays(todayKey, -6), to: todayKey },
    { id: 'this-month', label: 'This month', mode: 'month', ...thisMonth },
    { id: 'last-month', label: 'Last month', mode: 'month', ...lastMonth },
    { id: 'last-30', label: 'Last 30 days', mode: 'range', from: addDays(todayKey, -29), to: todayKey },
  ];
}

function formatDay(key, withYear) {
  const [year, month, day] = key.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]}${withYear ? ` ${year}` : ''}`;
}

export function formatPeriodLabel(period) {
  if (!period?.from && !period?.to) return 'All dates';
  if (!period.from) return `Up to ${formatDay(period.to, true)}`;
  if (!period.to) return `From ${formatDay(period.from, true)}`;
  if (period.from === period.to) return formatDay(period.from, true);

  if (period.mode === 'month' && getFullMonthKey(period)) {
    const [year, month] = period.from.split('-').map(Number);
    return `${FULL_MONTH_NAMES[month - 1]} ${year}`;
  }

  const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
  return `${formatDay(period.from, !sameYear)} – ${formatDay(period.to, true)}`;
}

// Log collections store full timestamps, so the end day must run to 23:59:59.999 PKT
// (a bare "YYYY-MM-DD" is read as UTC midnight and would drop the whole last day).
export function periodToTimestampBounds(period) {
  return {
    from: isDateKey(period?.from) ? `${period.from}T00:00:00+05:00` : '',
    to: isDateKey(period?.to) ? `${period.to}T23:59:59.999+05:00` : '',
  };
}

// Six Monday-first weeks (42 days) covering the given month, for a calendar grid.
export function getMonthGrid(monthKey) {
  const start = getWeekRange(`${monthKey}-01`).from;
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function formatMonthTitle(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${FULL_MONTH_NAMES[month - 1]} ${year}`;
}
