import { NAV_ITEMS, PROFILE_ITEM, DASHBOARD_ITEM } from '../config/navigation.js';
import {
  ATTENDANCE_IMPORT_ACCESS_PERMISSIONS,
  AUDIT_LOG_ACCESS_PERMISSIONS,
  FEEDBACK_ACCESS_PERMISSIONS,
  TODO_ACCESS_PERMISSIONS,
} from '../config/permissions.js';
import {
  extractRoleLabel,
  isEmailVerified,
  extractAuthPermissions,
  normalizePermissionList,
  isRecordCreatedByUser,
  filterRecordsCreatedByUser,
  buildCreatedIdentitySet,
  filterRecordsByCreatedEmployees,
  collectUserIdentityIds,
  collectRefIdentityIds,
  isRecordCreatedByAnyUser,
  recordHasCreatorReference,
} from './apiHelpers.js';
import { canManageAllAttendance } from './attendanceHelpers.js';

export function getUserPermissions(user) {
  if (!user) return [];

  if (Array.isArray(user.permissions)) {
    const normalized = normalizePermissionList(user.permissions);
    if (normalized.length > 0) return normalized;
  }

  return extractAuthPermissions(user);
}

// Backend also expects base permissions (e.g. leave:read) alongside scoped ones (leave:read:any).
const IMPLIED_ROLE_PERMISSIONS = {
  'employee:create:any': ['employee:create'],
  'employee:create:own': ['employee:create'],
  'employee:create:scoped': ['employee:create'],
  'employee:read:any': ['employee:read'],
  'employee:read:own': ['employee:read'],
  'employee:read:scoped': ['employee:read'],
  'employee:update:any': ['employee:update'],
  'employee:update:own': ['employee:update'],
  'employee:update:scoped': ['employee:update'],
  'employee:delete:any': ['employee:delete'],
  'employee:delete:own': ['employee:delete'],
  'employee:delete:scoped': ['employee:delete'],
  'department:create:any': ['department:create'],
  'department:create:own': ['department:create'],
  'department:read:any': ['department:read'],
  'department:read:own': ['department:read'],
  'department:update:any': ['department:update'],
  'department:update:own': ['department:update'],
  'department:delete:any': ['department:delete'],
  'department:delete:own': ['department:delete'],
  'position:create:any': ['position:create'],
  'position:create:own': ['position:create'],
  'position:read:any': ['position:read'],
  'position:read:own': ['position:read'],
  'position:update:any': ['position:update'],
  'position:update:own': ['position:update'],
  'position:delete:any': ['position:delete'],
  'position:delete:own': ['position:delete'],
  'assignment:create:any': ['assignment:create'],
  'assignment:create:own': ['assignment:create'],
  'assignment:read:any': ['assignment:read'],
  'assignment:read:own': ['assignment:read'],
  'assignment:update:any': ['assignment:update'],
  'assignment:update:own': ['assignment:update'],
  'assignment:delete:any': ['assignment:delete'],
  'assignment:delete:own': ['assignment:delete'],
  'role:create:any': ['role:create'],
  'role:create:own': ['role:create'],
  'role:read:any': ['role:read'],
  'role:read:own': ['role:read'],
  'role:update:any': ['role:update'],
  'role:update:own': ['role:update'],
  'role:delete:any': ['role:delete'],
  'role:delete:own': ['role:delete'],
  'leave:read:any': ['leave:read'],
  'leave:read:own': ['leave:read'],
  'leave:update:any': ['leave:update'],
  'leave:update:own': ['leave:update'],
  'leave:create:any': ['leave:create'],
  'leave:create:own': ['leave:create'],
  'leave:delete:own': ['leave:delete'],
  'task:read:own': ['task:read'],
  'task:update:any': ['task:update'],
  'task:update:own': ['task:update'],
  'ticket:create:any': ['ticket:create'],
  'ticket:create:own': ['ticket:create'],
  'ticket:read:own': ['ticket:read'],
  'ticket:read:any': ['ticket:read'],
  'ticket:update:any': ['ticket:update'],
  'ticket:update:own': ['ticket:update'],
  'ticket:delete:any': ['ticket:delete'],
  'ticket:delete:own': ['ticket:delete'],
  'project:read:any': ['project:read'],
  'project:read:own': ['project:read'],
  'resource:read:scoped': ['resource:read'],
  'feedback:read:own': ['feedback:read'],
};

export function expandRolePermissions(permissions = []) {
  const expanded = new Set(permissions);
  for (const permission of permissions) {
    for (const implied of IMPLIED_ROLE_PERMISSIONS[permission] || []) {
      expanded.add(implied);
    }
  }
  return [...expanded];
}

/** Strip base permissions auto-implied by a scoped selection (e.g. employee:create when :any is set). */
export function collapseImpliedPermissions(permissions = []) {
  const implied = new Set();
  for (const permission of permissions) {
    for (const child of IMPLIED_ROLE_PERMISSIONS[permission] || []) {
      implied.add(child);
    }
  }
  return permissions.filter((permission) => !implied.has(permission));
}

export function getImpliedPermissions(permissions = []) {
  const implied = new Set();
  for (const permission of permissions) {
    for (const child of IMPLIED_ROLE_PERMISSIONS[permission] || []) {
      implied.add(child);
    }
  }
  return [...implied];
}

export function getExpandedUserPermissions(user) {
  return expandRolePermissions(getUserPermissions(user));
}

function getRoleName(user) {
  return extractRoleLabel(user);
}

export function getUserRoleLabel(user) {
  if (!user) return '';
  if (isSuperAdminUser(user)) return 'Super Admin';
  return extractRoleLabel(user);
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function looksLikeMongoObjectId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function normalizeEmployeeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

function collectEmployeeCodes(user) {
  if (!user) return [];

  const raw = [
    user.employeeId,
    user.employee?.employeeId,
    user.code,
    user.employee?.code,
    user.employeeCode,
    user.employee?.employeeCode,
  ];

  const codes = [];
  for (const value of raw) {
    if (looksLikeMongoObjectId(value)) continue;
    const code = normalizeEmployeeCode(value);
    if (!code || looksLikeMongoObjectId(code)) continue;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

const BOOTSTRAP_SUPER_ADMIN_CODES = new Set(['USR0001', 'USR001']);

function isBootstrapSuperAdminCode(code) {
  return Boolean(code) && BOOTSTRAP_SUPER_ADMIN_CODES.has(code);
}

function normalizeRoleKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function isSuperAdminRoleKey(key) {
  if (!key) return false;
  return key.includes('superadmin') || key === 'superadministrator';
}

function collectRoleKeys(user) {
  if (!user) return [];

  const keys = [];
  const push = (value) => {
    const key = normalizeRoleKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  };

  push(getRoleName(user));
  push(user.roleName);
  push(user.employee?.roleName);
  push(user.role?.name);
  push(user.role?.title);
  push(user.role?.label);
  push(user.role?.slug);
  push(user.role?.code);
  push(user.employee?.role?.name);
  push(user.employee?.role?.title);
  push(user.employee?.role?.slug);
  push(user.employee?.role?.code);

  const extraRoles = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(user.employee?.roles) ? user.employee.roles : []),
  ];

  extraRoles.forEach((role) => {
    if (typeof role === 'string') {
      push(role);
      return;
    }
    push(role?.name);
    push(role?.title);
    push(role?.slug);
    push(role?.code);
  });

  return keys;
}

function hasSuperAdminRoleIdentity(user) {
  if (!user) return false;

  if (isTruthyFlag(user.isSuperAdmin) || isTruthyFlag(user.superAdmin)) {
    return true;
  }
  if (
    isTruthyFlag(user.role?.isSuperAdmin) ||
    isTruthyFlag(user.role?.superAdmin)
  ) {
    return true;
  }
  if (
    isTruthyFlag(user.employee?.isSuperAdmin) ||
    isTruthyFlag(user.employee?.superAdmin)
  ) {
    return true;
  }

  return collectRoleKeys(user).some(isSuperAdminRoleKey);
}

export function isSuperAdminUser(user) {
  if (!user) return false;

  if (collectEmployeeCodes(user).some(isBootstrapSuperAdminCode)) {
    return true;
  }

  return hasSuperAdminRoleIdentity(user);
}

/** True for Super Admin / system roles that must not be deleted or stripped in production. */
export function isProtectedSystemRole(role) {
  if (!role) return false;

  if (typeof role === 'string') {
    return isSuperAdminRoleKey(normalizeRoleKey(role));
  }

  if (typeof role !== 'object') return false;

  if (
    isTruthyFlag(role.isSystem) ||
    isTruthyFlag(role.isProtected) ||
    isTruthyFlag(role.isSuperAdmin) ||
    isTruthyFlag(role.superAdmin)
  ) {
    return true;
  }

  return [role.name, role.title, role.label, role.slug, role.code].some((value) =>
    isSuperAdminRoleKey(normalizeRoleKey(value)),
  );
}

export function hasPermission(user, permission) {
  if (!permission) return true;
  if (isSuperAdminUser(user)) return true;
  // Exact match only — do not expand :own/:any into base (e.g. department:read:own ≠ department:read).
  return getUserPermissions(user).includes(permission);
}

export function hasAnyPermission(user, permissions = []) {
  if (!permissions.length) return true;
  if (isSuperAdminUser(user)) return true;
  const granted = getUserPermissions(user);
  return permissions.some((permission) => granted.includes(permission));
}

/** True if user has module:action, module:action:own, or module:action:any. */
export function canPerform(user, module, action) {
  return hasAnyPermission(user, [
    `${module}:${action}`,
    `${module}:${action}:own`,
    `${module}:${action}:scoped`,
    `${module}:${action}:any`,
  ]);
}

/**
 * Record-scoped check: :any or base can act on any record;
 * :own only when isOwnRecord is true.
 */
export function canPerformOnRecord(user, module, action, isOwnRecord = false) {
  if (isSuperAdminUser(user)) return true;
  if (hasPermission(user, `${module}:${action}:any`)) return true;
  if (hasPermission(user, `${module}:${action}:scoped`)) return true;
  if (hasPermission(user, `${module}:${action}`)) return true;
  if (isOwnRecord && hasPermission(user, `${module}:${action}:own`)) return true;
  return false;
}

export function canReadAllLeaves(user) {
  if (isSuperAdminUser(user)) return true;
  return hasPermission(user, 'leave:read:any') || hasPermission(user, 'leave:read');
}

export function canReviewLeaves(user) {
  if (isSuperAdminUser(user)) return true;
  return hasPermission(user, 'leave:update') || hasPermission(user, 'leave:update:any');
}

export function canCreateLeave(user) {
  return canPerform(user, 'leave', 'create');
}

export function canUpdateOwnLeave(user) {
  return hasAnyPermission(user, ['leave:update', 'leave:update:own']);
}

export function canDeleteOwnLeave(user) {
  return hasAnyPermission(user, ['leave:delete', 'leave:delete:own']);
}

export function canReadAllProjects(user) {
  if (isSuperAdminUser(user)) return true;
  return hasPermission(user, 'project:read:any');
}

export function canManageProjects(user) {
  if (isSuperAdminUser(user)) return true;
  const permissions = getUserPermissions(user);
  return (
    permissions.includes('project:create') ||
    permissions.includes('project:update') ||
    permissions.includes('project:delete') ||
    permissions.includes('project:read:any')
  );
}

export function canCreateProject(user) {
  return hasPermission(user, 'project:create');
}

export function canUpdateProject(user) {
  return hasPermission(user, 'project:update');
}

export function canDeleteProject(user) {
  return hasPermission(user, 'project:delete');
}

function collectSharedCreatorIds(user) {
  if (!user || typeof user !== 'object') return new Set();

  const ids = new Set();
  const potentialLists = [
    user.sharedCreatorIds,
    user.sharedUserIds,
    user.sharedAdminIds,
    user.grantedCreatorIds,
    user.grantedUserIds,
    user.adminSharedUsers,
    user.sharedUsers,
    user.sharedAdmins,
    user.adminAccess,
    user.sharedAccess,
    user.role?.sharedCreatorIds,
    user.role?.sharedUserIds,
    user.role?.sharedAdminIds,
    user.role?.grantedCreatorIds,
    user.role?.adminSharedUsers,
    user.employee?.sharedCreatorIds,
    user.employee?.sharedUserIds,
    user.employee?.adminSharedUsers,
  ];

  for (const candidate of potentialLists) {
    if (!candidate) continue;
    const items = Array.isArray(candidate) ? candidate : [candidate];
    items.forEach((item) => {
      if (!item) return;
      const source = typeof item === 'object' ? item : { _id: item };
      collectRefIdentityIds(source).forEach((id) => ids.add(id));
    });
  }

  return ids;
}

function getVisibleCreatorIdSet(user) {
  if (!user || typeof user !== 'object') return new Set();
  const ids = collectUserIdentityIds(user);
  const sharedIds = collectSharedCreatorIds(user);
  sharedIds.forEach((id) => ids.add(id));
  return ids;
}

export function canViewAllEmployeeRecords(user) {
  if (isSuperAdminUser(user)) return true;
  return hasAnyPermission(user, ['employee:read:any', 'employee:read:scoped']);
}

export function canViewAllDepartmentRecords(user) {
  if (isSuperAdminUser(user)) return true;
  return hasAnyPermission(user, [
    'department:read:any',
    'department:create:any',
    'assignment:read:any',
  ]);
}

/** Super Admin sees every employee; normal admins see their own created employees plus creators shared to them. */
export function getVisibleEmployees(employees, user) {
  if (canViewAllEmployeeRecords(user)) {
    return Array.isArray(employees) ? employees : [];
  }

  const employeeList = Array.isArray(employees) ? employees : [];
  if (!employeeList.some(recordHasCreatorReference)) return employeeList;

  const creatorIds = getVisibleCreatorIdSet(user);
  if (creatorIds.size === 0) return [];

  return employeeList.filter((employee) => {
    if (!employee || typeof employee !== 'object') return false;
    return isRecordCreatedByAnyUser(employee, creatorIds);
  });
}

export function getVisibleDepartments(departments, user) {
  if (canViewAllDepartmentRecords(user)) {
    return Array.isArray(departments) ? departments : [];
  }

  const creatorIds = getVisibleCreatorIdSet(user);
  if (creatorIds.size === 0) return [];

  return (Array.isArray(departments) ? departments : []).filter((department) => {
    if (!department || typeof department !== 'object') return false;
    return isRecordCreatedByAnyUser(department, creatorIds);
  });
}

/** Attendance, salary, leave, and similar rows linked to employees visible to the user. */
export function getVisibleEmployeeLinkedRecords(records, employees, user) {
  if (canViewAllEmployeeRecords(user)) return Array.isArray(records) ? records : [];
  const visibleEmployeeIds = new Set();
  const visibleEmployees = getVisibleEmployees(employees, user);
  visibleEmployees.forEach((employee) => {
    collectRefIdentityIds(employee).forEach((id) => visibleEmployeeIds.add(id));
  });
  return filterRecordsByCreatedEmployees(records, visibleEmployeeIds);
}

export function canDeleteEmployee(user, employee) {
  if (isSuperAdminUser(user)) return true;
  return canPerformOnRecord(
    user,
    'employee',
    'delete',
    isRecordCreatedByUser(employee, user),
  );
}

export function canCreateEmployee(user) {
  return canPerform(user, 'employee', 'create');
}

export function canUpdateEmployee(user) {
  return canPerform(user, 'employee', 'update');
}

export function canUpdateEmployeeRecord(user, employee) {
  if (isSuperAdminUser(user)) return true;
  return canPerformOnRecord(
    user,
    'employee',
    'update',
    isRecordCreatedByUser(employee, user),
  );
}

export function canReprocessAttendanceLogs(user) {
  return isSuperAdminUser(user);
}

export function canReadAttendanceLogs(user) {
  return isSuperAdminUser(user);
}

export function canReadAuditLogs(user) {
  if (isSuperAdminUser(user)) return true;
  return hasAnyPermission(user, AUDIT_LOG_ACCESS_PERMISSIONS);
}

export function canImportAttendance(user) {
  if (isSuperAdminUser(user)) return true;
  return hasAnyPermission(user, ATTENDANCE_IMPORT_ACCESS_PERMISSIONS);
}

export function hasPermissionPrefix(user, prefix) {
  if (!prefix) return true;
  if (isSuperAdminUser(user)) return true;

  const permissions = getUserPermissions(user);
  return permissions.some((permission) => permission.startsWith(prefix));
}

export function hasAnyPermissionPrefix(user, prefixes = []) {
  if (!prefixes.length) return true;
  return prefixes.some((prefix) => hasPermissionPrefix(user, prefix));
}

export function canAccessNavItem(user, item) {
  if (item.public) return true;
  if (item.superAdminOnly) return isSuperAdminUser(user);
  if (isSuperAdminUser(user)) return true;

  if (item.requiredAnyPermissions?.length) {
    if (!hasAnyPermission(user, item.requiredAnyPermissions)) return false;
  } else if (item.permissionPrefix) {
    if (!hasPermissionPrefix(user, item.permissionPrefix)) return false;
  } else {
    // No permission rule — hide from everyone except super admin / public items.
    return false;
  }

  if (item.requireCanManageAllAttendance && !canManageAllAttendance(user)) return false;
  return true;
}

export function filterNavItems(user, items) {
  if (!user) return [];
  if (isSuperAdminUser(user)) return items;
  return items.filter((item) => canAccessNavItem(user, item));
}

export function getAccessibleNavItems(user) {
  return filterNavItems(user, NAV_ITEMS);
}

export function getEmailVerificationPath() {
  return `${PROFILE_ITEM.path}?tab=account`;
}

export function getFirstAccessiblePath(user) {
  if (!user) return DASHBOARD_ITEM.path;

  for (const item of NAV_ITEMS) {
    if (canAccessNavItem(user, item)) {
      return item.path;
    }
  }

  return DASHBOARD_ITEM.path;
}

export function getDefaultPath(user) {
  if (user && !isEmailVerified(user)) {
    return getEmailVerificationPath();
  }
  return getFirstAccessiblePath(user);
}

export function canAccessPath(user, path) {
  if (path === PROFILE_ITEM.path || path === DASHBOARD_ITEM.path) {
    return true;
  }

  const navItem = NAV_ITEMS.find((item) => item.path === path);
  if (navItem?.public) return true;

  if (path === '/todos') {
    return hasAnyPermission(user, TODO_ACCESS_PERMISSIONS);
  }

  if (path === '/feedback') {
    return hasAnyPermission(user, FEEDBACK_ACCESS_PERMISSIONS);
  }

  if (!navItem) return false;

  return canAccessNavItem(user, navItem);
}

export function canExportData(user) {
  return hasAnyPermission(user, ['export:read', 'report:read']);
}
