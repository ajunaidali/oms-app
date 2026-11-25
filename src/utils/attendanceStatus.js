export const PKT_TIME_ZONE = 'Asia/Karachi';
export const PKT_OFFSET = '+05:00';


export const ATTENDANCE_STATUS_VALUES = [
  'present',
  'absent',
  'half-day',
  'late',
  'early-departure',
  'late-early-departure',
  'pending',
  'leave',
  'missing',
];

export const ATTENDANCE_STATUS_LABELS = {
  present: 'Present',
  late: 'Late',
  'early-departure': 'Early Departure',
  'late-early-departure': 'Late + Early Departure',
  'half-day': 'Half Day',
  pending: 'Pending',
  absent: 'Absent',
  missing: 'Missing',
  leave: 'Leave',
};

export const ATTENDANCE_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'early-departure', label: 'Early Departure' },
  { value: 'late-early-departure', label: 'Late + Early Departure' },
  { value: 'half-day', label: 'Half Day' },
  { value: 'pending', label: 'Pending' },
  { value: 'missing', label: 'Missing' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
];

const KNOWN_ATTENDANCE_STATUSES = new Set(ATTENDANCE_STATUS_VALUES);
const JUSTIFICATION_ONLY_STATUSES = new Set(['approved', 'rejected']);

const PKT_PUNCH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PKT_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function canonicalizeAttendanceStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

const STATUS_ALIASES = {
  'early-leave': 'early-departure',
  earlyleave: 'early-departure',
  'left-early': 'early-departure',
  ontime: 'present',
  'on-time': 'present',
  'checked-out': 'present',
  checkedout: 'present',
};

function knownAttendanceStatus(value) {
  const canonical = canonicalizeAttendanceStatus(value);
  if (!canonical) return '';
  const mapped = STATUS_ALIASES[canonical] || canonical;
  return KNOWN_ATTENDANCE_STATUSES.has(mapped) ? mapped : '';
}

/**
 * @param {string} status
 * @param {string} [leaveType] - for "leave" rows, shows which leave, e.g. "Leave (Unpaid)".
 */
export function formatAttendanceStatusLabel(status, leaveType = '') {
  const canonical = knownAttendanceStatus(status) || canonicalizeAttendanceStatus(status);
  if (!canonical) return '';
  const leaveTypeText = String(leaveType || '').trim();
  if (canonical === 'leave' && leaveTypeText) {
    return `Leave (${leaveTypeText.charAt(0).toUpperCase()}${leaveTypeText.slice(1)})`;
  }
  if (ATTENDANCE_STATUS_LABELS[canonical]) {
    return ATTENDANCE_STATUS_LABELS[canonical];
  }
  return canonical
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getAttendanceStatusBadgeClass(status) {
  const value = knownAttendanceStatus(status) || canonicalizeAttendanceStatus(status);
  switch (value) {
    case 'present':
      return 'attendance-status-present';
    case 'pending':
      return 'attendance-status-pending';
    case 'absent':
      return 'attendance-status-absent';
    case 'missing':
      return 'attendance-status-missing';
    case 'late':
    case 'early-departure':
    case 'late-early-departure':
      return 'attendance-status-late';
    case 'half-day':
      return 'attendance-status-working';
    case 'leave':
      return 'attendance-status-checkout';
    default:
      if (value.includes('leave')) return 'attendance-status-checkout';
      return 'attendance-status-default';
  }
}

export function getApiAttendanceStatus(record) {
  if (!record || typeof record !== 'object') return '';

  const nested =
    record.attendance && typeof record.attendance === 'object' ? record.attendance : null;
  const candidates = [
    record.attendanceStatus,
    nested?.attendanceStatus,
    nested?.status,
    record.status,
  ];
  for (const candidate of candidates) {
    const canonical = canonicalizeAttendanceStatus(candidate);
    if (!canonical || JUSTIFICATION_ONLY_STATUSES.has(canonical)) continue;
    const known = knownAttendanceStatus(canonical);
    if (known) return known;
  }

  return '';
}

export function pktMinutes(iso) {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pkt = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return pkt.getUTCHours() * 60 + pkt.getUTCMinutes();
}

export function hhmmToMinutes(hhmm) {
  const raw = String(hhmm || '09:00').trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const period = ampm[3].toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!clock) return 9 * 60;
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 9 * 60;
  return hours * 60 + minutes;
}

function expectedOutMinutesForDayShift(start, end) {
  const outHour = Math.floor(end / 60);
  if (start < 14 * 60 && outHour >= 1 && outHour <= 6 && end < start) {
    return end + 12 * 60;
  }
  return end;
}

function minutesToHhmm(minutes) {
  const normalized = ((Number(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(normalized / 60))}:${pad2(Math.round(normalized % 60))}`;
}

function toGraceMinutes(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested =
      value.$numberInt ??
      value.$numberDecimal ??
      value.$numberLong ??
      value.value ??
      value.minutes;
    if (nested != null) return toGraceMinutes(nested);
  }

  const duration = parseGraceDurationMinutes(value);
  if (duration != null) return duration;

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

function parseGraceDurationMinutes(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.floor(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const durationLabel = raw.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)$/i);
  if (durationLabel) return Math.floor(Number(durationLabel[1]));

  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    // 00:14 / 01:00 are grace durations. 09:00 looks like a shift clock.
    if (hours <= 2) return hours * 60 + minutes;
    return null;
  }

  if (/[T]/.test(raw) || /AM|PM/i.test(raw)) return null;

  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

const LEVERAGE_IN_KEYS = [
  'checkInMinutes',
  'check_in_minutes',
  'checkInLeverage',
  'checkInGrace',
  'leverageIn',
  'inGrace',
  'inMinutes',
  'checkIn',
];

const LEVERAGE_OUT_KEYS = [
  'checkOutMinutes',
  'check_out_minutes',
  'checkOutLeverage',
  'checkOutGrace',
  'leverageOut',
  'outGrace',
  'outMinutes',
  'checkOut',
];

function firstLeverageMinutesField(value, keys) {
  for (const key of keys) {
    const raw = value[key];
    if (raw == null || raw === '') continue;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (parseGraceDurationMinutes(raw) == null) continue;
    return raw;
  }
  return undefined;
}

export function parseLeverageTime(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'number' || typeof value === 'string') {
    const minutes = parseGraceDurationMinutes(value);
    if (minutes == null) return null;
    return { checkInMinutes: minutes, checkOutMinutes: minutes };
  }

  if (typeof value !== 'object' || Array.isArray(value)) return null;

  // Nested department.leverageTime wins over top-level 0/0 defaults or
  // checkIn/checkOut clock fields on the same object.
  if (value.leverageTime && typeof value.leverageTime === 'object' && value.leverageTime !== value) {
    const nested = parseLeverageTime(value.leverageTime);
    if (nested) return nested;
  }

  const rawIn = firstLeverageMinutesField(value, LEVERAGE_IN_KEYS);
  const rawOut = firstLeverageMinutesField(value, LEVERAGE_OUT_KEYS);

  if (rawIn == null && rawOut == null) return null;

  const checkInMinutes = toGraceMinutes(rawIn);
  const checkOutMinutes = toGraceMinutes(rawOut);
  if (checkInMinutes === 0 && checkOutMinutes === 0) return null;

  return { checkInMinutes, checkOutMinutes };
}

export function applyLeverageToExpectedTimes(
  expectedCheckInTime,
  expectedCheckOutTime,
  leverageTime,
) {
  const start = hhmmToMinutes(expectedCheckInTime);
  const end = expectedOutMinutesForDayShift(start, hhmmToMinutes(expectedCheckOutTime));
  const leverage = parseLeverageTime(leverageTime) || { checkInMinutes: 0, checkOutMinutes: 0 };

  return {
    expectedCheckInTime: minutesToHhmm(start + leverage.checkInMinutes),
    expectedCheckOutTime: minutesToHhmm(end - leverage.checkOutMinutes),
  };
}

export function calcAttendanceStatus({
  checkIn,
  checkOut,
  expectedCheckInTime,
  expectedCheckOutTime,
  leverageTime,
} = {}) {
  if (!checkIn) return 'pending';

  const inMin = pktMinutes(checkIn);
  if (inMin == null) return 'pending';

  const adjusted = applyLeverageToExpectedTimes(
    expectedCheckInTime,
    expectedCheckOutTime,
    leverageTime,
  );
  const lateAfter = hhmmToMinutes(adjusted.expectedCheckInTime);
  const isLate = inMin > lateAfter;

  // Checked in, not out yet: arrival status only (same rule as the backend).
  if (!checkOut) return isLate ? 'late' : 'present';

  const outMin = pktMinutes(checkOut);
  if (outMin == null) return isLate ? 'late' : 'present';

  const earlyBefore = hhmmToMinutes(adjusted.expectedCheckOutTime);
  const isEarly = outMin < earlyBefore;

  const rawStart = hhmmToMinutes(expectedCheckInTime);
  const rawEnd = expectedOutMinutesForDayShift(rawStart, hhmmToMinutes(expectedCheckOutTime));
  const workingHours = (new Date(checkOut) - new Date(checkIn)) / 36e5;
  const expectedHours = Math.max(0, (rawEnd - rawStart) / 60);

  if (isLate && isEarly) return 'late-early-departure';
  if (isLate) return 'late';
  if (isEarly) return 'early-departure';
  if (workingHours < expectedHours * 0.75) {
    return workingHours >= expectedHours * 0.5 ? 'half-day' : 'late';
  }
  return 'present';
}

export function formatPktPunchTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return PKT_PUNCH_FORMATTER.format(date);
}

export function formatPktClockHHmm(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':');
    return `${pad2(hours)}:${minutes}`;
  }

  const minutes = pktMinutes(value);
  if (minutes == null) return '';
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

export function pktDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PKT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function pktWeekdayName(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  const date = new Date(`${dateKey}T12:00:00${PKT_OFFSET}`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PKT_TIME_ZONE,
    weekday: 'long',
  }).format(date);
}

export function pktWallClockToIso(dateKey, hhmm) {
  if (!dateKey || !hhmm) return '';
  const [hours, minutes, seconds = '00'] = String(hhmm).split(':');
  const date = new Date(
    `${dateKey}T${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}${PKT_OFFSET}`,
  );
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function formatPktDatetimeLocal(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PKT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = pad2(Number(parts.find((part) => part.type === 'hour')?.value) % 24);
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (!year || !month || !day || !minute) return '';
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function pktDatetimeLocalToIso(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return pktWallClockToIso(raw.slice(0, 10), raw.slice(11, 16));
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return pktWallClockToIso(raw.slice(0, 10), raw.slice(11));
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function resolveAttendanceStatusFromFields({
  status,
  attendanceStatus,
  checkIn,
  checkOut,
  expectedCheckInTime,
  expectedCheckOutTime,
  leverageTime,
} = {}) {
  const apiStatus = getApiAttendanceStatus({ status, attendanceStatus });
  const calculated = calcAttendanceStatus({
    checkIn,
    checkOut,
    expectedCheckInTime,
    expectedCheckOutTime,
    leverageTime,
  });

  // The backend is the source of truth. Recalculate only when the API
  // response does not contain a usable attendance status.
  return apiStatus || calculated;
}
