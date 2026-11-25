export const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DEFAULT_DAY = {
  isOff: false,
  checkInTime: '09:00',
  checkOutTime: '17:00',
};

export const DEFAULT_SCHEDULE_FORM = WEEK_DAYS.reduce((schedule, day) => {
  schedule[day] = {
    ...DEFAULT_DAY,
    isOff: day === 'Sunday',
  };
  return schedule;
}, {});

function normalizeTime(value) {
  const minutes = parseWallClockMinutes(value);
  if (minutes == null) return '';
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function parseWallClockMinutes(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value < 24) return Math.round(value * 60);
    if (value >= 0 && value < 24 * 60) return Math.round(value);
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const period = ampm[3].toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  return null;
}

function timeToMinutes(value) {
  return parseWallClockMinutes(value);
}

const MINUTES_PER_DAY = 24 * 60;
// Must match the backend validator / Assignment model limit.
export const MAX_DEDUP_MINUTES = 720;

function durationMinutes(checkInMinutes, checkOutMinutes) {
  if (checkInMinutes == null || checkOutMinutes == null) return null;
  if (checkInMinutes === checkOutMinutes) return 0;
  const diff = checkOutMinutes - checkInMinutes;
  return diff < 0 ? diff + MINUTES_PER_DAY : diff;
}

export function workScheduleToForm(workSchedule) {
  return WEEK_DAYS.reduce((schedule, day) => {
    const config = workSchedule?.[day];

    if (config?.isOff) {
      schedule[day] = {
        isOff: true,
        checkInTime: normalizeTime(config.checkInTime) || DEFAULT_DAY.checkInTime,
        checkOutTime: normalizeTime(config.checkOutTime) || DEFAULT_DAY.checkOutTime,
      };
      return schedule;
    }

    schedule[day] = {
      isOff: false,
      checkInTime: normalizeTime(config?.checkInTime) || DEFAULT_DAY.checkInTime,
      checkOutTime: normalizeTime(config?.checkOutTime) || DEFAULT_DAY.checkOutTime,
    };
    return schedule;
  }, {});
}

/** Check-in/out shared by every working day, or null when the days differ (or none work). */
export function getUniformTiming(scheduleForm) {
  const workingDays = WEEK_DAYS.map((day) => scheduleForm?.[day]).filter(
    (dayConfig) => dayConfig && !dayConfig.isOff,
  );
  if (workingDays.length === 0) return null;

  const checkInTime = normalizeTime(workingDays[0].checkInTime);
  const checkOutTime = normalizeTime(workingDays[0].checkOutTime);
  const allSame = workingDays.every(
    (dayConfig) =>
      normalizeTime(dayConfig.checkInTime) === checkInTime &&
      normalizeTime(dayConfig.checkOutTime) === checkOutTime,
  );
  return allSame ? { checkInTime, checkOutTime } : null;
}

/** Timing to start "same timing for all days" from: the first working day, else the default. */
export function getFirstWorkingTiming(scheduleForm) {
  const firstWorking = WEEK_DAYS.map((day) => scheduleForm?.[day]).find(
    (dayConfig) => dayConfig && !dayConfig.isOff,
  );
  const source = firstWorking || DEFAULT_DAY;
  return { checkInTime: source.checkInTime, checkOutTime: source.checkOutTime };
}

/**
 * Copy one check-in/check-out to every day. Off days stay off but carry the timing,
 * so a day switched back on later gets the shared timing too.
 */
export function applyUniformTiming(scheduleForm, { checkInTime, checkOutTime }) {
  return WEEK_DAYS.reduce((schedule, day) => {
    const current = scheduleForm?.[day] || DEFAULT_DAY;
    schedule[day] = { ...current, checkInTime, checkOutTime };
    return schedule;
  }, {});
}

export function buildWorkSchedule(scheduleForm) {
  const schedule = {};

  for (const day of WEEK_DAYS) {
    const dayConfig = scheduleForm[day] || DEFAULT_DAY;

    if (dayConfig.isOff) {
      schedule[day] = { isOff: true };
    } else {
      schedule[day] = {
        checkInTime: normalizeTime(dayConfig.checkInTime),
        checkOutTime: normalizeTime(dayConfig.checkOutTime),
      };
    }
  }

  return schedule;
}

export function validateAssignmentForm(form, scheduleForm) {
  if (!form.employee || !form.department || !form.position) {
    return 'Employee, department, and position are required';
  }

  const dedupMinutes = Number(form.settimestampMinutes);
  if (!Number.isInteger(dedupMinutes) || dedupMinutes < 1) {
    return 'Dedup window must be a whole number of at least 1 minute';
  }
  if (dedupMinutes > MAX_DEDUP_MINUTES) {
    return `Dedup window cannot exceed ${MAX_DEDUP_MINUTES} minutes (12 hours)`;
  }

  let workingDayCount = 0;

  for (const day of WEEK_DAYS) {
    const dayConfig = scheduleForm[day];
    if (!dayConfig) {
      return `Schedule for ${day} is required`;
    }

    if (dayConfig.isOff) {
      continue;
    }

    const checkInTime = normalizeTime(dayConfig.checkInTime);
    const checkOutTime = normalizeTime(dayConfig.checkOutTime);

    if (!checkInTime || !checkOutTime) {
      return `${day}: check-in and check-out times are required`;
    }

    const checkInMinutes = timeToMinutes(checkInTime);
    const checkOutMinutes = timeToMinutes(checkOutTime);

    if (checkInMinutes == null || checkOutMinutes == null) {
      return `${day}: enter valid check-in and check-out times`;
    }

    if (durationMinutes(checkInMinutes, checkOutMinutes) === 0) {
      return `${day}: check-out must be different from check-in`;
    }

    workingDayCount += 1;
  }

  if (workingDayCount === 0) {
    return 'At least one working day is required';
  }

  return '';
}

export function buildAssignmentPayload(form, scheduleForm) {
  return {
    employee: form.employee,
    department: form.department,
    position: form.position,
    workSchedule: buildWorkSchedule(scheduleForm),
    isPrimary: form.isPrimary === 'true' || form.isPrimary === true,
    settimestampMinutes: Number(form.settimestampMinutes) || 180,
  };
}

export function formatWorkScheduleSummary(workSchedule) {
  if (!workSchedule || typeof workSchedule !== 'object') return '—';

  const offDays = [];
  const workingDays = [];

  for (const day of WEEK_DAYS) {
    const config = workSchedule[day];
    if (!config) continue;

    if (config.isOff) {
      offDays.push(day.slice(0, 3));
    } else if (config.checkInTime && config.checkOutTime) {
      workingDays.push(`${day.slice(0, 3)} ${config.checkInTime}–${config.checkOutTime}`);
    }
  }

  if (workingDays.length === 0) return '—';
  const sample = workingDays[0];
  const allSame = workingDays.every((entry) => entry.slice(4) === sample.slice(4));
  const offLabel = offDays.length ? ` (off: ${offDays.join(', ')})` : '';
  return allSame ? `${sample.slice(4)}${offLabel}` : `${workingDays.length} day(s)${offLabel}`;
}

export function formatDisplayTime(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return '—';
  const [hours, minutes] = normalized.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function getWorkScheduleForDateKey(workSchedule, dateKey, dayName = '') {
  if (!workSchedule || typeof workSchedule !== 'object') return null;

  let resolvedDay = String(dayName || '').trim();
  if (!resolvedDay && dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime())) {
      resolvedDay = WEEK_DAYS[(date.getDay() + 6) % 7];
    }
  }
  if (!resolvedDay) return null;

  const shortDay = resolvedDay.slice(0, 3);
  const aliases = [resolvedDay, resolvedDay.toLowerCase(), shortDay, shortDay.toLowerCase()];

  let config;
  if (Array.isArray(workSchedule)) {
    config = workSchedule.find((item) => {
      const label = String(item?.day || item?.name || item?.weekday || '').trim();
      return aliases.some((alias) => label.toLowerCase() === String(alias).toLowerCase());
    });
  } else {
    const nested = workSchedule.days || workSchedule.week || workSchedule.schedule || workSchedule;
    config = aliases.map((alias) => nested?.[alias]).find(Boolean) || null;
  }

  if (!config) return null;
  if (config.isOff || config.off || config.is_off) {
    return { isOff: true, checkInMinutes: null, checkOutMinutes: null };
  }

  const checkInMinutes = timeToMinutes(
    config.checkInTime ||
      config.check_in_time ||
      config.checkIn ||
      config.inTime ||
      config.startTime ||
      config.checkInMinutes,
  );
  const checkOutMinutes = timeToMinutes(
    config.checkOutTime ||
      config.check_out_time ||
      config.checkOut ||
      config.outTime ||
      config.endTime ||
      config.checkOutMinutes,
  );

  return {
    isOff: false,
    checkInMinutes,
    checkOutMinutes,
  };
}

export function getWorkScheduleRows(workSchedule) {
  return WEEK_DAYS.map((day) => {
    const config = workSchedule?.[day];
    const isOff = !config || config.isOff;
    const checkInTime = isOff ? null : normalizeTime(config?.checkInTime);
    const checkOutTime = isOff ? null : normalizeTime(config?.checkOutTime);
    let durationHours = null;

    if (checkInTime && checkOutTime) {
      const inMinutes = timeToMinutes(checkInTime);
      const outMinutes = timeToMinutes(checkOutTime);
      const minutes = durationMinutes(inMinutes, outMinutes);
      if (minutes > 0) {
        durationHours = (minutes / 60).toFixed(1);
      }
    }

    return {
      day,
      shortDay: day.slice(0, 3),
      isOff,
      checkInTime,
      checkOutTime,
      durationHours,
    };
  });
}

export function countWorkingDays(workSchedule) {
  return getWorkScheduleRows(workSchedule).filter((row) => !row.isOff).length;
}
