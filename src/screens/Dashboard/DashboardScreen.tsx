import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import { Banner, LoadingBlock, ScreenBody, StatGrid } from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { colors, radius, type } from '../../theme/theme';
import { parseUnreadCount, unwrapData, unwrapList } from '../../utils/apiHelpers';
import {
  canManageAllAttendance,
  computeTodayAttendanceStatsFromRecords,
  fetchEmployeesListCached,
  fetchMyAttendanceRecords,
  getTodayDateValue,
  isSuperAdminUser,
  unwrapAttendanceList,
} from '../../utils/attendanceHelpers';
import { getAccessibleNavItems, getUserRoleLabel, hasAnyPermission } from '../../utils/permissionHelpers';
import {
  ASSET_MANAGEMENT_ACCESS_PERMISSIONS,
  ATTENDANCE_SELF_SERVICE_PERMISSIONS,
  TASKS_SELF_SERVICE_PERMISSIONS,
  TICKETS_SELF_SERVICE_PERMISSIONS,
} from '../../config/permissions';
import { perfMarkEnd, perfMarkStart } from '../../utils/perfMark';

const GUIDE = 'https://management.offtheschool.io/OMS-User-Guide.pdf';

function pickNumber(source: any, keys: string[]) {
  const data = unwrapData(source) || source;
  if (data == null) return null;
  if (typeof data === 'number') return data;
  if (typeof data !== 'object') return null;
  for (const key of keys) {
    const value = Number(data[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

const MODULES = [
  {
    id: 'tasks',
    title: 'Tasks',
    route: 'Tasks',
    permissions: TASKS_SELF_SERVICE_PERMISSIONS,
    cards: [
      { label: 'Total', keys: ['total', 'totalTasks', 'count'] },
      { label: 'To Do', keys: ['todo', 'toDo', 'pending'] },
      { label: 'In Progress', keys: ['inProgress', 'in_progress'] },
      { label: 'Completed', keys: ['completed', 'done', 'closed'] },
    ],
    load: () => apiClient.get(API_ENDPOINTS.TASKS.STATS),
  },
  {
    id: 'tickets',
    title: 'Tickets',
    route: 'Tickets',
    permissions: TICKETS_SELF_SERVICE_PERMISSIONS,
    cards: [
      { label: 'Total', keys: ['total', 'totalTickets', 'count'] },
      { label: 'Open', keys: ['open'] },
      { label: 'In Progress', keys: ['inProgress', 'in_progress'] },
      { label: 'Resolved', keys: ['resolved', 'closed', 'resolvedOrClosed'] },
    ],
    load: () => apiClient.get(API_ENDPOINTS.TICKETS.STATS),
  },
  {
    id: 'assets',
    title: 'Assets',
    route: 'Assets',
    permissions: ASSET_MANAGEMENT_ACCESS_PERMISSIONS,
    cards: [
      { label: 'Total', keys: ['total', 'totalAssets'] },
      { label: 'Available', keys: ['available'] },
      { label: 'Assigned', keys: ['assigned', 'issued'] },
      { label: 'Maintenance', keys: ['maintenance'] },
    ],
    load: () => apiClient.get(API_ENDPOINTS.ASSETS.STATS),
  },
  {
    id: 'notifications',
    title: 'Notifications',
    route: 'Notifications',
    permissions: [],
    cards: [{ label: 'Unread', keys: ['count', 'unreadCount', 'unread'] }],
    load: async () => parseUnreadCount(await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT)),
  },
];

async function loadAttendance(user: any) {
  const today = getTodayDateValue();
  if (!isSuperAdminUser(user) && !canManageAllAttendance(user)) {
    const records = await fetchMyAttendanceRecords({ date: today });
    return computeTodayAttendanceStatsFromRecords(records, 1);
  }
  const [todayResult, employeesResult] = await Promise.allSettled([
    apiClient.get(API_ENDPOINTS.ATTENDANCE.TODAY),
    fetchEmployeesListCached(),
  ]);
  const employees = employeesResult.status === 'fulfilled' ? employeesResult.value : [];
  const records = todayResult.status === 'fulfilled' ? unwrapAttendanceList(todayResult.value) : [];
  if (todayResult.status === 'rejected' && !records.length) throw todayResult.reason;
  return computeTodayAttendanceStatsFromRecords(records, employees.length || records.length);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(
    () => MODULES.filter(module => hasAnyPermission(user, module.permissions)),
    [user],
  );
  const links = useMemo(() => getAccessibleNavItems(user), [user]);
  const showAttendance = hasAnyPermission(user, ATTENDANCE_SELF_SERVICE_PERMISSIONS);

  const load = useCallback(async () => {
    perfMarkStart('dashboard');
    const next: Record<string, any> = {};
    const nextErrors: Record<string, string> = {};
    const jobs = visible.map(async module => {
      try {
        next[module.id] = await module.load();
      } catch {
        nextErrors[module.id] = 'Could not load stats';
      }
    });
    if (showAttendance) {
      jobs.push(
        loadAttendance(user)
          .then(value => {
            next.attendance = value;
          })
          .catch(() => {
            nextErrors.attendance = 'Could not load attendance stats';
          }),
      );
    }
    await Promise.all(jobs);
    setStats(next);
    setErrors(nextErrors);
    perfMarkEnd('dashboard');
  }, [showAttendance, user, visible]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const first = String(user?.name || user?.fullName || 'there').trim().split(/\s+/)[0] || 'there';
  const role = getUserRoleLabel(user);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ScreenBody onRefresh={refresh} refreshing={refreshing}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Workspace overview</Text>
        <Text style={styles.heroTitle}>{greeting()}, {first}</Text>
        <Text style={styles.heroBody}>A live snapshot of work, people, and alerts across your modules.</Text>
        <View style={styles.chips}>
          <Text style={styles.chip}>{today}</Text>
          {role ? <Text style={styles.chip}>{role}</Text> : null}
        </View>
        <Pressable style={styles.refresh} onPress={refresh} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.guide} onPress={() => Linking.openURL(GUIDE)} accessibilityRole="link">
        <Text style={styles.guideKicker}>User document</Text>
        <Text style={styles.guideTitle}>OMS User Guide</Text>
        <Text style={styles.guideBody}>Complete guide for employees, managers, and HR administrators — attendance, leaves, tickets, studio bookings, and more.</Text>
        <Text style={styles.guideLink}>Download PDF</Text>
      </Pressable>
      {loading ? <LoadingBlock label="Loading workspace..." /> : null}
      {showAttendance ? (
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>Attendance Today</Text>
            <Pressable onPress={() => navigation.navigate(canManageAllAttendance(user) ? 'Attendance' : 'MyAttendance')}>
              <Text style={styles.open}>Open</Text>
            </Pressable>
          </View>
          {errors.attendance ? <Banner kind="error" message={errors.attendance} /> : (
            <StatGrid
              items={[
                { label: 'Present', value: stats.attendance?.todayPresent ?? '—' },
                { label: 'Checked Out', value: stats.attendance?.checkedOut ?? '—' },
                { label: 'Pending', value: stats.attendance?.stillWorking ?? '—' },
                { label: 'Total Users', value: stats.attendance?.totalUsers ?? '—' },
              ]}
            />
          )}
        </View>
      ) : null}
      {visible.map(module => (
        <View key={module.id} style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>{module.title}</Text>
            <Pressable onPress={() => navigation.navigate(module.route)}>
              <Text style={styles.open}>Open</Text>
            </Pressable>
          </View>
          {errors[module.id] ? <Banner kind="error" message={errors[module.id]} /> : (
            <StatGrid
              items={module.cards.map(card => ({
                label: card.label,
                value: module.id === 'notifications' && typeof stats[module.id] === 'number'
                  ? stats[module.id]
                  : pickNumber(stats[module.id], card.keys) ?? '—',
              }))}
            />
          )}
        </View>
      ))}
      <Text style={styles.section}>Quick access</Text>
      <View style={styles.links}>
        {links.map((item: any) => (
          <Pressable key={item.id} style={styles.link} onPress={() => navigation.navigate(routeForPath(item.path))}>
            <Text style={styles.linkText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScreenBody>
  );
}

export function routeForPath(path: string) {
  const map: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/department': 'Department',
    '/employee': 'Employee',
    '/positions': 'Positions',
    '/department-assignment': 'Assignment',
    '/role': 'Roles',
    '/my-attendance': 'MyAttendance',
    '/attendance': 'Attendance',
    '/attendance-import': 'AttendanceImport',
    '/attendance-logs': 'AttendanceLogs',
    '/leaves': 'Leaves',
    '/leave-balance': 'LeaveBalance',
    '/todos': 'Todos',
    '/policy': 'Policy',
    '/reports': 'Reports',
    '/settings': 'Settings',
    '/profile': 'Profile',
    '/notification': 'Notifications',
    '/salary': 'Salary',
    '/tickets': 'Tickets',
    '/assets': 'Assets',
    '/projects': 'Projects',
    '/tasks': 'Tasks',
    '/studio-bookings': 'Studio',
    '/export-center': 'Export',
    '/audit-logs': 'Audit',
    '/uploads': 'Uploads',
    '/email-templates': 'EmailTemplates',
    '/resources': 'Resources',
    '/feedback': 'Feedback',
  };
  return map[path] || 'Dashboard';
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 22, backgroundColor: '#1e736b', gap: 8, overflow: 'hidden' },
  kicker: { color: 'rgba(255,255,255,0.72)', fontFamily: type.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontFamily: type.bold, fontSize: 26 },
  heroBody: { color: 'rgba(255,255,255,0.86)', fontFamily: type.regular, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    color: '#fff',
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: type.semibold,
    fontSize: 12,
  },
  refresh: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 6 },
  refreshText: { color: '#155e58', fontFamily: type.bold, fontSize: 13 },
  guide: { backgroundColor: colors.white, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 },
  guideKicker: { color: colors.primaryDark, fontFamily: type.bold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  guideTitle: { color: colors.text, fontFamily: type.bold, fontSize: 18 },
  guideBody: { color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 18 },
  guideLink: { color: colors.teal, fontFamily: type.bold, marginTop: 4 },
  block: { gap: 10 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { color: colors.text, fontFamily: type.bold, fontSize: 16 },
  open: { color: colors.primaryDark, fontFamily: type.bold },
  section: { color: colors.text, fontFamily: type.bold, fontSize: 16, marginTop: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  linkText: { color: colors.tealDark, fontFamily: type.semibold, fontSize: 13 },
});
