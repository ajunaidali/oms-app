import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  NotebookPen,
  Package,
  ScrollText,
  Settings,
  Shield,
  Ticket,
  Upload,
  Users,
  Wallet,
  Clapperboard,
  MessageSquare,
  FolderOpen,
  UserRound,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, type } from '../../theme/theme';
import { isEmailVerified } from '../../utils/apiHelpers';
import { getAccessibleNavItems, getUserRoleLabel, hasAnyPermission, isSuperAdminUser } from '../../utils/permissionHelpers';
import {
  ASSET_MANAGEMENT_ACCESS_PERMISSIONS,
  AUDIT_LOG_ACCESS_PERMISSIONS,
  EMAIL_TEMPLATE_ACCESS_PERMISSIONS,
  FEEDBACK_ACCESS_PERMISSIONS,
  PROJECT_SELF_SERVICE_PERMISSIONS,
  RESOURCES_ACCESS_PERMISSIONS,
  SALARY_MANAGEMENT_ACCESS_PERMISSIONS,
  STUDIO_BOOKING_ACCESS_PERMISSIONS,
  TASKS_SELF_SERVICE_PERMISSIONS,
  TICKETS_SELF_SERVICE_PERMISSIONS,
  UPLOADS_ACCESS_PERMISSIONS,
} from '../../config/permissions';
import { initials } from '../../utils/display';

const logo = require('../../assets/logos/logoOnly.webp');

export const PATH_TO_ROUTE: Record<string, string> = {
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
};

const ROUTE_ICONS: Record<string, any> = {
  Dashboard: LayoutDashboard,
  Department: Building2,
  Employee: Users,
  Positions: BriefcaseBusiness,
  Assignment: MapPin,
  Roles: Shield,
  MyAttendance: CalendarDays,
  Attendance: CalendarDays,
  AttendanceImport: Upload,
  AttendanceLogs: ClipboardList,
  Leaves: NotebookPen,
  LeaveBalance: ClipboardList,
  Todos: FileText,
  Policy: ScrollText,
  Reports: ClipboardList,
  Settings: Settings,
  Salary: Wallet,
  Tickets: Ticket,
  Assets: Package,
  Projects: FolderKanban,
  Tasks: ClipboardList,
  Studio: Clapperboard,
  Feedback: MessageSquare,
  Resources: FolderOpen,
  Uploads: Upload,
  EmailTemplates: Mail,
  Export: Upload,
  Audit: Shield,
  Profile: UserRound,
};

const MORE = [
  { label: 'Salary', route: 'Salary', permissions: SALARY_MANAGEMENT_ACCESS_PERMISSIONS },
  { label: 'Tickets', route: 'Tickets', permissions: TICKETS_SELF_SERVICE_PERMISSIONS },
  { label: 'Assets', route: 'Assets', permissions: ASSET_MANAGEMENT_ACCESS_PERMISSIONS },
  { label: 'Projects', route: 'Projects', permissions: PROJECT_SELF_SERVICE_PERMISSIONS },
  { label: 'Tasks', route: 'Tasks', permissions: TASKS_SELF_SERVICE_PERMISSIONS },
  { label: 'Studio Bookings', route: 'Studio', permissions: STUDIO_BOOKING_ACCESS_PERMISSIONS },
  { label: 'Feedback', route: 'Feedback', permissions: FEEDBACK_ACCESS_PERMISSIONS },
  { label: 'Resources', route: 'Resources', permissions: RESOURCES_ACCESS_PERMISSIONS },
  { label: 'Uploads', route: 'Uploads', permissions: UPLOADS_ACCESS_PERMISSIONS },
  { label: 'Email Templates', route: 'EmailTemplates', permissions: EMAIL_TEMPLATE_ACCESS_PERMISSIONS },
  { label: 'Export Center', route: 'Export', permissions: ['report:read', 'export:read'] },
  { label: 'Audit Logs', route: 'Audit', permissions: AUDIT_LOG_ACCESS_PERMISSIONS, superAdmin: true },
];

function needsVerification(user: any) {
  if (!user) return false;
  if (user.isEmailVerified == null && user.emailVerified == null) return false;
  return !isEmailVerified(user);
}

function DrawerLink({
  label,
  route,
  onPress,
  active,
}: {
  label: string;
  route?: string;
  onPress: () => void;
  active: boolean;
}) {
  const Icon = (route && ROUTE_ICONS[route]) || LayoutDashboard;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.link, active && styles.linkActive, pressed && !active && styles.linkPressed]}
      accessibilityRole="button">
      <View style={[styles.activeBar, active && styles.activeBarOn]} />
      <Icon size={18} color={active ? colors.primary : 'rgba(255,255,255,0.62)'} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.linkText, active && styles.linkTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function AppDrawer(props: any) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const locked = needsVerification(user);
  const items = getAccessibleNavItems(user);
  const more = MORE.filter(item => {
    if (item.superAdmin && !isSuperAdminUser(user)) return false;
    return hasAnyPermission(user, item.permissions);
  });
  const activeName = props.state.routes[props.state.index]?.name;
  const name = user?.name || 'OTS User';
  const role = getUserRoleLabel(user) || 'Management System';

  return (
    <View style={styles.root}>
      <View style={[styles.brand, { paddingTop: Math.max(insets.top, 10) + 8 }]}>
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}>
            <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="OTS logo" />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle} numberOfLines={1}>Management System</Text>
            <Text style={styles.brandHint}>OTS Studio</Text>
          </View>
          <Pressable
            onPress={() => props.navigation.closeDrawer()}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close drawer"
            hitSlop={8}>
            <X size={16} color="rgba(255,255,255,0.85)" strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scroll}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}>
        {!locked ? (
          <>
            <Text style={styles.section}>Workspace</Text>
            <DrawerLink label="Dashboard" route="Dashboard" active={activeName === 'Dashboard'} onPress={() => props.navigation.navigate('Dashboard')} />
            {items.map((item: any) => {
              const route = PATH_TO_ROUTE[item.path];
              if (!route) return null;
              return (
                <DrawerLink
                  key={item.id}
                  label={item.label}
                  route={route}
                  active={activeName === route}
                  onPress={() => props.navigation.navigate(route)}
                />
              );
            })}
          </>
        ) : null}

        {!locked && more.length ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.section}>More modules</Text>
            {more.map(item => (
              <DrawerLink
                key={item.route}
                label={item.label}
                route={item.route}
                active={activeName === item.route}
                onPress={() => props.navigation.navigate(item.route)}
              />
            ))}
          </>
        ) : null}
      </DrawerContentScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={() => props.navigation.navigate('Profile')}
          style={({ pressed }) => [styles.profile, activeName === 'Profile' && styles.profileActive, pressed && styles.linkPressed]}
          accessibilityRole="button">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View style={styles.userCopy}>
            <Text style={styles.userName} numberOfLines={1}>{name}</Text>
            <Text style={styles.userRole} numberOfLines={1}>
              {role}{user?.employeeId ? ` · ${user.employeeId}` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={signOut} style={({ pressed }) => [styles.logout, pressed && styles.pressed]} accessibilityRole="button">
          <LogOut size={16} color={colors.white} strokeWidth={2.2} />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#184f4a' },
  brand: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 32, height: 32 },
  brandCopy: { flex: 1, minWidth: 0 },
  brandTitle: {
    color: colors.white,
    fontFamily: type.semibold,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  brandHint: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: type.medium,
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  scrollView: { backgroundColor: '#184f4a' },
  scroll: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 10 },
  section: {
    marginTop: 4,
    marginBottom: 6,
    marginHorizontal: 8,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: type.bold,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 10,
    marginHorizontal: 8,
  },
  link: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  linkActive: { backgroundColor: 'rgba(237,136,56,0.16)' },
  linkPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  activeBarOn: { backgroundColor: colors.primary },
  linkText: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: type.medium,
    fontSize: 14,
    letterSpacing: 0.15,
    flex: 1,
  },
  linkTextActive: {
    color: colors.white,
    fontFamily: type.semibold,
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 10,
  },
  profileActive: { backgroundColor: 'rgba(237,136,56,0.16)' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(237,136,56,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontFamily: type.bold, fontSize: 13 },
  userCopy: { flex: 1, minWidth: 0 },
  userName: { color: colors.white, fontFamily: type.semibold, fontSize: 14 },
  userRole: { color: 'rgba(255,255,255,0.65)', fontFamily: type.medium, fontSize: 11, marginTop: 2 },
  logout: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutText: { color: colors.white, fontFamily: type.semibold, fontSize: 14 },
  pressed: { opacity: 0.85 },
});
