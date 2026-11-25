import { getRecordId, getDisplayName, unwrapData, unwrapList } from './apiHelpers.js';

export const DEFAULT_LEAVE_ALLOCATION = {
  casual: 10,
  sick: 10,
  annual: 10,
};

export const ALLOCATED_LEAVE_TYPES = ['casual', 'sick', 'annual'];
export const EMPLOYEE_LEAVE_TYPES = ['casual', 'sick', 'annual', 'unpaid'];
export const UNLIMITED_LEAVE_TYPES = ['unpaid'];
// Must match OMS-Backend utils/leavePay.js — every other type is unpaid.
export const PAID_LEAVE_TYPES = ['casual', 'sick', 'annual'];

export function isPaidLeaveType(type) {
  return PAID_LEAVE_TYPES.includes(String(type || '').trim().toLowerCase());
}

function capitalizeLeaveType(value) {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/**
 * Leave-type dropdown options for the apply form, built from GET /leaves/balance for
 * the selected assignment (real per-employee limits, no settings:read needed).
 * Falls back to `fallbackOptions` when the balance is not available.
 */
export function buildLeaveTypeOptionsFromBalance(response, fallbackOptions = []) {
  const data = unwrapData(response);
  const raw = data?.balances;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallbackOptions;

  const options = Object.entries(raw)
    .filter(([key, entry]) => key && entry && typeof entry === 'object')
    .map(([key, entry]) => {
      const limit = entry.limit === null || entry.limit === undefined ? null : Number(entry.limit);
      const used = Number(entry.used) || 0;
      const unlimited = limit === null;
      const remaining = unlimited
        ? null
        : Math.max(0, Number(entry.remaining ?? limit - used) || 0);
      const paid = typeof entry.paid === 'boolean' ? entry.paid : isPaidLeaveType(key);
      const label = entry.label || capitalizeLeaveType(key);
      const payNote = paid ? '' : ' · unpaid, deducted from salary';
      return {
        value: key,
        label,
        limit,
        used,
        remaining,
        unlimited,
        paid,
        disabled: !unlimited && remaining <= 0,
        optionLabel: unlimited
          ? `${label} (no limit${payNote})`
          : limit === 0
            ? `${label} — not allotted for this assignment (ask HR)`
            : `${label} — ${remaining} of ${limit} left${payNote}`,
      };
    });

  return options.length ? options : fallbackOptions;
}

function createEmptyLeaveTypeCounts() {
  return EMPLOYEE_LEAVE_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {});
}

function parseDateKey(value) {
  if (!value) return null;
  const key = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
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

function getYearDateRange(year) {
  const normalizedYear = String(year).trim();
  if (!/^\d{4}$/.test(normalizedYear)) {
    return null;
  }
  return {
    from: `${normalizedYear}-01-01`,
    to: `${normalizedYear}-12-31`,
  };
}

function getRefId(value) {
  if (!value) return '';
  if (typeof value === 'object') return getRecordId(value);
  return String(value);
}

export function getLeaveEmployeeId(leave, assignmentById = new Map()) {
  const directEmployee = getRefId(leave?.employee || leave?.applicant);
  if (directEmployee) return directEmployee;

  const assignmentRef = leave?.assignment;
  const assignmentId = getRefId(assignmentRef);
  if (!assignmentId) return '';

  if (typeof assignmentRef === 'object' && assignmentRef?.employee) {
    const nestedEmployeeId = getRefId(assignmentRef.employee);
    if (nestedEmployeeId) return nestedEmployeeId;
  }

  const assignment = assignmentById.get(assignmentId);
  return getRefId(assignment?.employee);
}

export function getLeaveAssignmentId(leave) {
  return getRefId(leave?.assignment);
}

export function getAssignmentPoolLabel(assignment) {
  const department = readDepartmentLabel(assignment?.department);
  if (department) return department;

  const position = getDisplayName(assignment?.position);
  if (position && position !== '—') return position;

  return 'Default';
}

function isMeaningfulLabel(value) {
  if (value == null) return false;
  const label = String(value).trim();
  return Boolean(label) && label !== '—' && label !== '-';
}

function looksLikeMongoId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function readDepartmentLabel(value, departmentsById = new Map()) {
  if (value == null || value === '') return '';

  if (typeof value !== 'object') {
    const str = String(value).trim();
    if (departmentsById.has(str)) {
      return readDepartmentLabel(departmentsById.get(str), departmentsById);
    }
    if (looksLikeMongoId(str) || !isMeaningfulLabel(str) || str.toLowerCase() === 'default') {
      return '';
    }
    return str;
  }

  const named = value.name || value.departmentName || value.title || value.label || value.code;
  if (isMeaningfulLabel(named) && !looksLikeMongoId(named) && String(named).toLowerCase() !== 'default') {
    return String(named).trim();
  }

  const id = getRecordId(value);
  if (id && departmentsById.has(id)) {
    return readDepartmentLabel(departmentsById.get(id), departmentsById);
  }

  if (value.department && value.department !== value) {
    return readDepartmentLabel(value.department, departmentsById);
  }

  return '';
}

function buildDepartmentsById(departments = []) {
  const departmentsById = new Map();
  departments.forEach((department) => {
    const id = getRecordId(department);
    if (id) departmentsById.set(id, department);
    if (department?.code) departmentsById.set(String(department.code), department);
  });
  return departmentsById;
}

function buildAssignmentsByEmployee(assignments = []) {
  const assignmentsByEmployee = new Map();
  assignments.forEach((assignment) => {
    const employeeId = getRefId(assignment?.employee);
    if (!employeeId) return;
    if (!assignmentsByEmployee.has(employeeId)) {
      assignmentsByEmployee.set(employeeId, []);
    }
    assignmentsByEmployee.get(employeeId).push(assignment);
  });
  return assignmentsByEmployee;
}

function toNonNegativeNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

export function getAssignmentLeaveAllocation(assignment, defaultAllocation = DEFAULT_LEAVE_ALLOCATION) {
  const leaveConfig = assignment?.leaveConfig || {};
  const defaults = { ...DEFAULT_LEAVE_ALLOCATION, ...defaultAllocation };

  return ALLOCATED_LEAVE_TYPES.reduce((allocation, type) => {
    allocation[type] = toNonNegativeNumber(leaveConfig[type], defaults[type]);
    return allocation;
  }, {});
}

function buildLeaveBalances(allocation, used) {
  return EMPLOYEE_LEAVE_TYPES.reduce((result, type) => {
    const taken = used[type] || 0;

    if (UNLIMITED_LEAVE_TYPES.includes(type)) {
      result[type] = {
        unlimited: true,
        total: null,
        used: taken,
        remaining: null,
      };
      return result;
    }

    const total = allocation[type] ?? DEFAULT_LEAVE_ALLOCATION[type] ?? 0;
    result[type] = {
      unlimited: false,
      total,
      used: taken,
      remaining: Math.max(total - taken, 0),
    };
    return result;
  }, {});
}

export function computeApprovedLeaveDaysByAssignmentForYear(
  leaves,
  year,
  assignmentById = new Map(),
) {
  const range = getYearDateRange(year);
  const countsByAssignment = new Map();
  const orphanCountsByEmployee = new Map();

  if (!range) {
    return { countsByAssignment, orphanCountsByEmployee };
  }

  (leaves || []).forEach((leave) => {
    const status = String(leave?.status || '').toLowerCase();
    if (status !== 'approved') return;

    const leaveType = String(leave?.leaveType || '').toLowerCase();
    if (!EMPLOYEE_LEAVE_TYPES.includes(leaveType)) return;

    const startKey = parseDateKey(leave.startDate);
    const endKey = parseDateKey(leave.endDate);
    if (!startKey || !endKey) return;

    const overlapStart = startKey > range.from ? startKey : range.from;
    const overlapEnd = endKey < range.to ? endKey : range.to;
    if (overlapStart > overlapEnd) return;

    const days = countDaysBetweenInclusive(overlapStart, overlapEnd);
    const assignmentId = getLeaveAssignmentId(leave);

    if (assignmentId) {
      if (!countsByAssignment.has(assignmentId)) {
        countsByAssignment.set(assignmentId, createEmptyLeaveTypeCounts());
      }
      countsByAssignment.get(assignmentId)[leaveType] += days;
      return;
    }

    const employeeId = getLeaveEmployeeId(leave, assignmentById);
    if (!employeeId) return;

    if (!orphanCountsByEmployee.has(employeeId)) {
      orphanCountsByEmployee.set(employeeId, createEmptyLeaveTypeCounts());
    }
    orphanCountsByEmployee.get(employeeId)[leaveType] += days;
  });

  return { countsByAssignment, orphanCountsByEmployee };
}

function buildPoolBalance(assignment, usedCounts, defaultAllocation = DEFAULT_LEAVE_ALLOCATION) {
  const allocation = {
    ...getAssignmentLeaveAllocation(assignment, defaultAllocation),
    unpaid: null,
  };

  return {
    assignmentId: getRecordId(assignment),
    poolLabel: getAssignmentPoolLabel(assignment),
    isPrimary: Boolean(assignment?.isPrimary),
    balances: buildLeaveBalances(allocation, usedCounts || createEmptyLeaveTypeCounts()),
  };
}

function mergeLeaveCounts(primary = {}, secondary = {}) {
  return EMPLOYEE_LEAVE_TYPES.reduce((merged, type) => {
    merged[type] = (primary[type] || 0) + (secondary[type] || 0);
    return merged;
  }, createEmptyLeaveTypeCounts());
}

export function buildEmployeeLeaveBalanceRows({
  employees = [],
  assignments = [],
  leaves = [],
  year = String(new Date().getFullYear()),
  defaultAllocation = DEFAULT_LEAVE_ALLOCATION,
}) {
  const assignmentById = new Map(
    assignments.map((assignment) => [getRecordId(assignment), assignment]).filter(([id]) => id),
  );
  const assignmentsByEmployee = new Map();

  assignments.forEach((assignment) => {
    const employeeId = getRefId(assignment?.employee);
    if (!employeeId) return;

    if (!assignmentsByEmployee.has(employeeId)) {
      assignmentsByEmployee.set(employeeId, []);
    }
    assignmentsByEmployee.get(employeeId).push(assignment);
  });

  const { countsByAssignment, orphanCountsByEmployee } =
    computeApprovedLeaveDaysByAssignmentForYear(leaves, year, assignmentById);

  return employees
    .map((employee) => {
      const employeeId = getRecordId(employee);
      if (!employeeId) return null;

      const employeeAssignments = (assignmentsByEmployee.get(employeeId) || []).sort((a, b) => {
        if (a.isPrimary === b.isPrimary) return 0;
        return a.isPrimary ? -1 : 1;
      });
      const orphanUsed = orphanCountsByEmployee.get(employeeId) || createEmptyLeaveTypeCounts();
      let pools;

      if (employeeAssignments.length === 0) {
        pools = [
          buildPoolBalance({ leaveConfig: defaultAllocation }, orphanUsed, defaultAllocation),
        ];
      } else if (employeeAssignments.length === 1) {
        const assignment = employeeAssignments[0];
        const assignmentId = getRecordId(assignment);
        const used = mergeLeaveCounts(
          countsByAssignment.get(assignmentId),
          orphanUsed,
        );
        pools = [buildPoolBalance(assignment, used, defaultAllocation)];
      } else {
        const primaryAssignment =
          employeeAssignments.find((item) => item.isPrimary) || employeeAssignments[0];
        const primaryAssignmentId = getRecordId(primaryAssignment);

        pools = employeeAssignments.map((assignment) => {
          const assignmentId = getRecordId(assignment);
          let used = countsByAssignment.get(assignmentId) || createEmptyLeaveTypeCounts();

          if (assignmentId === primaryAssignmentId) {
            used = mergeLeaveCounts(used, orphanUsed);
          }

          return buildPoolBalance(assignment, used, defaultAllocation);
        });
      }

      const primaryAssignment = employeeAssignments.find((item) => item.isPrimary) || employeeAssignments[0];
      const departmentLabel =
        readDepartmentLabel(primaryAssignment?.department) ||
        readDepartmentLabel(employee?.department) ||
        (isMeaningfulLabel(pools[0]?.poolLabel) && String(pools[0].poolLabel).toLowerCase() !== 'default'
          ? pools[0].poolLabel
          : '') ||
        '—';
      const poolLabels = pools.map((pool) => pool.poolLabel);
      const hasMultiplePools = pools.length > 1;

      return {
        employeeId,
        employee,
        departmentLabel,
        poolLabels,
        hasMultiplePools,
        pools,
      };
    })
    .filter(Boolean);
}

function normalizeTypeBalance(raw, type) {
  if (!raw || typeof raw !== 'object') {
    if (UNLIMITED_LEAVE_TYPES.includes(type)) {
      return { unlimited: true, total: null, used: Number(raw) || 0, remaining: null };
    }

    return {
      unlimited: false,
      total: DEFAULT_LEAVE_ALLOCATION[type] ?? 0,
      used: 0,
      remaining: DEFAULT_LEAVE_ALLOCATION[type] ?? 0,
    };
  }

  const used = toNonNegativeNumber(raw.used ?? raw.taken ?? raw.consumed, 0);

  if (UNLIMITED_LEAVE_TYPES.includes(type) || raw.unlimited) {
    return { unlimited: true, total: null, used, remaining: null };
  }

  const total = toNonNegativeNumber(
    raw.total ?? raw.allocated ?? raw.allocation ?? raw.limit,
    DEFAULT_LEAVE_ALLOCATION[type] ?? 0,
  );
  const remaining = toNonNegativeNumber(
    raw.remaining ?? raw.left,
    Math.max(total - used, 0),
  );

  return {
    unlimited: false,
    total,
    used,
    remaining,
  };
}

function normalizePoolBalances(rawBalances) {
  return EMPLOYEE_LEAVE_TYPES.reduce((result, type) => {
    result[type] = normalizeTypeBalance(rawBalances?.[type], type);
    return result;
  }, {});
}

function hasMeaningfulBalanceMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (EMPLOYEE_LEAVE_TYPES.some((type) => value[type] != null)) return true;
  return value.used != null || value.remaining != null || value.total != null || value.allocated != null;
}

function looksLikePersonalLeaveBalancePayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (Array.isArray(data.pools) && data.pools.length > 0) return true;
  if (
    hasMeaningfulBalanceMap(data.balances) ||
    hasMeaningfulBalanceMap(data.balance) ||
    hasMeaningfulBalanceMap(data.leaveBalance) ||
    hasMeaningfulBalanceMap(data.quota)
  ) {
    return true;
  }
  return EMPLOYEE_LEAVE_TYPES.some((type) => data[type] != null);
}

/** Normalize /leaves/balance (self) into { casual, sick, annual, unpaid } cards. */
export function normalizePersonalLeaveBalances(response) {
  const data = unwrapData(response);
  if (!looksLikePersonalLeaveBalancePayload(data)) {
    return null;
  }

  if (Array.isArray(data.pools) && data.pools.length > 0) {
    const primary = data.pools.find((pool) => pool.isPrimary) || data.pools[0];
    return normalizePoolBalances(primary?.balances || primary?.balance || primary);
  }

  const raw =
    data.balances ||
    data.balance ||
    data.leaveBalance ||
    data.quota ||
    data;

  return normalizePoolBalances(raw);
}

function buildRowFromPools(employee, employeeId, pools, item = {}) {
  const primaryPool = pools.find((pool) => pool.isPrimary) || pools[0];
  const departmentLabel =
    readDepartmentLabel(item.departmentLabel) ||
    readDepartmentLabel(item.department) ||
    readDepartmentLabel(item.departmentName) ||
    readDepartmentLabel(employee?.department) ||
    readDepartmentLabel(primaryPool?.poolLabel) ||
    '—';
  const poolLabels = pools.map((pool) => pool.poolLabel);

  return {
    employeeId,
    employee:
      employee ||
      {
        employeeId: item.employeeId,
        name: item.name,
        email: item.email,
      },
    departmentLabel,
    poolLabels,
    hasMultiplePools: pools.length > 1,
    pools,
  };
}

function normalizeBalanceRow(item) {
  if (!item || typeof item !== 'object') return null;

  const employee = item.employee || item.applicant || item.user || null;
  const employeeId =
    getRecordId(employee) ||
    getRefId(item.employeeId) ||
    getRecordId(item) ||
    '';

  if (Array.isArray(item.pools) && item.pools.length > 0) {
    const pools = item.pools.map((pool, index) => ({
      assignmentId: getRecordId(pool.assignment) || pool.assignmentId || `pool-${index}`,
      poolLabel:
        readDepartmentLabel(pool.poolLabel) ||
        readDepartmentLabel(pool.label) ||
        getAssignmentPoolLabel(pool.assignment || pool) ||
        `Pool ${index + 1}`,
      isPrimary: Boolean(pool.isPrimary),
      balances: normalizePoolBalances(pool.balances || pool.balance || pool),
    }));

    return buildRowFromPools(employee, employeeId, pools, item);
  }

  if (Array.isArray(item.assignments) && item.assignments.length > 0) {
    const pools = item.assignments.map((assignment, index) => ({
      assignmentId: getRecordId(assignment) || assignment.assignmentId || `pool-${index}`,
      poolLabel:
        getAssignmentPoolLabel(assignment) ||
        readDepartmentLabel(assignment.poolLabel) ||
        `Pool ${index + 1}`,
      isPrimary: Boolean(assignment.isPrimary),
      balances: normalizePoolBalances(
        assignment.balances || assignment.balance || assignment.leaveBalance || item.balances,
      ),
    }));

    return buildRowFromPools(employee, employeeId, pools, item);
  }

  const pools = [
    {
      assignmentId: getRecordId(item.assignment) || 'default',
      poolLabel:
        readDepartmentLabel(item.poolLabel) ||
        readDepartmentLabel(item.department) ||
        getAssignmentPoolLabel(item.assignment) ||
        'Default',
      isPrimary: true,
      balances: normalizePoolBalances(item.balances || item.balance || item),
    },
  ];

  return buildRowFromPools(employee, employeeId, pools, item);
}

function looksLikeBalanceRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  if (Array.isArray(value.pools) && value.pools.length > 0) return true;
  if (Array.isArray(value.assignments) && value.assignments.length > 0) return true;
  if (
    hasMeaningfulBalanceMap(value.balances) ||
    hasMeaningfulBalanceMap(value.balance) ||
    hasMeaningfulBalanceMap(value.leaveBalance) ||
    hasMeaningfulBalanceMap(value.quota)
  ) {
    return true;
  }

  const hasTopLevelTypes = EMPLOYEE_LEAVE_TYPES.some((type) => value[type] != null);
  if (!hasTopLevelTypes) return false;

  // A leave-type node ({ used, total }) is not an employee row.
  const hasNestedTypeObject = EMPLOYEE_LEAVE_TYPES.some(
    (type) => value[type] != null && typeof value[type] === 'object',
  );
  return hasNestedTypeObject;
}

export function extractLeaveBalanceList(response) {
  const list = unwrapList(response);
  if (list.length > 0) {
    return list;
  }

  const data = unwrapData(response);
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    const nested =
      data.employees ||
      data.balances ||
      data.rows ||
      data.items ||
      data.results;

    if (Array.isArray(nested)) {
      return nested;
    }

    if (looksLikeBalanceRow(data) && (data.employee || data.employeeId || data.applicant)) {
      return [data];
    }

    return Object.values(data).filter(looksLikeBalanceRow);
  }

  return [];
}

export function mapApiLeaveBalanceRows(response) {
  return extractLeaveBalanceList(response)
    .map(normalizeBalanceRow)
    .filter((row) => row && row.employeeId);
}

export function mergeLeaveBalanceEmployees(
  rows,
  employees = [],
  assignments = [],
  departments = [],
) {
  if (!rows.length) {
    return rows;
  }

  const employeeById = new Map(
    employees.map((employee) => [getRecordId(employee), employee]).filter(([id]) => id),
  );
  const employeeByCode = new Map(
    employees
      .filter((employee) => employee.employeeId)
      .map((employee) => [String(employee.employeeId), employee]),
  );
  const departmentsById = buildDepartmentsById(departments);
  const assignmentsByEmployee = buildAssignmentsByEmployee(assignments);

  return rows.map((row) => {
    const employee =
      employeeById.get(row.employeeId) ||
      employeeByCode.get(String(row.employee?.employeeId || row.employeeId)) ||
      row.employee;
    const employeeId = getRecordId(employee) || row.employeeId;
    const employeeAssignments =
      assignmentsByEmployee.get(employeeId) ||
      assignmentsByEmployee.get(row.employeeId) ||
      assignmentsByEmployee.get(String(employee?.employeeId || '')) ||
      [];
    const primaryAssignment =
      employeeAssignments.find((item) => item.isPrimary) || employeeAssignments[0];
    const primaryPool = (row.pools || []).find((pool) => pool.isPrimary) || row.pools?.[0];

    const departmentLabel =
      readDepartmentLabel(row.departmentLabel, departmentsById) ||
      readDepartmentLabel(row.department, departmentsById) ||
      readDepartmentLabel(employee?.department, departmentsById) ||
      readDepartmentLabel(primaryAssignment?.department, departmentsById) ||
      readDepartmentLabel(primaryPool?.poolLabel, departmentsById) ||
      readDepartmentLabel(primaryPool?.department, departmentsById) ||
      '—';

    return {
      ...row,
      employee,
      employeeId,
      departmentLabel,
    };
  });
}

export async function fetchLeaveBalanceRowsFromApi(apiClient, API_ENDPOINTS, year) {
  if (!API_ENDPOINTS.LEAVES.ALL_BALANCES) {
    return [];
  }

  const yearQuery = `year=${encodeURIComponent(year)}`;
  const allBalancesResponse = await apiClient.get(
    `${API_ENDPOINTS.LEAVES.ALL_BALANCES}?${yearQuery}`,
  );
  return mapApiLeaveBalanceRows(allBalancesResponse);
}

export function buildLeaveQuotaPayload({ year, quotas, assignmentId = '' }) {
  const payload = {
    year: Number(year),
    quotas: ALLOCATED_LEAVE_TYPES.reduce((result, type) => {
      result[type] = toNonNegativeNumber(quotas?.[type], 0);
      return result;
    }, {}),
  };

  if (assignmentId) {
    payload.assignmentId = assignmentId;
  }

  return payload;
}

export async function updateEmployeeLeaveQuota(
  apiClient,
  API_ENDPOINTS,
  employeeId,
  { year, quotas, assignmentId },
) {
  return apiClient.put(
    API_ENDPOINTS.LEAVES.EMPLOYEE_QUOTA(employeeId),
    buildLeaveQuotaPayload({ year, quotas, assignmentId }),
  );
}

export async function updateDepartmentLeaveQuota(
  apiClient,
  API_ENDPOINTS,
  departmentId,
  { year, quotas },
) {
  return apiClient.put(
    API_ENDPOINTS.LEAVES.DEPARTMENT_QUOTA(departmentId),
    buildLeaveQuotaPayload({ year, quotas }),
  );
}

export async function fetchLeaveBalanceRowsComputed(
  apiClient,
  API_ENDPOINTS,
  year,
  defaultAllocation = DEFAULT_LEAVE_ALLOCATION,
) {
  const [employeesResponse, assignmentsResponse, leavesResponse] = await Promise.all([
    apiClient.get(API_ENDPOINTS.EMPLOYEES.LIST),
    apiClient.get(API_ENDPOINTS.ASSIGNMENTS.LIST),
    apiClient.get(API_ENDPOINTS.LEAVES.ALL),
  ]);

  return buildEmployeeLeaveBalanceRows({
    employees: unwrapList(employeesResponse),
    assignments: unwrapList(assignmentsResponse),
    leaves: unwrapList(leavesResponse),
    year,
    defaultAllocation,
  });
}
