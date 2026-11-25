import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import LoginScreen from '../screens/Auth/LoginScreen';
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import AttendanceScreen from '../screens/Attendance/AttendanceScreen';
import { AttendanceImportScreen, AttendanceLogsScreen } from '../screens/Work/WorkScreen';
import DirectoryScreen from '../screens/Directory/DirectoryScreen';
import AssignmentScreen from '../screens/Directory/AssignmentScreen';
import RoleScreen from '../screens/Directory/RoleScreen';
import LeavesScreen, { LeaveBalanceScreen } from '../screens/Leaves/LeavesScreen';
import TodosScreen, { PolicyScreen } from '../screens/Todos/TodosScreen';
import ReportsScreen, { ExportScreen } from '../screens/Reports/ReportsScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import NotificationsScreen from '../screens/Notifications/NotificationsScreen';
import WorkScreen from '../screens/Work/WorkScreen';
import AppHeader from '../components/navigation/AppHeader';
import AppDrawer from '../components/navigation/AppDrawer';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import { colors, type } from '../theme/theme';
import { fetchTodayStudioBookings, formatStudioBookingTime, isLiveStudioBooking } from '../utils/studioBookingHelpers';

const Drawer = createDrawerNavigator();
const logo = require('../assets/logos/logoOnly.webp');

function LiveBanner({ navigation }: { navigation: any }) {
  const [live, setLive] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const bookings = await fetchTodayStudioBookings();
        const now = new Date();
        if (active) setLive(bookings.filter((booking: any) => isLiveStudioBooking(booking, now)));
      } catch {
        // A failed poll should not hide the rest of the app.
      }
    };
    tick();
    const timer = setInterval(tick, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!live.length) return null;
  const first = live[0];
  return (
    <Pressable style={styles.live} onPress={() => navigation.navigate('Studio')}>
      <Text style={styles.liveTitle}>{live.length === 1 ? `${titleCaseType(first.type)} is live` : 'A studio session is live'}</Text>
      <Text style={styles.liveBody}>{live.map(item => `${item.title || titleCaseType(item.type)} ${formatStudioBookingTime(item)}`).join(' · ')}</Text>
    </Pressable>
  );
}

function titleCaseType(value: string) {
  const typeName = String(value || '').toLowerCase();
  if (typeName === 'podcast') return 'Podcast';
  if (typeName === 'shoot') return 'Shoot';
  return 'Studio';
}

function DepartmentRoute() {
  return <DirectoryScreen kind="department" />;
}
function EmployeeRoute() {
  return <DirectoryScreen kind="employee" />;
}
function PositionRoute() {
  return <DirectoryScreen kind="position" />;
}
function MyAttendanceRoute() {
  return <AttendanceScreen mode="my" />;
}
function AdminAttendanceRoute() {
  return <AttendanceScreen mode="admin" />;
}
function SalaryRoute() {
  return <WorkScreen moduleKey="salary" />;
}
function TicketsRoute() {
  return <WorkScreen moduleKey="tickets" />;
}
function AssetsRoute() {
  return <WorkScreen moduleKey="assets" />;
}
function ProjectsRoute() {
  return <WorkScreen moduleKey="projects" />;
}
function TasksRoute() {
  return <WorkScreen moduleKey="tasks" />;
}
function StudioRoute() {
  return <WorkScreen moduleKey="studio" />;
}
function FeedbackRoute() {
  return <WorkScreen moduleKey="feedback" />;
}
function ResourcesRoute() {
  return <WorkScreen moduleKey="resources" />;
}
function UploadsRoute() {
  return <WorkScreen moduleKey="uploads" />;
}
function EmailRoute() {
  return <WorkScreen moduleKey="email" />;
}
function AuditRoute() {
  return <WorkScreen moduleKey="audit" />;
}

function Shell() {
  const { online } = useNetwork();
  return (
    <Drawer.Navigator
      drawerContent={props => <AppDrawer {...props} />}
      screenOptions={({ navigation, route }) => ({
        header: () => (
          <View>
            <AppHeader title={labelFor(route.name)} navigation={navigation} />
            {!online ? <Text style={styles.offline}>You are offline. Data will load when the connection returns.</Text> : null}
            <LiveBanner navigation={navigation} />
          </View>
        ),
        drawerStyle: { backgroundColor: '#184f4a', width: 304 },
        drawerType: 'front',
        overlayColor: 'rgba(15, 23, 42, 0.48)',
        swipeEdgeWidth: 48,
        sceneContainerStyle: { backgroundColor: colors.bg },
      })}>
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="Department" component={DepartmentRoute} />
      <Drawer.Screen name="Employee" component={EmployeeRoute} />
      <Drawer.Screen name="Positions" component={PositionRoute} />
      <Drawer.Screen name="Assignment" component={AssignmentScreen} />
      <Drawer.Screen name="Roles" component={RoleScreen} />
      <Drawer.Screen name="MyAttendance" component={MyAttendanceRoute} />
      <Drawer.Screen name="Attendance" component={AdminAttendanceRoute} />
      <Drawer.Screen name="AttendanceImport" component={AttendanceImportScreen} />
      <Drawer.Screen name="AttendanceLogs" component={AttendanceLogsScreen} />
      <Drawer.Screen name="Leaves" component={LeavesScreen} />
      <Drawer.Screen name="LeaveBalance" component={LeaveBalanceScreen} />
      <Drawer.Screen name="Todos" component={TodosScreen} />
      <Drawer.Screen name="Policy" component={PolicyScreen} />
      <Drawer.Screen name="Reports" component={ReportsScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="Notifications" component={NotificationsScreen} />
      <Drawer.Screen name="Salary" component={SalaryRoute} />
      <Drawer.Screen name="Tickets" component={TicketsRoute} />
      <Drawer.Screen name="Assets" component={AssetsRoute} />
      <Drawer.Screen name="Projects" component={ProjectsRoute} />
      <Drawer.Screen name="Tasks" component={TasksRoute} />
      <Drawer.Screen name="Studio" component={StudioRoute} />
      <Drawer.Screen name="Feedback" component={FeedbackRoute} />
      <Drawer.Screen name="Resources" component={ResourcesRoute} />
      <Drawer.Screen name="Uploads" component={UploadsRoute} />
      <Drawer.Screen name="EmailTemplates" component={EmailRoute} />
      <Drawer.Screen name="Export" component={ExportScreen} />
      <Drawer.Screen name="Audit" component={AuditRoute} />
    </Drawer.Navigator>
  );
}

function labelFor(name: string) {
  const labels: Record<string, string> = {
    Dashboard: 'Dashboard',
    Department: 'Department',
    Employee: 'Employee',
    Positions: 'Positions',
    Assignment: 'Department Assignment',
    Roles: 'Roles',
    MyAttendance: 'My Attendance',
    Attendance: 'Attendance',
    AttendanceImport: 'Attendance Import',
    AttendanceLogs: 'Attendance Logs',
    Leaves: 'Leaves',
    LeaveBalance: 'Leave Balance',
    Todos: 'My Notes',
    Policy: 'Policy',
    Reports: 'Reports',
    Settings: 'Settings',
    Profile: 'Profile',
    Notifications: 'Notifications',
    Salary: 'Salary',
    Tickets: 'Tickets',
    Assets: 'Assets',
    Projects: 'Projects',
    Tasks: 'Tasks',
    Studio: 'Studio Bookings',
    Feedback: 'Feedback',
    Resources: 'Resources',
    Uploads: 'Uploads',
    EmailTemplates: 'Email Templates',
    Export: 'Export Center',
    Audit: 'Audit Logs',
  };
  return labels[name] || name;
}

export default function RootNavigator() {
  const { ready, user } = useAuth();
  const theme = useMemo(() => ({
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, text: colors.text, card: colors.white, border: colors.border },
  }), []);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Image source={logo} style={styles.splashLogo} resizeMode="contain" />
        <Text style={styles.splashBrand}>OTS</Text>
        <Text style={styles.splashText}>Management System</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      {user ? <Shell /> : <LoginScreen />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.tealDark, alignItems: 'center', justifyContent: 'center' },
  splashLogo: { width: 140, height: 140 },
  splashBrand: { color: colors.primary, fontFamily: type.bold, fontSize: 36, marginTop: 8 },
  splashText: { color: colors.white, fontFamily: type.medium, fontSize: 16 },
  offline: { backgroundColor: '#fff7ed', color: '#9a3412', padding: 8, fontFamily: type.medium, textAlign: 'center' },
  live: { backgroundColor: '#fff4eb', paddingHorizontal: 16, paddingVertical: 10 },
  liveTitle: { color: colors.primaryDark, fontFamily: type.bold },
  liveBody: { color: colors.text, fontFamily: type.regular, fontSize: 12 },
});
