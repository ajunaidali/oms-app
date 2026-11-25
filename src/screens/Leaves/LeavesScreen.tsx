import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  ChipRow,
  ChoiceField,
  DateField,
  EmptyBlock,
  Field,
  FormSheet,
  LoadingBlock,
  CompactCard,
  PrimaryButton,
  RecordCard,
  ScreenBody,
  TextAction,
} from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getErrorMessage, getRecordId, unwrapData, unwrapList } from '../../utils/apiHelpers';
import { EMPLOYEE_LEAVE_TYPES, fetchLeaveBalanceRowsComputed } from '../../utils/leaveHelpers';
import { hasAnyPermission } from '../../utils/permissionHelpers';
import { show, titleCase } from '../../utils/display';

function inclusiveDays(startDate: unknown, endDate: unknown) {
  const startKey = String(startDate || '').slice(0, 10);
  const endKey = String(endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey)) return '—';
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '—';
  return String(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

export default function LeavesScreen() {
  const { user } = useAuth();
  const canSeeAll = hasAnyPermission(user, ['leave:read:any']);
  const canReview = hasAnyPermission(user, ['leave:update', 'leave:update:any']);
  const [tab, setTab] = useState('my');
  const [rows, setRows] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ assignment: '', startDate: '', endDate: '', leaveType: 'casual', reason: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const endpoint = tab === 'all' && canSeeAll ? API_ENDPOINTS.LEAVES.ALL : API_ENDPOINTS.LEAVES.MY;
    try {
      setRows(unwrapList(await apiClient.get(endpoint)));
    } catch (err) {
      if (tab === 'all') setRows(unwrapList(await apiClient.get(API_ENDPOINTS.LEAVES.MY)));
      else throw err;
    }
    const employeeId = getRecordId(user) || user?.employeeId;
    if (employeeId) {
      try {
        setAssignments(unwrapList(await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.BY_EMPLOYEE(employeeId))));
      } catch {
        const all = unwrapList(await apiClient.get(API_ENDPOINTS.ASSIGNMENTS.LIST).catch(() => []));
        setAssignments(all.filter((item: any) => getRecordId(item.employee) === employeeId || item.employee?.employeeId === user?.employeeId));
      }
    }
  }, [canSeeAll, tab, user]);

  useEffect(() => {
    setLoading(true);
    load().catch(err => setError(getErrorMessage(err, 'Could not load leaves'))).finally(() => setLoading(false));
  }, [load]);

  const apply = async () => {
    if (!form.assignment || !form.startDate || !form.endDate || !form.leaveType || !form.reason.trim()) {
      setError('Assignment, dates, type, and reason are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post(API_ENDPOINTS.LEAVES.APPLY, {
        assignment: form.assignment,
        startDate: form.startDate,
        endDate: form.endDate,
        leaveType: form.leaveType,
        reason: form.reason.trim(),
      });
      setSuccess('Leave applied successfully');
      setOpen(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to apply for leave'));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (leave: any, status: string) => {
    try {
      await apiClient.put(API_ENDPOINTS.LEAVES.STATUS(getRecordId(leave)), { status });
      setSuccess(`Leave ${status}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update leave'));
    }
  };

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      {canSeeAll ? <ChipRow value={tab} onChange={setTab} options={[{ label: 'My leaves', value: 'my' }, { label: 'All leaves', value: 'all' }]} /> : null}
      <PrimaryButton label="Apply for leave" onPress={() => setOpen(true)} />
      {loading ? <LoadingBlock /> : null}
      {!loading && rows.length === 0 ? <EmptyBlock title="No leave requests" body="Applied leave will show the type, dates, status, and reason." /> : null}
      {rows.map(leave => {
        const pending = String(leave.status || '').toLowerCase() === 'pending';
        const reviewing = pending && tab === 'all' && canReview;
        const cancelling = pending && tab !== 'all' && hasAnyPermission(user, ['leave:delete', 'leave:delete:own']);
        return (
        <CompactCard
          key={getRecordId(leave)}
          title={titleCase(leave.leaveType)}
          badge={titleCase(leave.status)}
          meta={`${show(leave.startDate)} → ${show(leave.endDate)}  ·  ${inclusiveDays(leave.startDate, leave.endDate)} day(s)`}
          body={show(leave.reason)}
          lines={[`Employee: ${show(leave.employee || leave.applicant)}`]}
          actions={reviewing ? (
            <>
              <TextAction label="Approve" onPress={() => setStatus(leave, 'approved')} />
              <TextAction label="Reject" tone="danger" onPress={() => setStatus(leave, 'rejected')} />
            </>
          ) : cancelling ? (
            <TextAction label="Cancel" tone="danger" onPress={() => {
              Alert.alert('Cancel leave', 'Delete this leave request?', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  try { await apiClient.delete(API_ENDPOINTS.LEAVES.BY_ID(getRecordId(leave))); await load(); }
                  catch (err) { setError(getErrorMessage(err, 'Could not delete leave')); }
                } },
              ]);
            }} />
          ) : null}
        />
        );
      })}
      <FormSheet visible={open} title="Apply for leave" onClose={() => setOpen(false)}>
        <ChoiceField label="Assignment *" value={form.assignment} onChange={value => setForm(prev => ({ ...prev, assignment: value }))} options={[{ label: 'Select assignment', value: '' }, ...assignments.map(item => ({ label: `${getDisplayName(item.department)} · ${getDisplayName(item.position)}`, value: getRecordId(item) }))]} />
        <ChoiceField label="Leave type *" value={form.leaveType} onChange={value => setForm(prev => ({ ...prev, leaveType: value }))} options={EMPLOYEE_LEAVE_TYPES.map(type => ({ label: titleCase(type), value: type }))} />
        <DateField label="Start date *" value={form.startDate} onChange={value => setForm(prev => ({ ...prev, startDate: value }))} />
        <DateField label="End date *" value={form.endDate} onChange={value => setForm(prev => ({ ...prev, endDate: value }))} />
        <Field label="Reason *" value={form.reason} onChangeText={value => setForm(prev => ({ ...prev, reason: value }))} multiline />
        <PrimaryButton label={saving ? 'Submitting...' : 'Submit leave'} onPress={apply} disabled={saving} />
      </FormSheet>
    </ScreenBody>
  );
}

export function LeaveBalanceScreen() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.LEAVES.ALL_BALANCES}?year=${encodeURIComponent(year)}`);
      const list = unwrapList(response);
      if (list.length) {
        setRows(list);
        return;
      }
      const data = unwrapData(response);
      if (Array.isArray(data)) setRows(data);
    } catch {
      setRows(await fetchLeaveBalanceRowsComputed(apiClient, API_ENDPOINTS, year));
    }
  }, [year]);

  useEffect(() => {
    setLoading(true);
    load().catch(err => setError(getErrorMessage(err, 'Could not load leave balances'))).finally(() => setLoading(false));
  }, [load]);

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      <Field label="Year" value={year} onChangeText={setYear} keyboardType="numeric" />
      <PrimaryButton label="Load balances" tone="teal" onPress={load} />
      {loading ? <LoadingBlock /> : null}
      {!loading && rows.length === 0 ? <EmptyBlock title="No balances" body="Leave quotas and usage will appear here." /> : null}
      {rows.map((row, index) => {
        const pools = row.pools || [];
        const balanceRows = pools.flatMap((pool: any) =>
          ['casual', 'sick', 'annual', 'unpaid'].map(type => ({
            label: `${pool.poolLabel || 'Balance'} ${type}`,
            value: pool.balances?.[type]
              ? `${pool.balances[type].used ?? 0} used / ${pool.balances[type].unlimited ? 'unlimited' : pool.balances[type].remaining ?? pool.balances[type].total ?? '—'}`
              : show(row[type] || row.balances?.[type]),
          })),
        );
        return (
          <RecordCard
            key={row.employeeId || index}
            title={getDisplayName(row.employee) || show(row.name)}
            subtitle={row.departmentLabel || show(row.department)}
            rows={balanceRows.length ? balanceRows : [{ label: 'Balance', value: show(row.remaining ?? row.balance) }]}
          />
        );
      })}
    </ScreenBody>
  );
}
