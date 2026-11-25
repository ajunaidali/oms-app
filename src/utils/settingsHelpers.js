import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/apiClient.js';
import { API_ENDPOINTS } from '../api/apiConfig.js';
import { unwrapData } from './apiHelpers.js';
import { createCachedFetcher, getCachedResource } from './fetchCache.js';

const META_KEYS = new Set([
  'success',
  'message',
  'status',
  'count',
  'total',
  '_id',
  '__v',
  'id',
  'createdAt',
  'updatedAt',
]);

export const SETTING_GROUPS = {
  ATTENDANCE: 'Attendance',
  BIOMETRIC: 'Biometric',
  GENERAL: 'General',
  SYSTEM: 'System',
};

export const BOOLEAN_SETTING_KEYS = new Set([
  'manualAttendanceEnabled',
  'manualPunchMyAttendanceEnabled',
  'importAttendanceEnabled',
  'autoMarkAbsentEnabled',
]);

export const NUMBER_SETTING_KEYS = new Set([
  'allowedLateArrivals',
  'allowedEarlyDepartures',
]);

export const JSON_SETTING_KEYS = new Set(['leaveTypes']);

export const SETTING_ORDER = [
  'manualAttendanceEnabled',
  'manualPunchMyAttendanceEnabled',
  'importAttendanceEnabled',
  'autoMarkAbsentEnabled',
  'allowedLateArrivals',
  'allowedEarlyDepartures',
  'leaveTypes',
  'localServerIp',
];

export const SETTING_META = {
  manualAttendanceEnabled: {
    label: 'Manual Attendance',
    description: 'Allow attendance department to mark attendance manually.',
    group: SETTING_GROUPS.ATTENDANCE,
    featureSlug: 'manual-attendance',
  },
  manualPunchMyAttendanceEnabled: {
    label: 'Manual Punch My Attendance',
    description: 'Allow employees to mark check-in/check-out from My Attendance page',
    group: SETTING_GROUPS.ATTENDANCE,
  },
  importAttendanceEnabled: {
    label: 'Import Attendance',
    description: 'Allow attendance department to import attendance data',
    group: SETTING_GROUPS.ATTENDANCE,
  },
  autoMarkAbsentEnabled: {
    label: 'Auto Mark Absent',
    description: 'Automatically mark absent employees at end of day on the server',
    group: SETTING_GROUPS.ATTENDANCE,
  },
  allowedLateArrivals: {
    label: 'Allowed Late Arrivals',
    description: 'Monthly late arrivals allowed before salary deductions apply',
    group: SETTING_GROUPS.GENERAL,
  },
  allowedEarlyDepartures: {
    label: 'Allowed Early Departures',
    description: 'Monthly early departures allowed before salary deductions apply',
    group: SETTING_GROUPS.GENERAL,
  },
  leaveTypes: {
    label: 'Leave Types',
    description: 'Leave types and default annual limits',
    group: SETTING_GROUPS.GENERAL,
  },
  localServerIp: {
    label: 'Biometric Server Address',
    description: 'Local server URL used to connect with the biometric attendance device.',
    group: SETTING_GROUPS.BIOMETRIC,
  },
};

export function formatSettingLabel(key) {
  if (SETTING_META[key]?.label) return SETTING_META[key].label;
  if (!key) return '—';
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return null;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
}

function normalizeSetting(item) {
  if (!item) return null;

  if (typeof item === 'object' && (item.key != null || item.settingKey != null)) {
    const key = String(item.key ?? item.settingKey);
    return {
      key,
      value: item.value,
      description: item.description || SETTING_META[key]?.description || '',
      group: item.group || SETTING_META[key]?.group || SETTING_GROUPS.GENERAL,
    };
  }

  return null;
}

function objectToSettings(source) {
  return Object.entries(source)
    .filter(([key]) => !META_KEYS.has(key))
    .map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('value' in value || 'description' in value) {
          return normalizeSetting({ key, ...value });
        }
      }
      return normalizeSetting({ key, value });
    })
    .filter(Boolean);
}

export function unwrapSettings(response) {
  const data = unwrapData(response);

  if (Array.isArray(data)) {
    return data.map(normalizeSetting).filter(Boolean);
  }

  if (data && typeof data === 'object') {
    if (Array.isArray(data.settings)) {
      return data.settings.map(normalizeSetting).filter(Boolean);
    }

    if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
      return objectToSettings(data.settings);
    }

    if (Array.isArray(data.items)) {
      return data.items.map(normalizeSetting).filter(Boolean);
    }

    if (Array.isArray(data.results)) {
      return data.results.map(normalizeSetting).filter(Boolean);
    }

    if (Array.isArray(data.data)) {
      return data.data.map(normalizeSetting).filter(Boolean);
    }

    if (data.key != null && 'value' in data) {
      return [normalizeSetting(data)].filter(Boolean);
    }

    return objectToSettings(data);
  }

  return [];
}

export function isBooleanSetting(setting) {
  if (BOOLEAN_SETTING_KEYS.has(setting?.key)) return true;
  if (typeof setting?.value === 'boolean') return true;
  return false;
}

export function isNumberSetting(setting) {
  if (NUMBER_SETTING_KEYS.has(setting?.key)) return true;
  if (typeof setting?.value === 'number' && Number.isFinite(setting.value)) return true;
  return false;
}

export function isJsonSetting(setting) {
  return JSON_SETTING_KEYS.has(setting?.key);
}

export function valueToInput(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isGeneratedLeaveTypeKey(key) {
  return /^new-type(?:-\d+)?$/.test(String(key || ''));
}

function finalizeLeaveTypeSettings(types) {
  const usedKeys = new Set();

  return types.map((item) => {
    let key = String(item.key || '').trim();
    if (!key || isGeneratedLeaveTypeKey(key) || usedKeys.has(key)) {
      key = uniqueLeaveTypeKey(item.label || key, usedKeys);
    }
    usedKeys.add(key);

    const parsedLimit = Number(item.limit);
    return {
      key,
      label: String(item.label || '').trim(),
      limit: Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 0,
    };
  });
}

export function parseInputValue(rawValue, setting) {
  if (setting?.key === 'localServerIp') {
    return String(rawValue ?? '').trim();
  }

  if (isBooleanSetting(setting)) {
    return coerceBoolean(rawValue) === true;
  }

  if (isNumberSetting(setting)) {
    if (rawValue === '' || rawValue == null) return 0;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }

  if (isJsonSetting(setting)) {
    return finalizeLeaveTypeSettings(parseLeaveTypesInput(rawValue));
  }

  const originalValue = setting.value;

  if (typeof originalValue === 'number') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }

  if (originalValue && typeof originalValue === 'object') {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }

  return rawValue;
}

export function isSettingDraftDirty(draftValue, setting) {
  if (!setting) return false;

  if (isJsonSetting(setting)) {
    return (
      stringifyLeaveTypes(parseLeaveTypesInput(draftValue)) !==
      stringifyLeaveTypes(parseLeaveTypesInput(setting.value))
    );
  }

  const current = draftValue ?? valueToInput(setting.value);

  if (isBooleanSetting(setting)) {
    return coerceBoolean(current) !== coerceBoolean(setting.value);
  }

  if (isNumberSetting(setting)) {
    const draftNumber = current === '' || current == null ? 0 : Number(current);
    const savedNumber =
      setting.value === '' || setting.value == null ? 0 : Number(setting.value);
    if (Number.isFinite(draftNumber) && Number.isFinite(savedNumber)) {
      return draftNumber !== savedNumber;
    }
  }

  if (setting.key === 'localServerIp') {
    return String(current).trim() !== String(valueToInput(setting.value)).trim();
  }

  return current !== valueToInput(setting.value);
}

export function validateSettingInput(rawValue, setting) {
  if (setting?.key === 'localServerIp') {
    const trimmed = String(rawValue ?? '').trim();
    if (!trimmed) return { ok: true };
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'Biometric server address must start with http:// or https://' };
      }
    } catch {
      return { ok: false, error: 'Enter a valid URL, e.g. http://192.168.0.1' };
    }
  }

  if (isJsonSetting(setting)) {
    const types = parseLeaveTypesInput(rawValue);
    if (types.length === 0) {
      return { ok: false, error: 'Add at least one leave type' };
    }
    if (types.some((item) => !String(item.label || '').trim())) {
      return { ok: false, error: 'Each leave type needs a name' };
    }
    if (types.some((item) => !Number.isFinite(Number(item.limit)) || Number(item.limit) < 0)) {
      return { ok: false, error: 'Each leave type needs a valid annual limit' };
    }
    return { ok: true };
  }

  if (isNumberSetting(setting)) {
    if (rawValue === '' || rawValue == null) {
      return { ok: true };
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: 'Enter a valid non-negative number' };
    }
  }

  return { ok: true };
}

export function formatDisplayValue(value) {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value == null || value === '') return 'Not set';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function parseFeatureEnabled(response) {
  const data = unwrapData(response);

  if (typeof data === 'boolean') return data;
  if (typeof data?.enabled === 'boolean') return data.enabled;
  if (typeof data?.isEnabled === 'boolean') return data.isEnabled;
  if (typeof data?.manualAttendanceEnabled === 'boolean') {
    return data.manualAttendanceEnabled;
  }

  const coerced = coerceBoolean(data?.value);
  if (coerced !== null) return coerced;
  return null;
}

export function settingsToMap(settings) {
  return settings.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

export function getSettingBoolean(settingsMap, key, defaultValue = false) {
  const value = settingsMap?.[key];
  if (typeof value === 'boolean') return value;
  const coerced = coerceBoolean(value);
  return coerced ?? defaultValue;
}

export function getSettingNumber(settingsMap, key, defaultValue = 0) {
  const value = settingsMap?.[key];
  if (value == null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

const DEFAULT_LEAVE_TYPES = [
  { value: 'casual', label: 'Casual', limit: 10 },
  { value: 'sick', label: 'Sick', limit: 10 },
  { value: 'annual', label: 'Annual', limit: 10 },
  { value: 'unpaid', label: 'Unpaid', unlimited: true },
];

const FALLBACK_LEAVE_ALLOCATION = {
  casual: 10,
  sick: 10,
  annual: 10,
};

function leaveTypesFromSettings(settingsMap) {
  const raw = settingsMap?.leaveTypes;
  if (Array.isArray(raw)) return normalizeLeaveTypeSettings(raw);
  return parseLeaveTypesInput(raw);
}

export const DEFAULT_LEAVE_TYPE_SETTINGS = [
  { key: 'casual', label: 'Casual', limit: 10 },
  { key: 'sick', label: 'Sick', limit: 8 },
  { key: 'annual', label: 'Annual', limit: 14 },
];

export function slugifyLeaveTypeKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueLeaveTypeKey(label, existingKeys) {
  const base = slugifyLeaveTypeKey(label) || 'leave-type';
  if (!existingKeys.has(base)) return base;
  let suffix = 2;
  while (existingKeys.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function normalizeLeaveTypeSettings(items, { allowEmptyLimit = false } = {}) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => {
      if (typeof item === 'string') {
        const key = slugifyLeaveTypeKey(item) || `leave-type-${index + 1}`;
        return {
          key,
          label: item.charAt(0).toUpperCase() + item.slice(1),
          limit: allowEmptyLimit ? '' : 0,
        };
      }

      if (!item || typeof item !== 'object') return null;

      const key = String(item.key || item.value || item.type || '').trim();
      const label = String(item.label || key).trim();
      if (!key && !label) return null;

      if (allowEmptyLimit && (item.limit === '' || item.limit === null)) {
        return {
          key: key || slugifyLeaveTypeKey(label) || `leave-type-${index + 1}`,
          label: label || key,
          limit: '',
        };
      }

      const limit = Number(item.limit);
      return {
        key: key || slugifyLeaveTypeKey(label) || `leave-type-${index + 1}`,
        label: label || key,
        limit: Number.isFinite(limit) && limit >= 0 ? limit : 0,
      };
    })
    .filter(Boolean);
}

function leaveTypesFromObjectMap(source, options) {
  return normalizeLeaveTypeSettings(
    Object.entries(source).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { key, ...value };
      }
      return { key, label: formatSettingLabel(key), limit: Number(value) || 0 };
    }),
    options,
  );
}

export function parseLeaveTypesInput(rawValue, options = {}) {
  if (Array.isArray(rawValue)) return normalizeLeaveTypeSettings(rawValue, options);
  if (rawValue == null || rawValue === '') return [];

  let parsed = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) return normalizeLeaveTypeSettings(parsed, options);
  if (parsed && typeof parsed === 'object') return leaveTypesFromObjectMap(parsed, options);
  return [];
}

export function stringifyLeaveTypes(types) {
  return JSON.stringify(
    normalizeLeaveTypeSettings(types, { allowEmptyLimit: true }).map((item) => ({
      key: item.key,
      label: item.label,
      limit: item.limit === '' ? '' : Number(item.limit) || 0,
    })),
  );
}

export function createLeaveTypeSetting(existingTypes = []) {
  const existingKeys = new Set(existingTypes.map((item) => item.key));
  const key = uniqueLeaveTypeKey('New type', existingKeys);
  return { key, label: 'New type', limit: 0 };
}

export function getLeaveTypeAllocation(settingsMap) {
  const allocation = { ...FALLBACK_LEAVE_ALLOCATION };

  leaveTypesFromSettings(settingsMap).forEach((item) => {
    const key = String(item.key || '').toLowerCase();
    if (!key || key === 'unpaid') return;
    const limit = Number(item.limit);
    allocation[key] = Number.isFinite(limit) && limit >= 0 ? limit : allocation[key] ?? 0;
  });

  return allocation;
}

export function getLeaveTypeOptions(settingsMap) {
  const types = leaveTypesFromSettings(settingsMap);
  const options = (types.length > 0 ? types : DEFAULT_LEAVE_TYPE_SETTINGS).map((item) => {
    const value = String(item.key || item.value || '');
    const isUnpaid = value.toLowerCase() === 'unpaid';
    return {
      value,
      label: item.label || value.charAt(0).toUpperCase() + value.slice(1),
      limit: isUnpaid ? null : Number(item.limit) || 0,
      unlimited: isUnpaid,
    };
  });

  if (!options.some((item) => String(item.value).toLowerCase() === 'unpaid')) {
    options.push({ value: 'unpaid', label: 'Unpaid', limit: null, unlimited: true });
  }

  return options.length > 0 ? options : DEFAULT_LEAVE_TYPES;
}

export function compareSettingOrder(leftKey, rightKey) {
  const leftIndex = SETTING_ORDER.indexOf(leftKey);
  const rightIndex = SETTING_ORDER.indexOf(rightKey);
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  if (leftIndex !== -1) return -1;
  if (rightIndex !== -1) return 1;
  return leftKey.localeCompare(rightKey);
}

export async function fetchSettingsList() {
  const response = await apiClient.get(API_ENDPOINTS.SETTINGS.LIST);
  return unwrapSettings(response);
}

const settingsMapCache = getCachedResource('settings-map', () =>
  createCachedFetcher(async () => settingsToMap(await fetchSettingsList()), { ttlMs: 3 * 60 * 1000 }),
);

export function invalidateSettingsCache() {
  settingsMapCache.invalidate();
}

export async function fetchSettingsMap(force = false) {
  return settingsMapCache.load(force);
}

export function useAppSettings() {
  const [settingsMap, setSettingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setSettingsMap(await fetchSettingsMap(force));
      setLoadFailed(false);
    } catch {
      setSettingsMap({});
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const getBoolean = useCallback(
    (key, defaultValue = false) => getSettingBoolean(settingsMap, key, defaultValue),
    [settingsMap],
  );

  const getNumber = useCallback(
    (key, defaultValue = 0) => getSettingNumber(settingsMap, key, defaultValue),
    [settingsMap],
  );

  return { settingsMap, loading, loadFailed, reload, getBoolean, getNumber };
}
