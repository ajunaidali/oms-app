/**
 * Reproduce My Attendance client pipeline against live API.
 */
const base = 'https://management.offtheschool.io/api';

function unwrapData(response) {
  if (response == null) return null;
  if (Array.isArray(response.data)) return response.data;
  if (response.data != null && typeof response.data === 'object') return response.data;
  if (Array.isArray(response)) return response;
  return response;
}

function unwrapAttendanceList(response) {
  const data = unwrapData(response);
  if (Array.isArray(data)) return data;
  const buckets = ['records', 'attendance', 'items', 'punches']
    .map((key) => data?.[key])
    .filter((value) => Array.isArray(value) && value.length > 0);
  if (buckets.length === 1) return buckets[0];
  if (buckets.length > 1) return buckets.flat();
  return [];
}

function toLocalDateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // naive local YYYY-MM-DD
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function getRecordDateKey(record) {
  if (!record) return null;
  const ts =
    record.date ||
    record.timestamp ||
    record.punchTime ||
    record.checkInTime ||
    record.check_in_time ||
    record.checkIn ||
    record.check_in ||
    record.firstCheckIn ||
    record.checkOutTime ||
    record.check_out_time ||
    record.checkOut ||
    record.check_out ||
    record.lastCheckOut;
  return toLocalDateKey(ts);
}

async function main() {
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: 'WEB0008', password: '12345678' }),
  });
  const loginJson = await login.json();
  const token = loginJson?.data?.token;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const from = '2026-11-01';
  const to = '2026-11-30';
  const response = await (await fetch(`${base}/attendance/me?from=${from}&to=${to}`, { headers })).json();
  const list = unwrapAttendanceList(response);
  console.log('raw count', list.length);
  console.log(
    'date keys sample',
    list.slice(0, 5).map((r) => ({ date: r.date, key: getRecordDateKey(r), status: r.status, checkIn: r.checkIn || r.checkInTime, checkOut: r.checkOut || r.checkOutTime })),
  );

  const filtered = list.filter((record) => {
    const recordDate = getRecordDateKey(record);
    if (recordDate && recordDate < from) return false;
    if (recordDate && recordDate > to) return false;
    return true;
  });
  console.log('after date filter', filtered.length);

  // Check assignments permission
  for (const path of ['/assignments', '/departments', '/employees', '/leaves/my-leaves']) {
    const r = await fetch(`${base}${path}`, { headers });
    const j = await r.json().catch(() => ({}));
    console.log(path, r.status, (j.message || '').slice(0, 80), Array.isArray(j.data) ? `arr ${j.data.length}` : typeof j.data);
  }

  // Full sample first record keys
  console.log('first record keys', Object.keys(list[0] || {}));
  console.log('first record', JSON.stringify(list[0], null, 2).slice(0, 1200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
