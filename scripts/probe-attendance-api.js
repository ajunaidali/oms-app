const base = 'https://management.offtheschool.io/api';

async function main() {
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: 'WEB0008', password: '12345678' }),
  });
  const loginJson = await login.json();
  console.log('login', login.status, loginJson.message || 'ok', Object.keys(loginJson.data || {}));
  const token = loginJson?.data?.token;
  if (!token) {
    console.log(JSON.stringify(loginJson, null, 2));
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const me = await fetch(`${base}/auth/me`, { headers });
  const meJson = await me.json();
  const user = meJson?.data || meJson;
  console.log('user', {
    name: user?.name,
    employeeId: user?.employeeId,
    role: user?.role?.name || user?.roleName,
    permissions: (user?.permissions || user?.role?.permissions || []).slice?.(0, 20) || user?.permissions,
  });

  const queries = [
    '',
    '?from=2026-11-01&to=2026-11-30',
    '?from=2026-10-01&to=2026-10-31',
    '?from=2026-09-01&to=2026-09-30',
    '?from=2025-11-01&to=2025-11-30',
  ];
  for (const q of queries) {
    const r = await fetch(`${base}/attendance/me${q}`, { headers });
    const j = await r.json();
    const list =
      j?.data?.records ||
      j?.data?.attendance ||
      j?.data?.items ||
      (Array.isArray(j?.data) ? j.data : null) ||
      j?.records ||
      [];
    const arr = Array.isArray(list) ? list : [];
    console.log(
      `attendance/me${q || '(none)'}`,
      r.status,
      'count',
      arr.length,
      'sample',
      JSON.stringify(arr[0] || j).slice(0, 280),
    );
  }

  const today = await fetch(`${base}/attendance/today`, { headers });
  const todayJson = await today.json();
  console.log('attendance/today', today.status, JSON.stringify(todayJson).slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
