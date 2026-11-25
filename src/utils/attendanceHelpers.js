import apiClient from '../api/apiClient.js';
import { API_ENDPOINTS } from '../api/apiConfig.js';
import { createCachedFetcher, getCachedResource } from './fetchCache.js';
import { unwrapData, unwrapList, getRecordId, getDisplayName, collectUserIdentityIds, isMongoId } from './apiHelpers.js';
import { WEEK_DAYS, getWorkScheduleForDateKey } from './assignmentHelpers.js';
import { getUserPermissions, isSuperAdminUser } from './permissionHelpers.js';
import {
  applyLeverageToExpectedTimes,
  calcAttendanceStatus,
  canonicalizeAttendanceStatus,
  ATTENDANCE_STATUS_FILTER_OPTIONS,
  formatAttendanceStatusLabel,
  formatPktClockHHmm,
  formatPktDatetimeLocal,
  formatPktPunchTime,
  getApiAttendanceStatus,
  getAttendanceStatusBadgeClass,
  parseLeverageTime,
  pktDateKey,
  pktDatetimeLocalToIso,
  pktWallClockToIso,
  pktWeekdayName,
  resolveAttendanceStatusFromFields,
} from './attendanceStatus.js';

export { getUserPermissions, isSuperAdminUser };
export {
  ATTENDANCE_STATUS_FILTER_OPTIONS,
  calcAttendanceStatus,
  canonicalizeAttendanceStatus,
  formatAttendanceStatusLabel,
  formatPktClockHHmm,
  formatPktDatetimeLocal,
  formatPktPunchTime,
  getApiAttendanceStatus,
  getAttendanceStatusBadgeClass,
  pktDateKey,
  pktDatetimeLocalToIso,
  pktWallClockToIso,
  pktWeekdayName,
};

export function unwrapAttendanceList(response) {
  const data = unwrapData(response);
  if (Array.isArray(data)) return data;

  const buckets = ['records', 'attendance', 'items', 'punches']
    .map((key) => data?.[key])
    .filter((value) => Array.isArray(value) && value.length > 0);

  if (buckets.length === 1) return buckets[0];
  if (buckets.length > 1) return buckets.flat();
  return [];
}

export function getRecordRemarks(record) {
  const remarks =
    record?.remarks ??
    record?.justification?.remarks ??
    record?.note ??
    record?.notes ??
    record?.comment ??
    '';
  return String(remarks).trim();
}

const SYSTEM_ATTENDANCE_REMARK_PATTERNS = [
  /^auto[- ]marked absent/i,
  /no check-in recorded/i,
  /no check in recorded/i,
];

export function isSystemAttendanceRemark(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return SYSTEM_ATTENDANCE_REMARK_PATTERNS.some((pattern) => pattern.test(value));
}

function getExplicitJustificationStatus(record) {
  const candidates = [
    record?.justificationStatus,
    record?.justification?.status,
    record?.justification?.justificationStatus,
    record?.remarksStatus,
    record?.approvalStatus,
    record?.remarkApprovalStatus,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeJustificationStatus(candidate);
    if (normalized) return normalized;
  }

  return '';
}

export function getJustificationReason(record) {
  if (!record || typeof record !== 'object') return '';

  const justification = record.justification;
  const candidates = [
    typeof justification === 'string' ? justification : '',
    justification?.reason,
    justification?.text,
    justification?.description,
    justification?.message,
    justification?.note,
    justification?.remarks,
    record.reason,
    record.justificationReason,
    record.submittedReason,
    record.justificationText,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value && !isSystemAttendanceRemark(value)) {
      return value;
    }
  }

  const explicitStatus = getExplicitJustificationStatus(record);
  if (explicitStatus) {
    const remarks = getRecordRemarks(record);
    if (remarks && !isSystemAttendanceRemark(remarks)) return remarks;
  }

  return '';
}

export function applySubmittedJustificationToRecord(record, reason) {
  const trimmed = String(reason || '').trim();
  if (!record || !trimmed) return record;

  const status = getExplicitJustificationStatus(record) || 'pending';

  return {
    ...record,
    reason: trimmed,
    justificationStatus: status,
    justification: {
      ...(typeof record.justification === 'object' && record.justification !== null
        ? record.justification
        : {}),
      reason: trimmed,
      status,
    },
  };
}

export function hasUserSubmittedJustification(record) {
  if (!record) return false;

  const explicitStatus = getExplicitJustificationStatus(record);
  if (explicitStatus) return true;

  const nestedReason = String(record?.justification?.reason || '').trim();
  if (nestedReason) return true;

  const reason = String(record?.reason || '').trim();
  if (reason && !isSystemAttendanceRemark(reason)) return true;

  return false;
}

const JUSTIFICATION_STATUSES = new Set(['pending', 'approved', 'rejected']);
const IGNORED_JUSTIFICATION_STATUS_VALUES = new Set(['none', 'n/a', 'na', 'null', 'undefined']);

function normalizeJustificationStatus(value) {
  const status = String(value || '').toLowerCase().trim();
  if (!status || IGNORED_JUSTIFICATION_STATUS_VALUES.has(status)) return '';
  return JUSTIFICATION_STATUSES.has(status) ? status : '';
}

export function getJustificationStatus(record) {
  const status = getExplicitJustificationStatus(record);

  if (status) {
    return status;
  }

  if (hasUserSubmittedJustification(record)) {
    return 'pending';
  }

  return '';
}

export function getRejectionReason(record) {
  const status = getJustificationStatus(record);
  const reason = String(record?.reason || '').trim();
  const remarks = String(record?.remarks || '').trim();

  if (status === 'rejected') {
    if (remarks && remarks !== reason) return remarks;
    return String(record?.rejectionReason || record?.rejectReason || remarks || '').trim();
  }

  return String(record?.rejectionReason || record?.rejectReason || '').trim();
}

export function canCreateAnyAttendance(user) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  return getUserPermissions(user).includes('attendance:create:any');
}

export function canUpdateAnyAttendance(user) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  return getUserPermissions(user).includes('attendance:update:any');
}

export function canWriteAnyAttendance(user) {
  return canCreateAnyAttendance(user) || canUpdateAnyAttendance(user);
}

export function canViewAllAttendanceRecords(user) {
  return isSuperAdminUser(user);
}

export function canManageAllAttendance(user) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;

  const permissions = getUserPermissions(user);
  if (
    permissions.includes('attendance:read:any') ||
    permissions.includes('attendance:create:any') ||
    permissions.includes('attendance:update:any')
  ) {
    return true;
  }

  if (
    permissions.includes('employee:read:any') &&
    permissions.includes('assignment:read:any')
  ) {
    return true;
  }

  return false;
}

export function shouldUseOwnAttendanceOnly(user) {
  if (isSuperAdminUser(user)) return false;

  const permissions = getUserPermissions(user);
  if (permissions.length === 0) return false;
  return (
    permissions.includes('attendance:read:own') &&
    !permissions.includes('attendance:read:any')
  );
}

export function toLocalDateKey(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return pktDateKey(value) || null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const datePrefix = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    // UTC/zero-offset midnight usually means a calendar date, not a punch instant.
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.\d+)?(Z|[+-]00:00)?$/.test(raw)) {
      return datePrefix;
    }
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    return null;
  }

  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return pktDateKey(date) || null;
  } catch {
    return null;
  }
}

export function getTodayDateValue(date = new Date()) {
  return pktDateKey(date) || '';
}

export function parseAttendanceDateTime(value, dateKey = '') {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    if (!dateKey) return null;
    const iso = pktWallClockToIso(dateKey, raw);
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const iso = pktDatetimeLocalToIso(raw);
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getWorkingDuration(checkIn, checkOut, dateKey = '') {
  const start = parseAttendanceDateTime(checkIn, dateKey);
  let end = parseAttendanceDateTime(checkOut, dateKey);
  if (!start || !end) return null;

  if (end.getTime() === start.getTime()) {
    return { hours: 0, minutes: 0, totalMinutes: 0 };
  }

  // Overnight shift: check-out is on the next calendar day.
  if (end < start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  const totalMinutes = Math.floor((end - start) / 60000);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return null;

  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMinutes,
  };
}

export function getRecordDateKey(record) {
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

export function formatRecordDate(record) {
  const dateKey = getRecordDateKey(record);
  if (!dateKey) return '—';

  try {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

export function getRecordEmployeeName(record) {
  return getDisplayName(record?.employee) || record?.employeeName || '—';
}

export function getRecordEmployeeCode(record) {
  const employee = record?.employee;
  if (employee && typeof employee === 'object') {
    return employee.employeeId || getRecordId(employee) || '—';
  }
  return record?.employeeId || '—';
}

function getRecordEmployeeKeys(record) {
  const keys = new Set();
  if (!record) return keys;

  const employee = record.employee;
  if (employee && typeof employee === 'object') {
    const employeeRecordId = getRecordId(employee);
    if (employeeRecordId) keys.add(String(employeeRecordId));
    if (employee.employeeId) keys.add(String(employee.employeeId));
  }

  if (record.employeeId) keys.add(String(record.employeeId));
  if (typeof record.employee === 'string') keys.add(String(record.employee));

  const recordId = getRecordId(record);
  if (recordId) keys.add(String(recordId));

  return keys;
}

function getUserEmployeeKeys(user) {
  const keys = new Set();
  if (!user) return keys;

  const employee = user.employee;
  if (employee && typeof employee === 'object') {
    const employeeRecordId = getRecordId(employee);
    if (employeeRecordId) keys.add(String(employeeRecordId));
    if (employee.employeeId) keys.add(String(employee.employeeId));
  }

  if (user.employeeId) keys.add(String(user.employeeId));
  if (typeof user.employee === 'string') keys.add(String(user.employee));

  const userRecordId = getRecordId(user);
  if (userRecordId) keys.add(String(userRecordId));

  return keys;
}

export function isOwnAttendanceRecord(record, currentUser) {
  if (!record || !currentUser) return false;

  const userKeys = getUserEmployeeKeys(currentUser);
  const recordKeys = getRecordEmployeeKeys(record);

  for (const key of recordKeys) {
    if (userKeys.has(key)) return true;
  }

  return false;
}

function recordHasJustification(record) {
  return hasUserSubmittedJustification(record);
}

function applyJustificationFilters(records, filters = {}) {
  let next = records.filter(recordHasJustification);

  if (filters.date) {
    next = next.filter((record) => getRecordDateKey(record) === filters.date);
  }

  if (filters.status) {
    next = next.filter(
      (record) => getJustificationStatus(record) === String(filters.status).toLowerCase(),
    );
  }

  return next;
}

async function fetchJustificationsFromMyAttendance(filters = {}) {
  const params = new URLSearchParams();
  if (filters.date) {
    params.set('from', filters.date);
    params.set('to', filters.date);
  }

  const query = params.toString();
  const endpoint = query
    ? `${API_ENDPOINTS.ATTENDANCE.ME}?${query}`
    : API_ENDPOINTS.ATTENDANCE.ME;
  const response = await apiClient.get(endpoint);
  return applyJustificationFilters(unwrapAttendanceList(response), filters);
}

function mergeJustificationLists(...lists) {
  const merged = new Map();

  lists.flat().forEach((record, index) => {
    const attendanceId = getAttendanceRecordId(record) || getRecordId(record) || `row-${index}`;
    if (!merged.has(String(attendanceId))) {
      merged.set(String(attendanceId), record);
      return;
    }
    mergeJustificationRecord(merged.get(String(attendanceId)), record);
  });

  return Array.from(merged.values());
}

function getEmployeeKey(record) {
  const keys = getRecordEmployeeKeys(record);
  return keys.size > 0 ? [...keys][0] : '';
}

function mergeJustificationRecord(existing, record) {
  const recordReason = getJustificationReason(record);
  if (recordReason) {
    existing.reason = recordReason;
    existing.justification = {
      ...(typeof existing.justification === 'object' && existing.justification !== null
        ? existing.justification
        : {}),
      ...(typeof record.justification === 'object' && record.justification !== null
        ? record.justification
        : {}),
      reason: recordReason,
      status:
        getExplicitJustificationStatus(record) ||
        getExplicitJustificationStatus(existing) ||
        existing.justification?.status ||
        'pending',
    };
  } else if (record.justification && typeof record.justification === 'object') {
    existing.justification = {
      ...(typeof existing.justification === 'object' && existing.justification !== null
        ? existing.justification
        : {}),
      ...record.justification,
    };
  }

  const recordStatus = getJustificationStatus(record);

  if (recordStatus && recordStatus !== 'pending') {
    existing.justificationStatus =
      record.justificationStatus ||
      record.remarksStatus ||
      record.approvalStatus ||
      recordStatus;
  } else if (!existing.justificationStatus && record.justificationStatus) {
    existing.justificationStatus = record.justificationStatus;
  } else if (!existing.justificationStatus && recordStatus === 'pending') {
    existing.justificationStatus = 'pending';
  }

  if (!getRejectionReason(existing) && getRejectionReason(record)) {
    existing.rejectionReason = record.rejectionReason || record.rejectReason;
  }

  if (!getRecordId(existing) && getRecordId(record)) {
    existing._id = record._id;
    existing.id = record.id;
  }

  if (!existing.attendanceId && (record.attendanceId || getJustificationAttendanceId(record))) {
    existing.attendanceId = record.attendanceId || getJustificationAttendanceId(record);
  }
}

export function mergeAttendanceJustificationFields(existing, record) {
  if (!existing || !record) return existing;
  mergeJustificationRecord(existing, record);
  return existing;
}

export function groupJustificationRecords(records) {
  const groups = new Map();

  records.forEach((record, index) => {
    const employeeKey = getEmployeeKey(record) || `unknown-${index}`;
    const dateKey = getRecordDateKey(record) || `row-${index}`;
    const key = `${employeeKey}|${dateKey}`;

    if (!groups.has(key)) {
      groups.set(key, { ...record });
      return;
    }

    mergeJustificationRecord(groups.get(key), record);
  });

  return Array.from(groups.values());
}

export function unwrapJustificationList(response) {
  const data = unwrapData(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.justifications)) return data.justifications;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.attendance)) return data.attendance;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export function getNormalizedAttendanceStatus(record) {
  return canonicalizeAttendanceStatus(getEffectiveAttendanceStatus(record));
}

function normalizePunchType(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function isCheckInType(type) {
  const normalized = normalizePunchType(type);
  return normalized.includes('checkin') || normalized === 'in';
}

function isCheckOutType(type) {
  const normalized = normalizePunchType(type);
  return normalized.includes('checkout') || normalized === 'out';
}

function coerceAttendanceTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value === 'object') {
    return coerceAttendanceTimestamp(
      value.timestamp ||
        value.punchTime ||
        value.time ||
        value.dateTime ||
        value.datetime ||
        value.checkInTime ||
        value.checkOutTime,
    );
  }

  const raw = String(value).trim();
  if (!raw || raw === '—' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') {
    return null;
  }
  return raw;
}

function timestampValue(value, dateKey = '') {
  const coerced = coerceAttendanceTimestamp(value);
  if (!coerced) return 0;
  const parsed = parseAttendanceDateTime(coerced, dateKey);
  return parsed ? parsed.getTime() : 0;
}

function getPunchListTimes(record) {
  const lists = [record?.punches, record?.punchLogs, record?.entries, record?.events].filter(
    (value) => Array.isArray(value) && value.length > 0,
  );
  let checkIn = null;
  let checkOut = null;
  let checkInAt = 0;
  let checkOutAt = 0;

  lists.forEach((list) => {
    list.forEach((punch) => {
      if (!punch || typeof punch !== 'object') return;
      const type = punch.type || punch.punchType;
      const timestamp = coerceAttendanceTimestamp(
        punch.timestamp || punch.punchTime || punch.time || punch.dateTime,
      );
      if (!timestamp) return;
      const at = timestampValue(timestamp);

      if (isCheckInType(type) && (!checkIn || at < checkInAt)) {
        checkIn = timestamp;
        checkInAt = at;
      }
      if (isCheckOutType(type) && (!checkOut || at > checkOutAt)) {
        checkOut = timestamp;
        checkOutAt = at;
      }
    });
  });

  return { checkIn, checkOut };
}

export function getRecordCheckInTime(record) {
  if (!record || typeof record !== 'object') return null;

  const direct = coerceAttendanceTimestamp(
    record.checkInTime ||
      record.check_in_time ||
      record.checkIn ||
      record.check_in ||
      record.firstCheckIn ||
      record.checkInAt ||
      record.firstPunchIn,
  );
  if (direct) return direct;

  const type = record.type || record.punchType;
  if (isCheckInType(type)) {
    return coerceAttendanceTimestamp(record.timestamp || record.punchTime);
  }

  return getPunchListTimes(record).checkIn;
}

export function getRecordCheckOutTime(record) {
  if (!record || typeof record !== 'object') return null;

  const direct = coerceAttendanceTimestamp(
    record.checkOutTime ||
      record.check_out_time ||
      record.checkOut ||
      record.check_out ||
      record.lastCheckOut ||
      record.checkOutAt ||
      record.lastPunchOut,
  );
  if (direct) return direct;

  const type = record.type || record.punchType;
  if (isCheckOutType(type)) {
    return coerceAttendanceTimestamp(record.timestamp || record.punchTime);
  }

  return getPunchListTimes(record).checkOut;
}

/**
 * Checked in, not checked out yet, and the day is not over. The backend now stores
 * "present"/"late" at check-in (no longer "pending"), so "Pending / still working" is
 * read from the punches. Past open days become "missing" in the nightly job.
 */
export function isOpenCheckInRecord(record, today = getTodayDateValue()) {
  if (!record || !getRecordCheckInTime(record) || getRecordCheckOutTime(record)) return false;
  const dateKey = getRecordDateKey(record);
  return !dateKey || !today || dateKey >= today;
}

export function computeTodayAttendanceStatsFromRecords(records, totalEmployeeCount = 0) {
  const uniqueEmployees = new Set();
  let checkedOut = 0;
  let stillWorking = 0;
  let markedPresent = 0;

  (Array.isArray(records) ? records : []).forEach((record) => {
    const identities = getAttendanceEmployeeIdentityKeys(record);
    if (identities.size > 0) {
      uniqueEmployees.add([...identities][0]);
    }

    const status = getNormalizedAttendanceStatus(record);
    if (status.includes('absent') || status.includes('on-leave') || status === 'leave') {
      return;
    }

    const checkIn = getRecordCheckInTime(record);
    const checkOut = getRecordCheckOutTime(record);

    if (checkIn && checkOut) {
      checkedOut += 1;
      return;
    }

    if (checkIn && !checkOut) {
      stillWorking += 1;
      return;
    }

    if (status === 'checked-out' || status === 'checked_out') {
      checkedOut += 1;
    } else if (status === 'still-working' || status === 'still_working' || status === 'working') {
      stillWorking += 1;
    } else if (status.includes('present') || status.includes('holiday')) {
      markedPresent += 1;
    }
  });

  return {
    todayPresent: checkedOut + stillWorking + markedPresent,
    checkedOut,
    stillWorking,
    totalUsers: totalEmployeeCount > 0 ? totalEmployeeCount : uniqueEmployees.size,
  };
}

const JUSTIFICATION_REQUIRED_ATTENDANCE_STATUSES = new Set([
  'absent',
  'half-day',
  'halfday',
  'half-day-leave',
  'missing',
  'not-marked',
  'early-leave',
  'early-departure',
  'left-early',
  'on-leave',
  'leave',
  'unapproved',
  'unapproved-absence',
]);

// HR policy: late arrivals can never be justified (matches the backend).
const JUSTIFICATION_NOT_REQUIRED_ATTENDANCE_STATUSES = new Set([
  'present',
  'checked-out',
  'pending',
  'still-working',
  'working',
  'late',
  'late-early-departure',
]);

export function attendanceRequiresJustification(record) {
  if (!record) return false;

  if (record.requiresJustification === true || record.justificationRequired === true) {
    return true;
  }

  const existingJustificationStatus =
    record?.justificationStatus ||
    record?.remarksStatus ||
    record?.justification?.status;

  if (normalizeJustificationStatus(existingJustificationStatus)) {
    return true;
  }

  const status = getNormalizedAttendanceStatus(record);
  if (!status || JUSTIFICATION_NOT_REQUIRED_ATTENDANCE_STATUSES.has(status) || isRecordLate(record)) {
    return false;
  }

  return JUSTIFICATION_REQUIRED_ATTENDANCE_STATUSES.has(status);
}

export function isAttendancePunchRow(record) {
  if (!record) return false;
  if (record.attendanceId) return false;
  if (record.attendance && typeof record.attendance === 'object' && getRecordId(record.attendance)) {
    return false;
  }
  if (typeof record.attendance === 'string' && record.attendance.trim()) return false;

  // Daily documents usually have a calendar `date`. Punch events use type/timestamp.
  if (record.date) return false;

  return Boolean(record.type || record.punchType || record.punchTime);
}

export function getAttendanceRecordId(record) {
  if (!record) return '';

  if (record.attendanceId) {
    return String(record.attendanceId);
  }

  if (record.attendance && typeof record.attendance === 'object') {
    return getRecordId(record.attendance);
  }

  if (typeof record.attendance === 'string' && record.attendance.trim()) {
    return record.attendance.trim();
  }

  if (isAttendancePunchRow(record)) {
    return '';
  }

  return getRecordId(record);
}

function addIdentityKey(keys, value) {
  if (value == null || value === '') return;
  const str = String(value).trim();
  if (!str) return;
  keys.add(str);
  if (str.includes('@')) keys.add(str.toLowerCase());
}

export function getAttendanceEmployeeIdentityKeys(record) {
  const keys = new Set();
  if (!record) return keys;

  const employee = record.employee;
  if (employee && typeof employee === 'object') {
    addIdentityKey(keys, getRecordId(employee));
    addIdentityKey(keys, employee.employeeId);
    addIdentityKey(keys, employee.code);
    addIdentityKey(keys, employee.userId);
    addIdentityKey(keys, employee.email);
    addIdentityKey(keys, getRecordId(employee.user));
  } else if (typeof employee === 'string') {
    addIdentityKey(keys, employee);
  }

  addIdentityKey(keys, record.employeeId);
  addIdentityKey(keys, record.userId);
  addIdentityKey(keys, getRecordId(record.user));
  if (typeof record.user === 'string') addIdentityKey(keys, record.user);

  return keys;
}

export function getEditableAttendanceId(record) {
  const attendanceId = getAttendanceRecordId(record);
  if (attendanceId) return attendanceId;
  if (isAttendancePunchRow(record)) return '';
  return getRecordId(record);
}

export function getAttendanceRowKey(record, index = 0) {
  const identities = [...getAttendanceEmployeeIdentityKeys(record)];
  const employee = identities[0] || 'unknown';
  const dateKey = getRecordDateKey(record) || `row-${index}`;
  const attendanceId = getEditableAttendanceId(record);
  return attendanceId ? `${attendanceId}|${employee}|${dateKey}` : `${employee}|${dateKey}|${index}`;
}

function findGroupedRecordKey(aliasToCanonical, identities, dateKey) {
  for (const identity of identities) {
    const alias = `${identity}|${dateKey}`;
    if (aliasToCanonical.has(alias)) return aliasToCanonical.get(alias);
  }
  return '';
}

function createGroupedAttendanceRecord(record) {
  const attendanceId = getEditableAttendanceId(record);
  const grouped = {
    ...record,
    checkInTime: getRecordCheckInTime(record),
    checkOutTime: getRecordCheckOutTime(record),
  };

  if (attendanceId) {
    grouped.attendanceId = attendanceId;
  }

  return grouped;
}

function mergeGroupedAttendanceRecord(existing, record) {
  const dateKey = getRecordDateKey(existing) || getRecordDateKey(record) || '';
  const checkIn = getRecordCheckInTime(record);
  const checkOut = getRecordCheckOutTime(record);
  const existingCheckIn = parseAttendanceDateTime(existing.checkInTime, dateKey);
  const existingCheckOut = parseAttendanceDateTime(existing.checkOutTime, dateKey);
  const nextCheckIn = parseAttendanceDateTime(checkIn, dateKey);
  const nextCheckOut = parseAttendanceDateTime(checkOut, dateKey);

  if (checkIn && (!existingCheckIn || (nextCheckIn && nextCheckIn < existingCheckIn))) {
    existing.checkInTime = checkIn;
  }

  if (checkOut && (!existingCheckOut || (nextCheckOut && nextCheckOut > existingCheckOut))) {
    existing.checkOutTime = checkOut;
  }

  const nextStatus = record.status || record.attendanceStatus;
  if (nextStatus) {
    const existingStatus = String(existing.status || existing.attendanceStatus || '').toLowerCase();
    if (!existingStatus || existingStatus === 'pending') {
      existing.status = nextStatus;
    }
  }

  if (!existing.source && record.source) {
    existing.source = record.source;
  }

  if (!existing.deviceId && !existing.deviceIp) {
    existing.deviceId = record.deviceId;
    existing.deviceIp = record.deviceIp;
  }

  if (!existing.remarks?.trim() && record.remarks?.trim()) {
    existing.remarks = record.remarks;
  }

  const parentId = getEditableAttendanceId(record);
  if (parentId && !existing.attendanceId) {
    existing.attendanceId = parentId;
  }

  if (!existing.attendance && record.attendance) {
    existing.attendance = record.attendance;
  }
}

export function groupAttendanceRecordsByEmployeeDay(records) {
  const groups = new Map();
  const aliasToCanonical = new Map();

  (records || []).forEach((record, index) => {
    const dateKey = getRecordDateKey(record) || `row-${index}`;
    const identities = [...getAttendanceEmployeeIdentityKeys(record)];
    if (identities.length === 0) identities.push(`unknown-${index}`);

    const existingKey = findGroupedRecordKey(aliasToCanonical, identities, dateKey);

    if (!existingKey) {
      const canonicalKey = `${identities[0]}|${dateKey}`;
      groups.set(canonicalKey, createGroupedAttendanceRecord(record));
      identities.forEach((identity) => {
        aliasToCanonical.set(`${identity}|${dateKey}`, canonicalKey);
      });
      return;
    }

    const existing = groups.get(existingKey);
    if (isAttendancePunchRow(existing) && !isAttendancePunchRow(record)) {
      const merged = createGroupedAttendanceRecord(record);
      mergeGroupedAttendanceRecord(merged, existing);
      groups.set(existingKey, merged);
    } else {
      mergeGroupedAttendanceRecord(existing, record);
    }

    identities.forEach((identity) => {
      aliasToCanonical.set(`${identity}|${dateKey}`, existingKey);
    });
  });

  return Array.from(groups.values());
}

async function resolveOwnAttendanceId(record) {
  const dateKey =
    getRecordDateKey(record) ||
    getTodayDateValue();

  const params = new URLSearchParams({ from: dateKey, to: dateKey });
  const response = await apiClient.get(`${API_ENDPOINTS.ATTENDANCE.ME}?${params}`);
  const list = unwrapAttendanceList(response);

  const parentIds = new Set();
  let dailyRecordId = '';

  for (const item of list) {
    const parentId = getAttendanceRecordId(item);
    if (parentId && parentId !== getRecordId(item)) {
      parentIds.add(parentId);
    }

    const isPunchRow =
      item.type ||
      item.punchType ||
      item.punchTime ||
      (item.checkInTime && !item.date && !item.checkOutTime);

    if (!isPunchRow) {
      const id = getRecordId(item);
      if (id) dailyRecordId = id;
    }
  }

  if (parentIds.size === 1) {
    return [...parentIds][0];
  }

  if (dailyRecordId) {
    return dailyRecordId;
  }

  for (const item of list) {
    if (item.attendanceId) {
      return String(item.attendanceId);
    }
  }

  return '';
}

export async function submitAttendanceRemarks({ record, remarks, isOwnRecord = false }) {
  const trimmed = String(remarks || '').trim();
  if (!trimmed) {
    throw new Error('Remarks are required');
  }

  const needsJustification = attendanceRequiresJustification(record);
  let attendanceId = getAttendanceRecordId(record) || getRecordId(record);

  if (isOwnRecord) {
    if (!needsJustification) {
      const recordDate = getRecordDateKey(record);
      const today = getTodayDateValue();

      if (!recordDate || recordDate === today) {
        await apiClient.put(API_ENDPOINTS.ATTENDANCE.ME_REMARKS, {
          remarks: trimmed,
        });
      } else if (attendanceId) {
        await apiClient.put(API_ENDPOINTS.ATTENDANCE.BY_ID(attendanceId), { remarks: trimmed });
      } else {
        const resolvedId = await resolveOwnAttendanceId(record);
        if (!resolvedId) {
          throw new Error('Attendance record not found');
        }
        await apiClient.put(API_ENDPOINTS.ATTENDANCE.BY_ID(resolvedId), { remarks: trimmed });
      }

      return { remarksOnly: true };
    }

    if (!attendanceId) {
      attendanceId = await resolveOwnAttendanceId(record);
    }
  } else if (!needsJustification) {
    const recordId = attendanceId || getRecordId(record);
    if (!recordId) {
      throw new Error('Attendance record not found');
    }
    return apiClient.put(API_ENDPOINTS.ATTENDANCE.BY_ID(recordId), { remarks: trimmed });
  } else if (!attendanceId) {
    attendanceId = getRecordId(record);
  }

  if (!attendanceId) {
    throw new Error('Attendance record ID not found. Please refresh the page and try again.');
  }

  if (needsJustification && isOwnRecord) {
    await apiClient.post(API_ENDPOINTS.ATTENDANCE.SUBMIT_JUSTIFICATION, {
      reason: trimmed,
      attendanceId,
    });

    return {
      submittedReason: trimmed,
      attendanceId,
      record: applySubmittedJustificationToRecord(record, trimmed),
    };
  }

  const existingStatus = getJustificationStatus(record);
  const shouldUpdateExistingJustification =
    needsJustification &&
    hasUserSubmittedJustification(record) &&
    existingStatus !== 'approved' &&
    existingStatus !== 'rejected';

  if (shouldUpdateExistingJustification) {
    return apiClient.put(API_ENDPOINTS.ATTENDANCE.REVIEW_JUSTIFICATION(attendanceId), {
      reason: trimmed,
    });
  }

  return apiClient.post(API_ENDPOINTS.ATTENDANCE.SUBMIT_JUSTIFICATION, {
    reason: trimmed,
    attendanceId,
  });
}

export async function updateJustificationStatus(attendanceId, { status, remarks = '' }) {
  const payload = { status };
  const trimmed = String(remarks || '').trim();
  if (trimmed) {
    payload.remarks = trimmed;
  }
  return apiClient.put(API_ENDPOINTS.ATTENDANCE.REVIEW_JUSTIFICATION(attendanceId), payload);
}

export async function fetchJustifications(filters = {}, viewMode = 'all') {
  const params = new URLSearchParams();
  if (filters.status) params.set('filter', filters.status);
  if (filters.departmentId) params.set('department', filters.departmentId);
  if (filters.date) params.set('date', filters.date);

  let list = [];

  // Prefer the pending alias when only pending items are requested.
  if (filters.status === 'pending' && !filters.departmentId && !filters.date) {
    try {
      const response = await apiClient.get(API_ENDPOINTS.ATTENDANCE.JUSTIFICATIONS_PENDING);
      list = unwrapJustificationList(response);
    } catch {
      // Fall through to the filtered list endpoint.
    }
  }

  if (list.length === 0) {
    const query = params.toString();
    const endpoint = query
      ? `${API_ENDPOINTS.ATTENDANCE.JUSTIFICATIONS}?${query}`
      : API_ENDPOINTS.ATTENDANCE.JUSTIFICATIONS;

    try {
      const response = await apiClient.get(endpoint);
      list = unwrapJustificationList(response);
    } catch (err) {
      if (viewMode !== 'my') throw err;
    }
  }

  if (viewMode === 'my') {
    try {
      const myRecords = await fetchJustificationsFromMyAttendance(filters);
      list = mergeJustificationLists(list, myRecords);
    } catch {
      // Keep list endpoint results when the personal fallback is unavailable.
    }
  }

  return list;
}

export function filterJustificationsByView(records, currentUser, viewMode) {
  if (viewMode !== 'my' || !currentUser) return records;

  return records.filter((record) => isOwnAttendanceRecord(record, currentUser));
}

export async function fetchMyAttendanceRecords(filters = {}) {
  const params = new URLSearchParams();
  if (filters.from || filters.to) {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  } else if (filters.monthYear) {
    const { from, to } = getMonthDateRange(filters.monthYear);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  } else if (filters.date) {
    params.set('from', filters.date);
    params.set('to', filters.date);
  }
  const query = params.toString();
  const endpoint = query
    ? `${API_ENDPOINTS.ATTENDANCE.ME}?${query}`
    : API_ENDPOINTS.ATTENDANCE.ME;
  const response = await apiClient.get(endpoint);
  return unwrapAttendanceList(response);
}

export async function fetchAllAttendanceRecords(filters = {}) {
  const params = new URLSearchParams();
  if (filters.from || filters.to) {
    if (filters.from && filters.from === filters.to) {
      params.set('date', filters.from);
    } else {
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
    }
  } else if (filters.date) {
    params.set('date', filters.date);
  }
  if (filters.departmentId) params.set('department', filters.departmentId);
  const query = params.toString();
  const endpoint = query
    ? `${API_ENDPOINTS.ATTENDANCE.LIST}?${query}`
    : API_ENDPOINTS.ATTENDANCE.LIST;
  const response = await apiClient.get(endpoint);
  return unwrapAttendanceList(response);
}

export async function fetchAttendanceForView(filters, currentUser, viewMode) {
  const useOwnOnly = viewMode === 'my' || shouldUseOwnAttendanceOnly(currentUser);

  if (useOwnOnly) {
    try {
      return await fetchMyAttendanceRecords(filters);
    } catch (err) {
      if (err?.status === 403 && viewMode === 'all') {
        return fetchMyAttendanceRecords(filters);
      }
      throw err;
    }
  }

  try {
    return await fetchAllAttendanceRecords(filters);
  } catch (err) {
    if (err?.status === 403) {
      return fetchMyAttendanceRecords(filters);
    }
    throw err;
  }
}

export function filterJustificationRecords(records, statusFilter = '') {
  const withJustification = records.filter((record) => hasUserSubmittedJustification(record));

  if (!statusFilter) return withJustification;

  return withJustification.filter(
    (record) => getJustificationStatus(record) === statusFilter,
  );
}

export function countJustificationsByStatus(records) {
  const counts = { pending: 0, approved: 0, rejected: 0 };

  records.forEach((record) => {
    const status = getJustificationStatus(record);
    if (status in counts) {
      counts[status] += 1;
    }
  });

  return counts;
}

export function formatJustificationLabel(status) {
  if (!status) return '—';
  return String(status)
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getDefaultMonthYear(date = new Date()) {
  const key = pktDateKey(date);
  return key ? key.slice(0, 7) : '';
}

export function getMonthDateRange(monthYear) {
  if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
    return { from: '', to: '' };
  }

  const [year, month] = monthYear.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export function getDayNameFromDateKey(dateKey) {
  const weekday = pktWeekdayName(dateKey);
  if (!weekday) return '—';
  return weekday.slice(0, 3);
}

export function isRecordLate(record) {
  if (!record) return false;
  if (record.isLate === true || record.late === true) return true;

  const status = getEffectiveAttendanceStatus(record);
  return status === 'late' || status.includes('late');
}

export const ATTENDANCE_LEAVE_TYPES = ['casual', 'sick', 'annual', 'unpaid'];

function createEmptyLeaveTypeCounts() {
  return ATTENDANCE_LEAVE_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {});
}

function parseDateKey(value) {
  return toLocalDateKey(value);
}

function countDaysBetweenInclusive(startKey, endKey) {
  const [startYear, startMonth, startDay] = startKey.split('-').map(Number);
  const [endYear, endMonth, endDay] = endKey.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
}

export function getRecordLeaveType(record) {
  const direct =
    record?.leaveType ||
    record?.leave?.leaveType ||
    record?.leave?.type ||
    record?.leaveTypeUsed;

  if (direct) {
    const normalized = String(direct).toLowerCase();
    return ATTENDANCE_LEAVE_TYPES.includes(normalized) ? normalized : '';
  }

  const status = getApiAttendanceStatus(record);
  return ATTENDANCE_LEAVE_TYPES.find((type) => status.includes(type)) || '';
}

export function isOnLeaveRecord(record) {
  if (!record) return false;

  if (getRecordLeaveType(record)) return true;

  const status = getApiAttendanceStatus(record);
  return status === 'leave' || status.includes('on-leave') || status.includes('half-day-leave');
}

export function isMissingAttendanceRecord(record, options = {}) {
  return resolveAttendanceStatus(record, options) === 'missing';
}

function pickPrimaryAssignment(assignments) {
  const active = (assignments || []).filter((item) => item && item.isActive !== false);
  if (!active.length) return null;
  return active.find((item) => item.isPrimary) || active[0];
}

function getRefId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return getRecordId(value);
  return String(value).trim();
}

export function isUsableWorkSchedule(workSchedule) {
  if (!workSchedule || typeof workSchedule !== 'object') return false;

  return WEEK_DAYS.some((day) => {
    const config = getWorkScheduleForDateKey(workSchedule, '', day);
    return Boolean(
      config &&
        !config.isOff &&
        config.checkInMinutes != null &&
        config.checkOutMinutes != null,
    );
  });
}

export function pickWorkSchedule(...candidates) {
  return candidates.find((value) => isUsableWorkSchedule(value)) || null;
}

function getRecordWorkSchedule(record) {
  return pickWorkSchedule(
    record?.workSchedule,
    record?.assignment?.workSchedule,
    record?.employee?.assignment?.workSchedule,
    record?.employee?.workSchedule,
  );
}

function getRecordLeverageTime(record, options = {}) {
  // Live department / schedule context wins over a stale snapshot on the
  // attendance row, so newly saved department grace is actually counted.
  return (
    parseLeverageTime(options.leverageTime) ||
    parseLeverageTime(options.department) ||
    parseLeverageTime(options.assignment?.department) ||
    parseLeverageTime(record?.department) ||
    parseLeverageTime(record?.assignment?.department) ||
    parseLeverageTime(record?.employee?.department) ||
    parseLeverageTime(record?.assignment?.leverageTime) ||
    parseLeverageTime(record?.leverageTime) ||
    null
  );
}

function firstHhmm(candidates) {
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const raw = String(value).trim();
    const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampm) {
      let hours = Number(ampm[1]);
      const minutes = ampm[2];
      const period = ampm[3].toUpperCase();
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) continue;
    return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
  }
  return '';
}

function minutesToHhmm(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '';
  const normalized = ((Number(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getRecordExpectedTimes(record, options = {}) {
  const dateKey = getRecordDateKey(record) || options.dateKey || '';
  const dayName = String(record?.dayName || options.dayName || pktWeekdayName(dateKey) || '').trim();
  const workSchedule = pickWorkSchedule(getRecordWorkSchedule(record), options.workSchedule);
  const daySchedule = getWorkScheduleForDateKey(workSchedule, dateKey, dayName);
  const scheduleIn = minutesToHhmm(daySchedule?.checkInMinutes);
  const scheduleOut = minutesToHhmm(daySchedule?.checkOutMinutes);

  const expectedCheckInTime = firstHhmm([
    scheduleIn,
    record?.expectedCheckInTime,
    record?.expectedCheckIn,
    record?.expectedCheckin,
    record?.scheduledCheckIn,
    record?.shiftStart,
    record?.shiftStartTime,
    record?.assignment?.checkInTime,
    record?.assignment?.scheduledCheckIn,
    options.expectedCheckInTime,
  ]);
  const expectedCheckOutTime = firstHhmm([
    scheduleOut,
    record?.expectedCheckOutTime,
    record?.expectedCheckOut,
    record?.expectedCheckout,
    record?.scheduledCheckOut,
    record?.shiftEnd,
    record?.shiftEndTime,
    record?.assignment?.checkOutTime,
    record?.assignment?.scheduledCheckOut,
    options.expectedCheckOutTime,
  ]);

  const leverageTime = getRecordLeverageTime(record, options);
  const rawCheckInTime = expectedCheckInTime || '09:00';
  const rawCheckOutTime = expectedCheckOutTime || '17:00';
  const adjusted = applyLeverageToExpectedTimes(rawCheckInTime, rawCheckOutTime, leverageTime);

  return {
    expectedCheckInTime: adjusted.expectedCheckInTime,
    expectedCheckOutTime: adjusted.expectedCheckOutTime,
    rawExpectedCheckInTime: rawCheckInTime,
    rawExpectedCheckOutTime: rawCheckOutTime,
    leverageTime,
  };
}

/**
 * Use the backend status as the source of truth. If it is missing, derive a
 * temporary status from the available punch and shift fields.
 */
export function resolveAttendanceStatus(record, options = {}) {
  if (!record) return '';

  const expected = getRecordExpectedTimes(record, options);
  return resolveAttendanceStatusFromFields({
    status: record.status,
    attendanceStatus: record.attendanceStatus,
    checkIn: getRecordCheckInTime(record),
    checkOut: getRecordCheckOutTime(record),
    expectedCheckInTime: expected.rawExpectedCheckInTime,
    expectedCheckOutTime: expected.rawExpectedCheckOutTime,
    leverageTime: expected.leverageTime || getRecordLeverageTime(record, options),
  });
}

export function getEffectiveAttendanceStatus(record, options = {}) {
  return resolveAttendanceStatus(record, options);
}

export function isAttendanceStatusRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (getRecordCheckInTime(record) || getRecordCheckOutTime(record)) return true;

  const apiStatus = getApiAttendanceStatus(record);
  if (!apiStatus) return false;

  return Boolean(
    record.date ||
      record.attendanceDate ||
      record.attendanceStatus ||
      record.dayName ||
      record.checkIn ||
      record.checkOut ||
      record.checkInTime ||
      record.checkOutTime ||
      record.type ||
      record.punchType,
  );
}

export function applyResolvedAttendanceStatus(record, options = {}) {
  if (!isAttendanceStatusRecord(record)) return record;

  const status = getEffectiveAttendanceStatus(record, {
    today: options.today || getTodayDateValue(),
    ...options,
  });
  if (!status) return record;

  const next = { ...record, status };
  if (Object.prototype.hasOwnProperty.call(record, 'attendanceStatus')) {
    next.attendanceStatus = status;
  }
  return next;
}

export function attendanceStatusMatchesFilter(record, statusFilter, options = {}) {
  if (!statusFilter) return true;

  const resolved = getEffectiveAttendanceStatus(record, {
    today: options.today || getTodayDateValue(),
    ...options,
  });
  const wanted = canonicalizeAttendanceStatus(statusFilter);

  switch (wanted) {
    case 'missing':
      return resolved === 'missing';
    case 'present':
      return resolved === 'present' || resolved === 'early-departure';
    case 'late':
      return resolved === 'late' || resolved === 'late-early-departure';
    case 'early-departure':
      return resolved === 'early-departure' || resolved === 'late-early-departure';
    case 'late-early-departure':
      return resolved === 'late-early-departure';
    case 'half-day':
      return resolved === 'half-day';
    case 'pending':
    case 'still-working':
    case 'stillworking':
      return (
        resolved === 'pending' ||
        resolved === 'still-working' ||
        isOpenCheckInRecord(record, options.today || getTodayDateValue())
      );
    case 'absent':
      return resolved === 'absent' || resolved.includes('absent');
    case 'leave':
      return resolved === 'leave';
    case 'checked-out':
    case 'checkedout':
      return Boolean(getRecordCheckInTime(record)) && Boolean(getRecordCheckOutTime(record));
    default:
      return resolved === wanted;
  }
}

export async function prepareAttendanceRecordsForStatus(records, context = {}) {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return list;
  if (!list.some(isAttendanceStatusRecord)) return list;

  let assignments = context.assignments;
  if (assignments == null) {
    try {
      assignments = await fetchAllAssignments();
    } catch {
      assignments = [];
    }
  }

  const grouped = groupAttendanceRecordsByEmployeeDay(list);
  const hydrated = await hydrateAttendanceRecords(grouped, {
    assignments,
    departments: context.departments || [],
    fallbackContext: context.fallbackContext || {},
  });

  return hydrated.map((record) =>
    applyResolvedAttendanceStatus(record, {
      today: getTodayDateValue(),
      ...(context.fallbackContext || {}),
      ...context,
    }),
  );
}

export function mergeScheduleContextOntoRecords(records, context = {}) {
  return (records || []).map((record) => ({
    ...record,
    workSchedule: pickWorkSchedule(getRecordWorkSchedule(record), context.workSchedule),
    leverageTime:
      parseLeverageTime(context.leverageTime) ||
      getRecordLeverageTime(record, context) ||
      parseLeverageTime(record?.leverageTime) ||
      getRecordLeverageTime(record) ||
      null,
  }));
}

export async function hydrateAttendanceRecords(records, {
  assignments = [],
  departments = [],
  fallbackContext = {},
} = {}) {
  let list = attachScheduleContextToRecords(records, assignments, departments);
  const seedDepartments = [
    ...departments,
    ...(assignments || []).map((item) => item?.department),
    fallbackContext.assignment?.department,
    fallbackContext.department,
  ].filter(Boolean);
  const departmentIds = [
    ...list.map((record) => getRecordDepartmentRefId(record)),
    fallbackContext.departmentId,
  ].filter(Boolean);
  const leverageById = await fetchDepartmentLeverageMap(departmentIds, seedDepartments);
  list = applyDepartmentLeverageToRecords(
    list,
    leverageById,
    fallbackContext.departmentId,
    fallbackContext.leverageTime,
  );
  list = mergeScheduleContextOntoRecords(list, fallbackContext);
  return list.map((record) =>
    applyResolvedAttendanceStatus(record, {
      ...fallbackContext,
      today: getTodayDateValue(),
    }),
  );
}

function unwrapAssignmentRecords(response) {
  const list = unwrapList(response);
  if (list.length > 0) return list;

  const data = unwrapData(response);
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.assignments)) return data.assignments;
  if (data.assignment && typeof data.assignment === 'object') return [data.assignment];
  if (data.workSchedule) return [data];
  return [];
}

function assignmentMatchesCurrentUser(assignment, currentUser) {
  const userIds = collectUserIdentityIds(currentUser);
  if (userIds.size === 0) return false;
  const employee = assignment?.employee;
  const keys = [
    getRecordId(employee),
    typeof employee === 'object' ? employee?.employeeId : employee,
    typeof employee === 'object' ? employee?.email : '',
    assignment?.employeeId,
  ]
    .filter(Boolean)
    .map(String);
  return keys.some((key) => userIds.has(key));
}

function isAssignmentEmployeeLookupId(value) {
  const str = String(value || '').trim();
  if (!str) return false;
  return isMongoId(str) || /^EMP/i.test(str);
}

function getMyAssignmentLookupIds(currentUser) {
  return [...collectUserIdentityIds(currentUser)]
    .filter((id) => isAssignmentEmployeeLookupId(id))
    .sort((left, right) => Number(isMongoId(right)) - Number(isMongoId(left)));
}

function getDepartmentNameKey(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && !isMongoId(value)) {
    const normalized = value.trim().toLowerCase();
    return !normalized || normalized === '—' ? '' : normalized;
  }
  if (typeof value === 'object') {
    const name = getDisplayName(value);
    const normalized = String(name || '').trim().toLowerCase();
    return !normalized || normalized === '—' ? '' : normalized;
  }
  return '';
}

async function fetchOwnEmployeeRecord(currentUser) {
  const nested = typeof currentUser?.employee === 'object' ? currentUser.employee : null;
  const lookupIds = getMyAssignmentLookupIds({ ...currentUser, employee: nested || currentUser?.employee });

  for (const id of lookupIds) {
    try {
      const employee = unwrapData(
        await apiClient.get(API_ENDPOINTS.EMPLOYEES.BY_ID(encodeURIComponent(id))),
      );
      if (employee && typeof employee === 'object') return employee;
    } catch {
      /* try next identity */
    }
  }

  return nested;
}

export async function fetchMyScheduleContext(currentUser) {
  const ownEmployee = await fetchOwnEmployeeRecord(currentUser);
  const nestedAssignment =
    currentUser?.assignment ||
    currentUser?.primaryAssignment ||
    pickPrimaryAssignment(currentUser?.assignments) ||
    pickPrimaryAssignment(ownEmployee?.assignments) ||
    ownEmployee?.assignment ||
    ownEmployee?.primaryAssignment;

  let assignment = nestedAssignment && typeof nestedAssignment === 'object' ? nestedAssignment : null;
  let workSchedule =
    assignment?.workSchedule ||
    currentUser?.workSchedule ||
    currentUser?.employee?.workSchedule ||
    ownEmployee?.workSchedule ||
    null;

  const tryAssignments = (records) => {
    const primary = pickPrimaryAssignment(records);
    if (!primary) return false;
    assignment = primary;
    if (primary.workSchedule) workSchedule = primary.workSchedule;
    return true;
  };

  const lookupIds = [
    ...getMyAssignmentLookupIds(currentUser),
    ...getMyAssignmentLookupIds(ownEmployee),
  ].filter((id, index, all) => all.indexOf(id) === index);

  for (const id of lookupIds) {
    try {
      const response = await apiClient.get(
        API_ENDPOINTS.ASSIGNMENTS.BY_EMPLOYEE(encodeURIComponent(id)),
      );
      if (tryAssignments(unwrapAssignmentRecords(response))) break;
    } catch {
      /* try next identity */
    }
  }

  if (!assignment || !workSchedule) {
    try {
      const response = await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.LIST);
      const mine = unwrapAssignmentRecords(response).filter((item) =>
        assignmentMatchesCurrentUser(item, currentUser),
      );
      tryAssignments(mine);
    } catch {
      /* optional fallback */
    }
  }

  if (assignment && getRecordId(assignment)) {
    try {
      const fullAssignment = unwrapData(
        await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BY_ID(getRecordId(assignment))),
      );
      if (fullAssignment && typeof fullAssignment === 'object') {
        assignment = { ...assignment, ...fullAssignment };
        if (isUsableWorkSchedule(fullAssignment.workSchedule)) {
          workSchedule = fullAssignment.workSchedule;
        }
      }
    } catch {
      /* populated department/leverage is optional */
    }
  }

  const departmentRef =
    assignment?.department ||
    ownEmployee?.department ||
    currentUser?.department ||
    currentUser?.employee?.department;
  const departmentId = getRefId(departmentRef);
  const departmentName = getDepartmentNameKey(departmentRef);

  let leverageTime =
    parseLeverageTime(assignment?.department) ||
    parseLeverageTime(assignment?.leverageTime) ||
    parseLeverageTime(ownEmployee?.department) ||
    parseLeverageTime(currentUser?.department) ||
    parseLeverageTime(currentUser?.employee?.department) ||
    null;

  const leverageById = await fetchDepartmentLeverageMap(departmentId ? [departmentId] : [], [
    assignment?.department,
    ownEmployee?.department,
    currentUser?.department,
    currentUser?.employee?.department,
  ]);
  leverageTime =
    (departmentId && leverageById.get(String(departmentId))) ||
    (departmentName && leverageById.get(departmentName)) ||
    leverageTime;

  return { workSchedule, leverageTime, assignment, departmentId };
}

const assignmentsCache = getCachedResource('assignments', () =>
  createCachedFetcher(
    async () => {
      const response = await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.LIST);
      return unwrapAssignmentRecords(response);
    },
    { ttlMs: 5 * 60 * 1000 },
  ),
);

const departmentsListCache = getCachedResource('departments-list', () =>
  createCachedFetcher(
    async () => unwrapList(await apiClient.get(API_ENDPOINTS.DEPARTMENTS.LIST)),
    { ttlMs: 5 * 60 * 1000 },
  ),
);

const employeesListCache = getCachedResource('employees-list', () =>
  createCachedFetcher(
    async () => unwrapList(await apiClient.get(API_ENDPOINTS.EMPLOYEES.LIST)),
    { ttlMs: 3 * 60 * 1000 },
  ),
);

export function invalidateAttendanceResourceCache() {
  assignmentsCache.invalidate();
  departmentsListCache.invalidate();
  employeesListCache.invalidate();
}

export async function fetchAllAssignments(options = {}) {
  return assignmentsCache.load(options.force === true);
}

export async function fetchDepartmentsListCached(force = false) {
  return departmentsListCache.load(force);
}

export async function fetchEmployeesListCached(force = false) {
  return employeesListCache.load(force);
}

export function getRecordDepartmentRefId(record) {
  return (
    getRefId(record?.department) ||
    getRefId(record?.assignment?.department) ||
    getRefId(record?.employee?.department) ||
    getRefId(record?.departmentId) ||
    ''
  );
}

function getRecordDepartmentNameKey(record) {
  const department =
    record?.department ||
    record?.assignment?.department ||
    record?.employee?.department;
  const name =
    (department && typeof department === 'object' ? getDisplayName(department) : '') ||
    record?.departmentName ||
    (typeof department === 'string' && !isMongoId(department) ? department : '') ||
    '';
  const normalized = String(name).trim().toLowerCase();
  return !normalized || normalized === '—' ? '' : normalized;
}

/**
 * Department leverage minutes keyed by department id and lowercase name.
 * Seeds from already-loaded department objects first so employee portal
 * rows without a department id can still inherit grace from assignment.
 */
export async function fetchDepartmentLeverageMap(departmentIds = [], seedDepartments = []) {
  const leverageById = new Map();
  const ids = [...new Set((departmentIds || []).map((id) => getRefId(id)).filter(Boolean))];

  const remember = (department) => {
    const leverage = parseLeverageTime(department);
    if (!leverage) return;
    const id = getRefId(department);
    if (id) leverageById.set(String(id), leverage);
    const name = getDisplayName(department);
    if (name && name !== '—') leverageById.set(String(name).trim().toLowerCase(), leverage);
  };

  (seedDepartments || []).forEach(remember);

  try {
    (await departmentsListCache.load()).forEach(remember);
  } catch {
    /* employees may not read the department list; fall back to seed + per-id lookups */
  }

  await Promise.all(
    ids
      .filter((id) => isMongoId(id) && !leverageById.has(String(id)))
      .map(async (id) => {
        try {
          remember(unwrapData(await apiClient.get(API_ENDPOINTS.DEPARTMENTS.BY_ID(id))));
        } catch {
          /* leverage is optional */
        }
      }),
  );

  return leverageById;
}

export function applyDepartmentLeverageToRecords(
  records,
  leverageById,
  fallbackDepartmentId = '',
  fallbackLeverage = null,
) {
  const fallback =
    (fallbackDepartmentId && leverageById?.get(String(fallbackDepartmentId))) ||
    parseLeverageTime(fallbackLeverage) ||
    null;

  if ((!leverageById || leverageById.size === 0) && !fallback) return records || [];

  return (records || []).map((record) => {
    const leverage =
      leverageById?.get(String(getRecordDepartmentRefId(record))) ||
      leverageById?.get(getRecordDepartmentNameKey(record)) ||
      fallback ||
      parseLeverageTime(record?.leverageTime);
    return leverage ? { ...record, leverageTime: leverage } : record;
  });
}

function getAssignmentEmployeeKeys(assignment) {
  return [
    ...getAttendanceEmployeeIdentityKeys({
      employee: assignment?.employee,
      employeeId: assignment?.employeeId,
    }),
  ];
}

export function attachScheduleContextToRecords(records, assignments = [], departments = []) {
  const assignmentByEmployee = new Map();

  (assignments || []).forEach((assignment) => {
    if (!assignment || assignment.isActive === false) return;
    const keys = getAssignmentEmployeeKeys(assignment);
    keys.forEach((key) => {
      const existing = assignmentByEmployee.get(key);
      if (!existing || (assignment.isPrimary && !existing.isPrimary)) {
        assignmentByEmployee.set(key, assignment);
      }
    });
  });

  const departmentById = new Map();
  (departments || []).forEach((department) => {
    const id = getRecordId(department);
    if (id) departmentById.set(String(id), department);
  });

  return (records || []).map((record) => {
    const identities = [...getAttendanceEmployeeIdentityKeys(record)];
    const assignment =
      identities.map((id) => assignmentByEmployee.get(String(id))).find(Boolean) || null;

    const departmentRef =
      record.department ||
      assignment?.department ||
      record.employee?.department ||
      record.assignment?.department;
    const departmentId = getRefId(departmentRef);
    const departmentFromList = departmentId ? departmentById.get(String(departmentId)) : null;
    const nestedDepartment = departmentRef && typeof departmentRef === 'object' ? departmentRef : null;
    const department = departmentFromList || nestedDepartment;

    const next = {
      ...record,
      workSchedule: pickWorkSchedule(
        assignment?.workSchedule,
        getRecordWorkSchedule(record),
      ),
      assignment: record.assignment || assignment,
      department: department || record.department,
    };

    return {
      ...next,
      leverageTime:
        getRecordLeverageTime(next) ||
        parseLeverageTime(departmentFromList) ||
        parseLeverageTime(nestedDepartment) ||
        null,
    };
  });
}

export function countLeaveTypesFromRecords(records) {
  const counts = createEmptyLeaveTypeCounts();

  records.forEach((record) => {
    const leaveType = getRecordLeaveType(record);
    if (leaveType) {
      counts[leaveType] += 1;
      return;
    }

    if (isOnLeaveRecord(record)) {
      counts.casual += 1;
    }
  });

  return counts;
}

export function computeApprovedLeaveDaysByType(leaves, monthYear) {
  if (!monthYear) return createEmptyLeaveTypeCounts();
  const { from, to } = getMonthDateRange(monthYear);
  return computeApprovedLeaveDaysInRange(leaves, from, to);
}

export function computeApprovedLeaveDaysInRange(leaves, rangeFrom, rangeTo) {
  const counts = createEmptyLeaveTypeCounts();
  if (!rangeFrom || !rangeTo) return counts;

  const monthFrom = rangeFrom;
  const monthTo = rangeTo;

  (leaves || []).forEach((leave) => {
    const status = String(leave?.status || 'approved').toLowerCase();
    if (status !== 'approved') return;

    const leaveType = String(leave?.leaveType || '').toLowerCase();
    if (!ATTENDANCE_LEAVE_TYPES.includes(leaveType)) return;

    const startKey = parseDateKey(leave.startDate);
    const endKey = parseDateKey(leave.endDate);
    if (!startKey || !endKey) return;

    const overlapStart = startKey > monthFrom ? startKey : monthFrom;
    const overlapEnd = endKey < monthTo ? endKey : monthTo;
    if (overlapStart > overlapEnd) return;

    counts[leaveType] += countDaysBetweenInclusive(overlapStart, overlapEnd);
  });

  return counts;
}

function mergeLeaveTypeCounts(primaryCounts, fallbackCounts) {
  return ATTENDANCE_LEAVE_TYPES.reduce((merged, type) => {
    merged[type] = Math.max(primaryCounts[type] || 0, fallbackCounts[type] || 0);
    return merged;
  }, createEmptyLeaveTypeCounts());
}

function getRecordWorkMinutes(record) {
  const checkIn =
    record?.checkInTime ||
    record?.check_in_time ||
    record?.checkIn ||
    record?.check_in;
  const checkOut =
    record?.checkOutTime ||
    record?.check_out_time ||
    record?.checkOut ||
    record?.check_out;

  const duration = getWorkingDuration(checkIn, checkOut, getRecordDateKey(record) || '');
  return duration?.totalMinutes || 0;
}

export function computeAttendanceStatusCounts(records, options = {}) {
  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    missing: 0,
    pending: 0,
    stillWorking: 0,
    leave: 0,
  };
  const scheduleOptions = { ...options, today: options.today || getTodayDateValue() };

  (records || []).forEach((record) => {
    const status = resolveAttendanceStatus(record, scheduleOptions);

    if (isOnLeaveRecord(record) || status === 'leave') {
      counts.leave += 1;
      return;
    }

    // "Pending" = still in office (checked in, no check-out). Such a row is ALSO counted
    // as present/late below, because its arrival status is known at check-in.
    if (
      isOpenCheckInRecord(record, scheduleOptions.today) ||
      status === 'pending' ||
      status === 'still-working' ||
      status === 'still_working'
    ) {
      counts.pending += 1;
      counts.stillWorking += 1;
    }

    if (status === 'missing') counts.missing += 1;
    else if (status === 'absent' || status.includes('absent')) counts.absent += 1;
    else if (status === 'late' || status === 'late-early-departure') counts.late += 1;
    else if (
      status === 'present' ||
      status.includes('checked-out') ||
      status.includes('checked_out') ||
      status === 'early-departure'
    ) {
      counts.present += 1;
    }
  });

  return counts;
}

export function computeMonthAttendanceSummary(records, options = {}) {
  const {
    approvedLeaves = [],
    monthYear = '',
    from = '',
    to = '',
    leaveApiAvailable = false,
    workSchedule = null,
    leverageTime = null,
  } = options;
  // An explicit from/to wins; a bare month is the same thing as its first..last day.
  const range = from && to ? { from, to } : getMonthDateRange(monthYear);
  const monthRecords =
    range.from && range.to
      ? (records || []).filter((record) => {
          const dateKey = getRecordDateKey(record);
          return dateKey && dateKey >= range.from && dateKey <= range.to;
        })
      : records || [];

  let present = 0;
  let late = 0;
  let absent = 0;
  let missing = 0;
  let pending = 0;
  let totalMinutes = 0;
  const scheduleOptions = { workSchedule, leverageTime, today: getTodayDateValue() };

  monthRecords.forEach((record) => {
    const status = resolveAttendanceStatus(record, scheduleOptions);

    if (isOnLeaveRecord(record)) {
      // Leave days are counted separately by leave type.
    } else if (status === 'missing') {
      missing += 1;
    } else if (status === 'absent' || status.includes('absent')) {
      absent += 1;
    } else if (status === 'late' || status === 'late-early-departure') {
      late += 1;
    } else if (status === 'pending' || status.includes('still-working') || status.includes('still_working')) {
      // Check-in only: not a completed present day.
    } else if (
      status === 'present' ||
      status.includes('checked-out') ||
      status.includes('checked_out') ||
      status === 'early-departure'
    ) {
      present += 1;
    }

    if (getJustificationStatus(record) === 'pending') {
      pending += 1;
    }

    totalMinutes += getRecordWorkMinutes(record);
  });

  const leaveFromRecords = countLeaveTypesFromRecords(monthRecords);
  const leaveFromApi = computeApprovedLeaveDaysInRange(approvedLeaves, range.from, range.to);
  const leaveCounts = leaveApiAvailable ? leaveFromApi : mergeLeaveTypeCounts(leaveFromApi, leaveFromRecords);
  const calendarDays =
    range.from && range.to ? countDaysBetweenInclusive(range.from, range.to) : 0;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    totalDays: calendarDays || monthRecords.length,
    present,
    late,
    absent,
    missing,
    pending,
    casualLeave: leaveCounts.casual,
    annualLeave: leaveCounts.annual,
    sickLeave: leaveCounts.sick,
    unpaidLeave: leaveCounts.unpaid,
    totalMinutes,
    totalHoursLabel: totalMinutes > 0 ? `${hours}h ${minutes}m` : '0h 0m',
  };
}

export function sortAttendanceByDateDesc(records) {
  return [...records].sort((a, b) => {
    const dateA = getRecordDateKey(a) || '';
    const dateB = getRecordDateKey(b) || '';
    return dateB.localeCompare(dateA);
  });
}

function getJustificationAttendanceId(record) {
  return (
    record?.attendanceId ||
    getRecordId(record?.attendance) ||
    (typeof record?.attendance === 'string' ? record.attendance : '') ||
    ''
  );
}

export function mergeJustificationsWithAttendance(records, justifications) {
  if (!Array.isArray(justifications) || justifications.length === 0) {
    return records;
  }

  const byAttendanceId = new Map();
  const byDateEmployee = new Map();
  const byDateOnly = new Map();

  justifications.forEach((justification) => {
    const attendanceId = getJustificationAttendanceId(justification);
    if (attendanceId) {
      byAttendanceId.set(String(attendanceId), justification);
    }

    const dateKey = getRecordDateKey(justification);
    const employeeKey = getEmployeeKey(justification);
    if (dateKey && employeeKey) {
      byDateEmployee.set(`${employeeKey}|${dateKey}`, justification);
    }
    if (dateKey) {
      byDateOnly.set(dateKey, justification);
    }
  });

  return records.map((record) => {
    const attendanceId = getAttendanceRecordId(record) || getRecordId(record);
    const dateKey = getRecordDateKey(record);
    const employeeKey = getEmployeeKey(record);

    const match =
      (attendanceId && byAttendanceId.get(String(attendanceId))) ||
      (dateKey && employeeKey && byDateEmployee.get(`${employeeKey}|${dateKey}`)) ||
      (dateKey && byDateOnly.get(dateKey));

    if (!match) return record;

    const mergedReason = getJustificationReason({ ...record, ...match });
    const mergedStatus =
      getExplicitJustificationStatus(match) ||
      getExplicitJustificationStatus(record) ||
      record.justificationStatus;

    return {
      ...record,
      justification: {
        ...(typeof record.justification === 'object' && record.justification !== null
          ? record.justification
          : {}),
        ...(typeof match.justification === 'object' && match.justification !== null
          ? match.justification
          : {}),
        ...(mergedReason
          ? {
              reason: mergedReason,
              status: mergedStatus || match.justification?.status || record.justification?.status || 'pending',
            }
          : {}),
      },
      justificationStatus: mergedStatus || record.justificationStatus,
      reason: mergedReason || record.reason,
      remarks: record.remarks || getRecordRemarks(match),
      rejectionReason: match.rejectionReason || match.rejectReason || record.rejectionReason,
      attendanceId: record.attendanceId || getJustificationAttendanceId(match) || record.attendanceId,
    };
  });
}
