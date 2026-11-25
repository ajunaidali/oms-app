import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  Field,
  LoadingBlock,
  PrimaryButton,
  ScreenBody,
} from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { colors, type } from '../../theme/theme';
import { getErrorMessage, getRecordId, isEmailVerified, unwrapList } from '../../utils/apiHelpers';
import { getUserRoleLabel } from '../../utils/permissionHelpers';
import { show, initials } from '../../utils/display';

export default function ProfileScreen() {
  const { user, refreshUser, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const id = getRecordId(user);
        if (id) {
          const response = await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BY_EMPLOYEE(id));
          setAssignment(unwrapList(response)[0] || null);
        }
      } catch {
        setAssignment(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      setError('Enter your current and new password');
      return;
    }
    if (newPassword !== confirm) {
      setError('New password and confirmation do not match');
      return;
    }
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, { currentPassword, newPassword });
      setSuccess('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change password'));
    }
  };

  const department = show(assignment?.department || user?.department);
  const position = show(assignment?.position || user?.position);
  const name = user?.name || 'Profile';

  return (
    <ScreenBody onRefresh={refreshUser}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      {!isEmailVerified(user) && user?.isEmailVerified === false ? (
        <Banner kind="error" message="Verify your email to finish account setup." />
      ) : null}
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View>
        <View style={styles.heroText}>
          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroRole}>{getUserRoleLabel(user)}</Text>
          <Text style={styles.heroMeta}>{show(user?.employeeId)} · {department}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal Information</Text>
        <Text style={styles.cardHint}>Your contact details</Text>
        <Info label="Full Name" value={show(name)} />
        <Info label="Email Address" value={show(user?.email)} />
        <Info label="Phone Number" value={show(user?.phone)} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Work Information</Text>
        <Text style={styles.cardHint}>Role and organization</Text>
        <Info label="Employee ID" value={show(user?.employeeId)} />
        <Info label="Role" value={getUserRoleLabel(user)} />
        <Info label="Department" value={department} />
        <Info label="Position" value={position} />
        <Info label="Email verified" value={isEmailVerified(user) ? 'Yes' : 'No'} />
      </View>
      {loading ? <LoadingBlock label="Loading assignment..." /> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.cardHint}>Change your password</Text>
        <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secure />
        <Field label="New password" value={newPassword} onChangeText={setNewPassword} secure />
        <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secure />
        <PrimaryButton label="Change password" onPress={changePassword} />
        <PrimaryButton label="Send verification email" tone="teal" onPress={async () => {
          try {
            await apiClient.post(API_ENDPOINTS.AUTH.REQUEST_EMAIL_VERIFICATION, {});
            setSuccess('Verification email requested');
          } catch (err) {
            setError(getErrorMessage(err, 'Could not request verification'));
          }
        }} />
        <Pressable onPress={signOut} style={styles.logout}><Text style={styles.logoutText}>Logout</Text></Pressable>
      </View>
    </ScreenBody>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 18, padding: 22, backgroundColor: '#1e736b' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.45)' },
  avatarText: { color: '#fff', fontFamily: type.bold, fontSize: 24 },
  heroText: { flex: 1, gap: 4 },
  heroName: { color: '#fff', fontFamily: type.bold, fontSize: 24 },
  heroRole: { color: 'rgba(255,255,255,0.9)', fontFamily: type.semibold, fontSize: 14 },
  heroMeta: { color: 'rgba(255,255,255,0.75)', fontFamily: type.regular, fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: '#0f172a', fontFamily: type.bold, fontSize: 18 },
  cardHint: { color: '#64748b', fontFamily: type.regular, fontSize: 13, marginTop: -6 },
  info: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eef2f7' },
  infoLabel: { color: '#64748b', fontFamily: type.semibold, fontSize: 12 },
  infoValue: { color: '#0f172a', fontFamily: type.semibold, fontSize: 15, marginTop: 2 },
  logout: { alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: '#dc2626', fontFamily: type.bold, fontSize: 14 },
});
