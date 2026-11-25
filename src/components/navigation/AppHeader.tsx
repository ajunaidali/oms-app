import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, type } from '../../theme/theme';
import { getUserRoleLabel } from '../../utils/permissionHelpers';
import { initials } from '../../utils/display';

export default function AppHeader({
  title,
  navigation,
}: {
  title: string;
  navigation: any;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || '';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';
  const role = getUserRoleLabel(user);
  const showUserMeta = width >= 420;

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 10 }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#134e4a" />
            <Stop offset="0.4" stopColor="#1a6b63" />
            <Stop offset="0.78" stopColor="#c4722a" />
            <Stop offset="1" stopColor="#ed8838" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#headerGrad)" />
      </Svg>
      <View style={styles.sheen} />

      <View style={styles.row}>
        <Pressable
          onPress={() => navigation.toggleDrawer()}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={8}>
          <View style={styles.menuLines}>
            <View style={styles.menuLine} />
            <View style={[styles.menuLine, styles.menuLineMid]} />
            <View style={styles.menuLine} />
          </View>
        </Pressable>

        <View style={styles.copy}>
          <Text style={styles.breadcrumb} numberOfLines={1}>OMS  ›  {title}</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={6}>
          <Text style={styles.alertText}>Alerts</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Profile')}
          style={({ pressed }) => [styles.userChip, !showUserMeta && styles.userChipCompact, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          hitSlop={6}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user?.name || 'OT')}</Text>
          </View>
          {showUserMeta ? (
            <View style={styles.userMeta}>
              <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Profile'}</Text>
              {role ? <Text style={styles.userRole} numberOfLines={1}>{role}</Text> : null}
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingBottom: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 60,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLines: { gap: 3.5, width: 16 },
  menuLine: { height: 2, borderRadius: 2, backgroundColor: '#fff' },
  menuLineMid: { width: 12 },
  copy: { flex: 1, minWidth: 0 },
  breadcrumb: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: type.medium,
    fontSize: 11,
  },
  title: {
    color: colors.white,
    fontFamily: type.bold,
    fontSize: 20,
    lineHeight: 24,
    marginTop: 1,
  },
  greeting: {
    color: 'rgba(255,255,255,0.84)',
    fontFamily: type.regular,
    fontSize: 12,
    marginTop: 1,
  },
  alertButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alertText: {
    color: colors.white,
    fontFamily: type.bold,
    fontSize: 11,
  },
  userChip: {
    maxWidth: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
  },
  userChipCompact: {
    paddingRight: 4,
    maxWidth: 40,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontFamily: type.bold, fontSize: 11 },
  userMeta: { flexShrink: 1, minWidth: 0 },
  userName: { color: colors.white, fontFamily: type.semibold, fontSize: 11 },
  userRole: { color: 'rgba(255,255,255,0.72)', fontFamily: type.regular, fontSize: 10 },
  pressed: { opacity: 0.78 },
});
