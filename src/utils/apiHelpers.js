export function unwrapData(response) {
  if (response == null) return null;
  if (Array.isArray(response.data)) return response.data;
  if (response.data != null && typeof response.data === 'object') return response.data;
  if (Array.isArray(response)) return response;
  return response;
}

export function unwrapList(response) {
  const data = unwrapData(response);
  if (Array.isArray(data)) return data;

  if (data && typeof data === 'object') {
    const nested =
      data.resources ||
      data.history ||
      data.items ||
      data.results ||
      data.docs ||
      data.employees ||
      data.roles ||
      data.assignments ||
      data.positions ||
      data.departments ||
      data.projects ||
      data.tasks ||
      data.tickets ||
      data.assets ||
      data.todos ||
      data.notes ||
      data.salaries ||
      data.leaves ||
      data.feedbacks ||
      data.feedback ||
      data.notifications ||
      data.records ||
      data.templates ||
      data.list ||
      data.rows ||
      data.data;
    if (Array.isArray(nested)) return nested;
  }

  return [];
}

export function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Parse /notifications/unread-count and similar payloads into a finite number. */
export function parseUnreadCount(response) {
  if (response == null) return null;
  if (typeof response === 'number' || typeof response === 'string') {
    return toFiniteNumber(response);
  }
  if (typeof response !== 'object') return null;

  if (typeof response.data === 'number' || typeof response.data === 'string') {
    const fromData = toFiniteNumber(response.data);
    if (fromData != null) return fromData;
  }

  const data = unwrapData(response);
  if (typeof data === 'number' || typeof data === 'string') {
    return toFiniteNumber(data);
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of ['count', 'unreadCount', 'unread']) {
      const parsed = toFiniteNumber(data[key]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

export function getErrorMessage(error, fallback = 'Something went wrong') {
  const data = error?.data;
  const rawMessage = error?.message;

  if (typeof rawMessage === 'string') {
    if (rawMessage.includes('Cannot GET /api/settings')) {
      return 'Settings API is not available on the server. Restart the backend after pulling the latest code.';
    }
    if (rawMessage.includes('Cannot PUT /api/settings')) {
      return 'Settings update API is not available on the server. Restart the backend after pulling the latest code.';
    }
    if (!rawMessage.trim().startsWith('<!DOCTYPE') && !rawMessage.trim().startsWith('<html')) {
      if (!data?.message) {
        return rawMessage;
      }
    }
  }

  if (Array.isArray(data?.errors)) {
    const messages = data.errors
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry?.message) {
          return entry.field ? `${entry.field}: ${entry.message}` : entry.message;
        }
        return '';
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join('. ');
    }
  }

  if (data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
    const messages = Object.entries(data.errors).map(([field, value]) => {
      if (Array.isArray(value)) return `${field}: ${value.join(', ')}`;
      return `${field}: ${value}`;
    });

    if (messages.length > 0) {
      return messages.join('. ');
    }
  }

  const finalMessage = error?.message || data?.message || fallback;

  if (
    typeof finalMessage === 'string'
    && (finalMessage.trim().startsWith('<!DOCTYPE') || finalMessage.trim().startsWith('<html'))
  ) {
    return fallback;
  }

  return finalMessage;
}

const MONGO_ID_PATTERN = /^[a-f\d]{24}$/i;

export function isMongoId(value) {
  return typeof value === 'string' && MONGO_ID_PATTERN.test(value);
}

export function getRecordId(record) {
  if (!record || typeof record !== 'object') return '';

  const rawValues = [record._id, record.id];

  if (record.user != null) {
    rawValues.push(typeof record.user === 'object' ? record.user._id || record.user.id : record.user);
  }

  if (record.userId != null) {
    rawValues.push(record.userId);
  }

  for (const value of rawValues) {
    if (value == null || value === '') continue;

    if (typeof value === 'object') {
      if (value.$oid) return String(value.$oid);
      const nested = getRecordId(value);
      if (nested) return nested;
      continue;
    }

    const str = String(value).trim();
    if (str && str !== '[object Object]') {
      return str;
    }
  }

  return '';
}

export function getEmployeeMongoId(employee) {
  if (!employee || typeof employee !== 'object') return '';

  const nestedEmployee = employee.employee;
  if (nestedEmployee && typeof nestedEmployee === 'object') {
    const nestedId = extractMongoId(nestedEmployee._id);
    if (nestedId) return nestedId;
  }

  const topId = extractMongoId(employee._id);
  if (!topId) return '';

  return topId;
}

export function getEmployeeDeleteId(employee) {
  if (!employee || typeof employee !== 'object') return '';

  const recordId = getRecordId(employee);
  if (recordId && isMongoId(recordId)) return recordId;

  const mongoId = getEmployeeMongoId(employee);
  if (mongoId) return mongoId;

  return String(employee.employeeId || recordId || '').trim();
}

function extractMongoId(value) {
  if (value == null || value === '') return '';

  if (typeof value === 'object') {
    if (value.$oid) return String(value.$oid);
    const nested = getRecordId(value);
    return isMongoId(nested) ? nested : '';
  }

  const str = String(value).trim();
  return isMongoId(str) ? str : '';
}

export function resolveEmployeeRecordId(employee) {
  if (!employee || typeof employee !== 'object') return '';

  const mongoId = getEmployeeMongoId(employee);
  if (mongoId) return mongoId;

  return String(employee.employeeId || '').trim();
}

export function getEmployeeLookupIds(employee) {
  if (!employee || typeof employee !== 'object') return [];

  const ids = new Set();

  const mongoId = getEmployeeMongoId(employee);
  if (mongoId) ids.add(mongoId);

  const recordId = getRecordId(employee);
  if (recordId) ids.add(recordId);

  const employeeCode = String(employee.employeeId || '').trim();
  if (employeeCode) ids.add(employeeCode);

  const email = String(employee.email || '').trim();
  if (email) ids.add(email);

  return [...ids];
}

/**
 * The employee fields every user search matches on: name, employee ID and email.
 * `employee` may be a populated object or an id/code/email; missing fields (e.g. a
 * populated ref without email) are filled from `employees` when it is given.
 */
export function getEmployeeSearchText(employee, employees = []) {
  if (!employee) return '';

  const key =
    typeof employee === 'object'
      ? getRecordId(employee) || employee.employeeId || employee.email
      : String(employee);
  const fromList = key
    ? (employees || []).find((item) => getEmployeeLookupIds(item).includes(String(key)))
    : null;
  const source = typeof employee === 'object' ? employee : {};

  return [
    source.name || fromList?.name,
    source.employeeId || fromList?.employeeId,
    source.email || fromList?.email,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Case-insensitive partial match on name, employee ID or email. Empty query matches all. */
export function employeeMatchesSearch(employee, query, employees = []) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return getEmployeeSearchText(employee, employees).includes(needle);
}

export function isEmployeeVisible(employee) {
  if (!employee || typeof employee !== 'object') return false;
  if (employee.isDeleted === true || employee.deleted === true) return false;
  if (employee.isActive === false) return false;
  return true;
}

export function employeeMatchesKeys(employee, keySet) {
  if (!employee || !keySet || keySet.size === 0) return false;

  return getEmployeeLookupIds(employee).some((value) => keySet.has(String(value)));
}

export function filterEmployeeList(employees, { hiddenKeys = null } = {}) {
  if (!Array.isArray(employees)) return [];

  return employees.filter((employee) => {
    if (!isEmployeeVisible(employee)) return false;
    if (hiddenKeys && employeeMatchesKeys(employee, hiddenKeys)) return false;
    return true;
  });
}

function addIdentityValue(ids, value) {
  if (value == null || value === '') return;
  const str = String(value).trim();
  if (str && str !== '[object Object]') ids.add(str);
}

export function collectRefIdentityIds(value) {
  const ids = new Set();
  if (value == null || value === '') return ids;

  if (typeof value !== 'object') {
    addIdentityValue(ids, value);
    return ids;
  }

  getEmployeeLookupIds(value).forEach((id) => addIdentityValue(ids, id));
  addIdentityValue(ids, getRecordId(value));
  addIdentityValue(ids, getEmployeeMongoId(value));
  addIdentityValue(ids, value._id);
  addIdentityValue(ids, value.id);
  addIdentityValue(ids, value.employeeId);
  addIdentityValue(ids, value.email);
  addIdentityValue(ids, value.userId);

  if (value.user && typeof value.user === 'object') {
    getEmployeeLookupIds(value.user).forEach((id) => addIdentityValue(ids, id));
    addIdentityValue(ids, getRecordId(value.user));
    addIdentityValue(ids, value.user.employeeId);
    addIdentityValue(ids, value.user.email);
  } else {
    addIdentityValue(ids, value.user);
  }

  if (value.employee && typeof value.employee === 'object') {
    getEmployeeLookupIds(value.employee).forEach((id) => addIdentityValue(ids, id));
    addIdentityValue(ids, getRecordId(value.employee));
    addIdentityValue(ids, value.employee.employeeId);
    addIdentityValue(ids, value.employee.email);
  } else {
    addIdentityValue(ids, value.employee);
  }

  return ids;
}

export function collectUserIdentityIds(user) {
  const ids = new Set();
  if (!user || typeof user !== 'object') return ids;

  collectRefIdentityIds(user).forEach((id) => ids.add(id));
  if (user.employee) {
    collectRefIdentityIds(user.employee).forEach((id) => ids.add(id));
  }

  return ids;
}

export function isRecordCreatedByUser(record, user) {
  if (!record || !user) return false;

  const userIds = collectUserIdentityIds(user);
  return isRecordCreatedByAnyUser(record, userIds);
}

export function isRecordCreatedByAnyUser(record, userIds) {
  if (!record || !userIds?.size) return false;

  const creators = getRecordCreatorValues(record);

  return creators.some((creator) => {
    if (creator == null || creator === '') return false;
    return [...collectRefIdentityIds(creator)].some((id) => userIds.has(id));
  });
}

export function recordHasCreatorReference(record) {
  return getRecordCreatorValues(record).some((creator) => creator != null && creator !== '');
}

function getRecordCreatorValues(record) {
  if (!record || typeof record !== 'object') return [];

  return [
    record.createdBy,
    record.createdByEmployee,
    record.createdByUser,
    record.createdById,
    record.created_by,
    record.addedBy,
    record.owner,
  ];
}

export function filterRecordsCreatedByUser(records, user, { allowAll = false } = {}) {
  if (!Array.isArray(records)) return [];
  if (allowAll) return records;
  return records.filter((record) => isRecordCreatedByUser(record, user));
}

export function buildCreatedIdentitySet(records, user) {
  const ids = new Set();
  (records || []).forEach((record) => {
    if (!isRecordCreatedByUser(record, user)) return;
    collectRefIdentityIds(record).forEach((id) => ids.add(id));
  });
  return ids;
}

export const EMPLOYEE_REF_IDENTITY_KEYS = [
  'employee',
  'employeeId',
  'user',
  'userId',
  'user_id',
  'empId',
  'staff',
  'employeeCode',
  'applicant',
];

export function recordMatchesIdentitySet(
  record,
  identitySet,
  keys = EMPLOYEE_REF_IDENTITY_KEYS,
) {
  if (!record || typeof record !== 'object' || !identitySet?.size) return false;

  const ids = collectRefIdentityIds(record);
  keys.forEach((key) => {
    collectRefIdentityIds(record[key]).forEach((id) => ids.add(id));
  });

  for (const id of ids) {
    if (identitySet.has(id)) return true;
  }
  return false;
}

export function filterRecordsByCreatedEmployees(
  records,
  ownedEmployeeIds,
  { allowAll = false } = {},
) {
  if (!Array.isArray(records)) return [];
  if (allowAll) return records;
  return records.filter((record) => recordMatchesIdentitySet(record, ownedEmployeeIds));
}

export function removeEmployeeFromList(employees, target, extraKeys = []) {
  if (!Array.isArray(employees) || !target) return employees;

  const hiddenKeys = new Set(extraKeys.map(String));
  getEmployeeLookupIds(target).forEach((value) => hiddenKeys.add(String(value)));

  return filterEmployeeList(employees, { hiddenKeys });
}

export async function resolveEmployeeApiId(employee, { apiClient, getById } = {}) {
  if (!employee || typeof employee !== 'object') return '';

  const directId = getEmployeeDeleteId(employee);
  if (directId && isMongoId(directId)) return directId;

  if (!apiClient || typeof getById !== 'function') {
    return directId;
  }

  for (const lookupId of getEmployeeLookupIds(employee)) {
    try {
      const response = await apiClient.get(getById(lookupId));
      const freshEmployee = unwrapData(response);
      if (!freshEmployee) continue;

      const freshDeleteId = getEmployeeDeleteId(freshEmployee);
      if (freshDeleteId && isMongoId(freshDeleteId)) return freshDeleteId;
    } catch {
      // Try the next identifier shape.
    }
  }

  return directId;
}

export function assertApiSuccess(response, fallback = 'Request failed') {
  if (response == null || typeof response !== 'object') return response;

  if (response.success === false) {
    throw {
      status: response.statusCode || 400,
      message: response.message || fallback,
      data: response,
    };
  }

  return response;
}

export function getDisplayName(value) {
  if (!value) return '—';
  if (typeof value === 'object') {
    return value.name || value.employeeId || value.email || getRecordId(value) || '—';
  }
  return String(value);
}

export function formatRoleSlug(slug) {
  if (!slug) return '';
  return String(slug)
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMongoObjectId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

/** Resolve a human-readable role label from auth/profile payloads. */
export function extractRoleLabel(source) {
  if (!source || typeof source !== 'object') return '';

  if (source.roleName) {
    return String(source.roleName).trim();
  }

  const role = source.role ?? source.employee?.role;
  if (typeof role === 'string') {
    const trimmed = role.trim();
    if (trimmed && !isMongoObjectId(trimmed)) return trimmed;
  }

  if (role && typeof role === 'object') {
    const label =
      role.name ||
      role.title ||
      role.label ||
      formatRoleSlug(role.slug || role.code);
    if (label) return String(label).trim();
  }

  const fromDisplay = getDisplayName(role);
  return fromDisplay !== '—' ? fromDisplay : '';
}

export function isEmailVerified(user) {
  return Boolean(user?.isEmailVerified ?? user?.emailVerified);
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value) {
  return EMAIL_ADDRESS_PATTERN.test(String(value || '').trim());
}

/** Build login body: email or employeeId based on identifier format. */
export function buildLoginCredentialsPayload(identifier, password) {
  const trimmed = String(identifier || '').trim();
  if (isEmailAddress(trimmed)) {
    return { email: trimmed.toLowerCase(), password };
  }
  return { employeeId: trimmed.toUpperCase(), password };
}

/** Build forgot-password body: email or employeeId based on identifier format. */
export function buildForgotPasswordPayload(identifier) {
  const trimmed = String(identifier || '').trim();
  if (isEmailAddress(trimmed)) {
    return { email: trimmed.toLowerCase() };
  }
  return { employeeId: trimmed.toUpperCase() };
}

/** Normalize a permission entry from API (string or { key | name | permission }). */
export function normalizePermissionKey(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    return String(
      entry.key || entry.name || entry.permission || entry.code || entry.slug || '',
    ).trim();
  }
  return String(entry).trim();
}

export function normalizePermissionList(permissions = []) {
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions.map(normalizePermissionKey).filter(Boolean))];
}

/** Collect permission keys from an auth payload (login / me). */
export function extractAuthPermissions(source) {
  if (!source || typeof source !== 'object') return [];

  // Prefer direct permissions when present, but fall back to the assigned role
  // when the API sends an empty permissions array for a role-based user.
  if (Array.isArray(source.permissions) && source.permissions.length > 0) {
    return normalizePermissionList(source.permissions);
  }

  return normalizePermissionList([
    ...(Array.isArray(source.role?.permissions) ? source.role.permissions : []),
    ...(Array.isArray(source.rolePermissions) ? source.rolePermissions : []),
  ]);
}

export function normalizeAuthUser(user) {
  if (!user || typeof user !== 'object') return null;

  const roleName = extractRoleLabel(user);

  // When permissions are set explicitly (e.g. from /me), do not re-merge stale role.permissions.
  const permissions =
    Object.prototype.hasOwnProperty.call(user, 'permissions') &&
    Array.isArray(user.permissions)
      ? normalizePermissionList(user.permissions)
      : extractAuthPermissions(user);

  const employeeId =
    user.employeeId ||
    user.employee?.employeeId ||
    (typeof user.employee === 'string' ? user.employee : '');

  let role = user.role;
  if (role && typeof role === 'object') {
    role = { ...role, permissions };
  }

  return {
    ...user,
    roleName,
    employeeId,
    role,
    permissions,
    isSuperAdmin: user.isSuperAdmin ?? user.superAdmin ?? user.role?.isSuperAdmin ?? undefined,
  };
}

/** Merge profile fields from storage with a fresh /me (or login) payload; permissions come from API only. */
export function mergeAuthUserFromApi(storedUser, apiRaw) {
  const apiPermissions = extractAuthPermissions(apiRaw);

  let role = apiRaw?.role ?? storedUser?.role ?? null;
  if (role && typeof role === 'object') {
    role = { ...role, permissions: apiPermissions };
  }

  return normalizeAuthUser({
    ...(storedUser || {}),
    ...(apiRaw || {}),
    permissions: apiPermissions,
    role,
  });
}
