import apiClient from '../api/apiClient.js';
import { API_ENDPOINTS } from '../api/apiConfig.js';
import { getRecordId, unwrapList } from './apiHelpers.js';

/** Matches backend MAX_PODCAST_SHOOT_MINUTES. */
export const MAX_PODCAST_SHOOT_MINUTES = 180;

export function addHoursToTime(timeValue, hoursToAdd) {
  const startMin = parseTimeToMinutes(timeValue);
  if (startMin == null) return '';
  const total = startMin + hoursToAdd * 60;
  if (total < 0 || total >= 24 * 60) return '';
  return minutesToHhMm(total);
}

export function minutesToHhMm(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Normalize HTML time / API time to HH:mm. */
export function normalizeHhMm(value) {
  const minutes = parseTimeToMinutes(value);
  if (minutes == null) return '';
  return minutesToHhMm(minutes);
}

export function parseTimeToMinutes(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value < 24 * 60) return Math.floor(value);
  }
  const raw = String(value).trim();
  const twelve = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (twelve) {
    let hours = Number(twelve[1]);
    const minutes = Number(twelve[2]);
    const meridiem = twelve[3].toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function normalizeStudioDateKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return getLocalDateKey(date);
  return '';
}

export function getBookingStartTime(booking) {
  return (
    booking?.startTime ||
    booking?.start ||
    booking?.fromTime ||
    booking?.timeFrom ||
    ''
  );
}

export function getBookingEndTime(booking) {
  if (!booking) return '';
  const explicit =
    booking.endTime || booking.end || booking.toTime || booking.timeTo || '';
  if (explicit) {
    const match = String(explicit).trim().match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
    }
  }

  const startRaw = String(getBookingStartTime(booking)).trim();
  const startSlice = startRaw.match(/^(\d{1,2}):(\d{2})/);
  const startHhMm = startSlice
    ? `${String(Number(startSlice[1])).padStart(2, '0')}:${startSlice[2]}`
    : '';

  const preset = String(
    booking.durationPreset || booking.duration || booking.durationHours || '',
  )
    .trim()
    .toLowerCase();
  const hours = Number(String(preset).replace(/h(ours?)?$/, ''));
  if (Number.isFinite(hours) && hours > 0 && startHhMm) {
    return addHoursToTime(startHhMm, hours);
  }
  if (startHhMm) {
    return addHoursToTime(startHhMm, 3);
  }
  return '';
}

export function getStudioBookingStatus(booking) {
  if (booking?.status) return String(booking.status).toLowerCase();
  if (String(booking?.type || '').toLowerCase() === 'podcast') return 'pending';
  return 'booked';
}

/** Pending + booked both hold the calendar slot (matches backend). */
export function isSlotHoldingBooking(booking) {
  const status = getStudioBookingStatus(booking);
  return status === 'booked' || status === 'pending';
}

export function getBookingWindowMinutes(booking) {
  if (!booking) return null;
  if (booking.fullDay || booking.isFullDay) {
    return { start: 0, end: 24 * 60 };
  }

  const start = parseTimeToMinutes(getBookingStartTime(booking));
  if (start == null) {
    // Legacy rows without a start time blocked the whole day.
    return { start: 0, end: 24 * 60 };
  }

  let end = parseTimeToMinutes(getBookingEndTime(booking));
  if (end == null || end <= start) {
    end = Math.min(start + MAX_PODCAST_SHOOT_MINUTES, 24 * 60);
  }

  return { start, end };
}

export function findOverlappingStudioBooking(candidates, startMin, endMin) {
  if (startMin == null || endMin == null || endMin <= startMin) return null;

  for (const booking of candidates || []) {
    if (!isSlotHoldingBooking(booking)) continue;
    const window = getBookingWindowMinutes(booking);
    if (!window) continue;
    if (startMin < window.end && window.start < endMin) return booking;
  }

  return null;
}

export function formatStudioTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours)) return raw;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function formatStudioBookingTime(booking) {
  if (!booking) return '—';
  if (booking.fullDay || booking.isFullDay) return 'Full day';

  const start = formatStudioTime(getBookingStartTime(booking));
  if (!start) return '—';

  const endRaw = booking.endTime || booking.end || getBookingEndTime(booking);
  if (endRaw) {
    const end = formatStudioTime(endRaw);
    if (end) return `${start} – ${end}`;
  }

  if (booking.durationPreset) {
    return `${start} · ${String(booking.durationPreset).toUpperCase()}`;
  }

  return start;
}

/** True when a booked studio session (shoot or podcast) is happening right now. */
export function isLiveStudioBooking(booking, now = new Date()) {
  if (!booking) return false;

  const type = String(booking.type || '').toLowerCase();
  if (type !== 'shoot' && type !== 'podcast') return false;

  const status = getStudioBookingStatus(booking);
  // Only confirmed bookings — pending podcasts are not live yet.
  if (status !== 'booked') return false;
  if (normalizeStudioDateKey(booking.date) !== getLocalDateKey(now)) return false;

  if (booking.fullDay || booking.isFullDay) return true;

  const startMin = parseTimeToMinutes(getBookingStartTime(booking));
  let endMin = parseTimeToMinutes(getBookingEndTime(booking));
  if (startMin == null) return false;
  if (endMin == null || endMin <= startMin) {
    endMin = startMin + 3 * 60;
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= startMin && nowMin <= endMin;
}

/** @deprecated use isLiveStudioBooking */
export function isLiveShoot(booking, now = new Date()) {
  return isLiveStudioBooking(booking, now);
}

export function getLiveShootBookingKey(booking) {
  return (
    getRecordId(booking) ||
    `${normalizeStudioDateKey(booking?.date)}-${booking?.title}-${getBookingStartTime(booking)}`
  );
}

export async function fetchTodayStudioBookings() {
  const today = getLocalDateKey();
  const params = new URLSearchParams({ from: today, to: today });
  const response = await apiClient.get(
    `${API_ENDPOINTS.STUDIO_BOOKINGS.LIST}?${params.toString()}`,
  );
  return unwrapList(response);
}
