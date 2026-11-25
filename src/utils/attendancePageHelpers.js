import apiClient from '../api/apiClient';
import { API_ENDPOINTS } from '../api/apiConfig';
import {
  employeeMatchesSearch,
  getDisplayName,
  getRecordId,
  unwrapData,
  unwrapList,
} from './apiHelpers';
import {
  attendanceStatusMatchesFilter,
  fetchMyAttendanceRecords,
  formatAttendanceStatusLabel,
  getEffectiveAttendanceStatus,
  getRecordCheckInTime,
  getRecordCheckOutTime,
  getRecordDateKey,
  getTodayDateValue,
  getWorkingDuration,
  isSuperAdminUser,
  shouldUseOwnAttendanceOnly,
  unwrapAttendanceList,
} from './attendanceHelpers';
import { getAttendanceStatusBadgeClass } from './attendanceStatus';
import { listDateKeys } from './periodHelpers';

const MAX_MISSING_RANGE_DAYS = 31;

export function buildAttendanceQuery(filters, { includeStatus = true } = {}) {
  const params = new URLSearchParams();
  if (filters.from && filters.from === filters.to) {
    params.set('date', filters.from);
  } else {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  if (filters.departmentId) params.set('department', filters.departmentId);
  if (includeStatus && filters.status && filters.status !== 'missing') {
    params.set('status', filters.status);
  }
  return params.toString();
}

function durationValueToMinutes(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const hoursFields = new Set(['workingHours', 'working_hours', 'totalWorkingHours', 'durationHours']);
  if (hoursFields.has(fieldName)) return Math.round(value * 60);
  if (value >= 60) return Math.round(value);
  return Math.round(value * 60);
}

export function getRecordWorkingHours(record) {
  const checkIn = getRecordCheckInTime(record);
  const checkOut = getRecordCheckOutTime(record);
  const dateKey = getRecordDateKey(record) || '';
  const durationFields = [
    ['workingHours', record.workingHours],
    ['working_hours', record.working_hours],
    ['totalWorkingHours', record.totalWorkingHours],
    ['durationHours', record.durationHours],
    ['duration', record.duration],
  ];
  for (const [fieldName, direct] of durationFields) {
    if (direct == null || direct === '') continue;
    if (typeof direct === 'number') {
      const totalMinutes = durationValueToMinutes(direct, fieldName);
      if (totalMinutes == null) continue;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      if (minutes === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min`;
    }
    return String(direct);
  }
  const duration = getWorkingDuration(checkIn, checkOut, dateKey);
  if (!duration) return '—';
  const { hours, minutes } = duration;
  if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (minutes === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min`;
}

export function getRecordWorkingHoursCompact(record) {
  const label = getRecordWorkingHours(record);
  if (!label || label === '—') return '—';
  const checkIn = getRecordCheckInTime(record);
  const checkOut = getRecordCheckOutTime(record);
  const duration = getWorkingDuration(checkIn, checkOut, getRecordDateKey(record) || '');
  if (!duration) return label;
  const { hours, minutes } = duration;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function getRecordUserId(record) {
  const employee = record.employee;
  if (employee && typeof employee === 'object') {
    return employee.employeeId || getRecordId(employee) || '—';
  }
  return record.employeeId || '—';
}

export function getRecordAttendanceDate(record) {
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

function getRecordStatusLabel(record) {
  const status = String(record.status || record.attendanceStatus || '').trim();
  if (status) {
    return status
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }
  const type = String(record.type || record.punchType || '').toLowerCase();
  if (type.includes('checkout') || type.includes('check out')) return 'Checked Out';
  if (type.includes('checkin') || type.includes('check in')) return 'Present';
  return '—';
}

export function getAttendanceStatusDisplay(record, options = {}) {
  const status = getEffectiveAttendanceStatus(record, {
    today: getTodayDateValue(),
    ...options,
  });
  const statusLabel =
    formatAttendanceStatusLabel(status, record?.leaveType) || getRecordStatusLabel(record);
  if (statusLabel && statusLabel !== '—') {
    return {
      status,
      label: statusLabel,
      className: getAttendanceStatusBadgeClass(status),
    };
  }
  return { status: status || '', label: '—', className: 'attendance-status-default' };
}

export function getRecordDisplayStatus(record, options = {}) {
  const display = getAttendanceStatusDisplay(record, options);
  return { label: display.label, className: display.className };
}

export function getRecordDepartmentId(record) {
  const department = record.department || record.assignment?.department || record.employee?.department;
  if (typeof department === 'object') return getRecordId(department);
  if (record.departmentId) return String(record.departmentId);
  return department ? String(department) : '';
}

export function getRecordDepartmentName(record) {
  const department = record.department || record.assignment?.department || record.employee?.department;
  if (department) return getDisplayName(department);
  return record.departmentName || '—';
}

export function applyClientFilters(records, filters, { scheduleContext = {}, employees = [] } = {}) {
  return records.filter(record => {
    const recordDate = getRecordDateKey(record);
    if (recordDate && filters.from && recordDate < filters.from) return false;
    if (recordDate && filters.to && recordDate > filters.to) return false;
    if (filters.departmentId && getRecordDepartmentId(record) !== String(filters.departmentId)) {
      return false;
    }
  if (filters.userId?.trim()) {
      const search = filters.userId.trim().toLowerCase();
      const recordCodes = [record.userId, record.employeeId, record.employeeName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (
        !employeeMatchesSearch(record.employee, search, employees) &&
        !recordCodes.includes(search)
      ) {
        return false;
      }
    }
    if (
      !attendanceStatusMatchesFilter(record, filters.status, {
        today: getTodayDateValue(),
        ...scheduleContext,
      })
    ) {
      return false;
    }
    return true;
  });
}

export function restrictDepartmentEmployeeIds(departmentIds, visibleEmployees) {
  if (!departmentIds?.size) return new Set();
  const allowed = new Set();
  visibleEmployees.forEach(employee => {
    const recordId = getRecordId(employee);
    if (recordId && departmentIds.has(recordId)) allowed.add(recordId);
    const code = employee?.employeeId ? String(employee.employeeId) : '';
    if (code && departmentIds.has(code)) allowed.add(code);
  });
  return allowed;
}

export function findEmployeesForFilter(allEmployees, userIdSearch, departmentEmployeeIds = null) {
  let filtered = allEmployees;
  if (departmentEmployeeIds?.size) {
    filtered = filtered.filter(employee => {
      const recordId = getRecordId(employee);
      const code = employee?.employeeId ? String(employee.employeeId) : '';
      return (recordId && departmentEmployeeIds.has(recordId)) || (code && departmentEmployeeIds.has(code));
    });
  }
  if (!userIdSearch?.trim()) return filtered;
  const search = userIdSearch.trim().toLowerCase();
  return filtered.filter(
    emp => String(getRecordId(emp)).toLowerCase() === search || employeeMatchesSearch(emp, search),
  );
}

export async function fetchDepartmentEmployeeIds(departmentId) {
  if (!departmentId) return new Set();
  try {
    const response = await apiClient.get(API_ENDPOINTS.DEPARTMENTS.EMPLOYEES(departmentId));
    return new Set(unwrapList(response).map(employee => getRecordId(employee)).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function fetchNotMarkedRecords(activeFilters) {
  const days = activeFilters.from
    ? listDateKeys(activeFilters.from, activeFilters.to || activeFilters.from, MAX_MISSING_RANGE_DAYS + 1)
    : [''];
  if (days.length > MAX_MISSING_RANGE_DAYS) {
    throw new Error(
      `The Missing filter covers up to ${MAX_MISSING_RANGE_DAYS} days at a time. Choose a shorter period.`,
    );
  }
  const fetchDay = async day => {
    const query = buildAttendanceQuery({ ...activeFilters, from: day, to: day }, { includeStatus: false });
    const endpoint = query
      ? `${API_ENDPOINTS.ATTENDANCE.NOT_MARKED}?${query}`
      : API_ENDPOINTS.ATTENDANCE.NOT_MARKED;
    return unwrapAttendanceList(await apiClient.get(endpoint));
  };
  const results = [];
  for (let index = 0; index < days.length; index += 6) {
    results.push(...(await Promise.all(days.slice(index, index + 6).map(fetchDay))));
  }
  return results.flat();
}

export async function fetchAttendanceRecords(
  activeFilters,
  employees,
  currentUser,
  departmentEmployeeIds = null,
) {
  if (!isSuperAdminUser(currentUser) && shouldUseOwnAttendanceOnly(currentUser)) {
    return fetchMyAttendanceRecords(activeFilters);
  }
  const targetEmployees = findEmployeesForFilter(employees, activeFilters.userId, departmentEmployeeIds);
  if (targetEmployees.length === 1) {
    const employeeId = getRecordId(targetEmployees[0]);
    const params = new URLSearchParams();
    if (activeFilters.from) params.set('from', activeFilters.from);
    if (activeFilters.to) params.set('to', activeFilters.to);
    const query = params.toString();
    const endpoint = query
      ? `${API_ENDPOINTS.ATTENDANCE.BY_EMPLOYEE(employeeId)}?${query}`
      : API_ENDPOINTS.ATTENDANCE.BY_EMPLOYEE(employeeId);
    const response = await apiClient.get(endpoint);
    return unwrapAttendanceList(response);
  }
  if (activeFilters.status === 'missing') {
    return fetchNotMarkedRecords(activeFilters);
  }
  const today = getTodayDateValue();
  if (activeFilters.from === today && activeFilters.to === today && !activeFilters.status) {
    const params = new URLSearchParams();
    if (activeFilters.departmentId) params.set('department', activeFilters.departmentId);
    const query = params.toString();
    const endpoint = query ? `${API_ENDPOINTS.ATTENDANCE.TODAY}?${query}` : API_ENDPOINTS.ATTENDANCE.TODAY;
    const response = await apiClient.get(endpoint);
    return unwrapAttendanceList(response);
  }
  const query = buildAttendanceQuery(activeFilters);
  const endpoint = query ? `${API_ENDPOINTS.ATTENDANCE.LIST}?${query}` : API_ENDPOINTS.ATTENDANCE.LIST;
  const response = await apiClient.get(endpoint);
  return unwrapAttendanceList(response);
}

export async function fetchAttendanceStats(activeFilters) {
  const query = buildAttendanceQuery(activeFilters, { includeStatus: false });
  const endpoint = query ? `${API_ENDPOINTS.ATTENDANCE.STATS}?${query}` : API_ENDPOINTS.ATTENDANCE.STATS;
  const response = await apiClient.get(endpoint);
  return unwrapData(response);
}

export function pickNumericStat(stats, keys) {
  const data = unwrapData(stats) || stats;
  if (!data || typeof data !== 'object') return null;
  for (const key of keys) {
    if (data[key] != null && data[key] !== '') {
      const parsed = Number(data[key]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function mergeAttendanceStats(apiStats, computedStats) {
  const computed = computedStats || {};
  const totalUsers =
    pickNumericStat(apiStats, ['totalUsers', 'total_users', 'totalEmployees', 'total']) ??
    computed.totalUsers ??
    0;
  return {
    present: computed.present ?? 0,
    late: computed.late ?? 0,
    absent: computed.absent ?? 0,
    missing: computed.missing ?? 0,
    pending: computed.pending ?? computed.stillWorking ?? 0,
    stillWorking: computed.pending ?? computed.stillWorking ?? 0,
    todayPresent: computed.todayPresent ?? 0,
    checkedOut: computed.checkedOut ?? 0,
    totalUsers,
  };
}