import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  ChipRow,
  ChoiceField,
  CompactCard,
  DateField,
  EmptyBlock,
  Field,
  FormSheet,
  LoadingBlock,
  PrimaryButton,
  ScreenBody,
  SearchField,
  StatGrid,
  TextAction,
} from '../../components/common/Ui';
import { CellText, DataTable } from '../../components/tables/DataTable';
import { useAuth } from '../../context/AuthContext';
import { colors, type } from '../../theme/theme';
import { getDisplayName, getErrorMessage, getRecordId, unwrapList } from '../../utils/apiHelpers';
import {
  canCreateAnyAttendance,
  canManageAllAttendance,
  canUpdateAnyAttendance,
  computeAttendanceStatusCounts,
  computeMonthAttendanceSummary,
  computeTodayAttendanceStatsFromRecords,
  fetchAllAssignments,
  fetchDepartmentsListCached,
  fetchEmployeesListCached,
  fetchMyAttendanceRecords,
  fetchMyScheduleContext,
  formatPktPunchTime,
  getDayNameFromDateKey,
  getDefaultMonthYear,
  getEditableAttendanceId,
  getRecordCheckInTime,
  getRecordCheckOutTime,
  getRecordDateKey,
  getRecordEmployeeName,
  getRecordRemarks,
  getTodayDateValue,
  groupAttendanceRecordsByEmployeeDay,
  hydrateAttendanceRecords,
  isSuperAdminUser,
  sortAttendanceByDateDesc,
} from '../../utils/attendanceHelpers';
import {
  applyClientFilters,
  fetchAttendanceRecords,
  fetchAttendanceStats,
  fetchDepartmentEmployeeIds,
  getAttendanceStatusDisplay,
  getRecordAttendanceDate,
  getRecordDepartmentName,
  getRecordDisplayStatus,
  getRecordUserId,
  getRecordWorkingHoursCompact,
  mergeAttendanceStats,
  restrictDepartmentEmployeeIds,
} from '../../utils/attendancePageHelpers';
import { ATTENDANCE_STATUS_FILTER_OPTIONS } from '../../utils/attendanceStatus';
import { buildPeriod, periodFromMonthYear } from '../../utils/periodHelpers';
import { getVisibleDepartments, getVisibleEmployeeLinkedRecords, getVisibleEmployees } from '../../utils/permissionHelpers';
import { useAppSettings } from '../../utils/settingsHelpers';
import { show } from '../../utils/display';
import { perfMarkEnd, perfMarkStart } from '../../utils/perfMark';

type Mode = 'my' | 'admin';
type FormMode = 'manual' | 'absent' | 'holiday' | 'punch' | 'edit' | '';

const MY_STAT_KEYS = [
  { label: 'Total Days', key: 'totalDays' },
  { label: 'Present Days', key: 'present' },
  { label: 'Late Days', key: 'late' },
  { label: 'Absent Days', key: 'absent' },
  { label: 'Missing', key: 'missing' },
  { label: 'Casual Leave', key: 'casualLeave' },
  { label: 'Annual Leave', key: 'annualLeave' },
  { label: 'Sick Leave', key: 'sickLeave' },
  { label: 'Unpaid Leave', key: 'unpaidLeave' },
  { label: 'Total Hours', key: 'totalHoursLabel' },
];

const ADMIN_STAT_KEYS = [
  { label: 'Present', keys: ['present'] },
  { label: 'Late', keys: ['late'] },
  { label: 'Absent', keys: ['absent'] },
  { label: 'Missing', keys: ['missing'] },
  { label: 'Pending', keys: ['pending', 'stillWorking', 'still_working', 'working', 'inOffice'] },
  { label: 'Total Users', keys: ['totalUsers', 'total_users', 'totalEmployees', 'total'] },
];

const emptyForm = () => ({
  attendanceId: '',
  employeeId: '',
  assignmentId: '',
  departmentId: '',
  date: getTodayDateValue(),
  checkIn: '',
  checkOut: '',
  remarks: '',
  deviceId: 'WEB',
  source: 'manual',
});

export default function AttendanceScreen({ mode }: { mode: Mode }) {
  const { user } = useAuth();
  const { getBoolean } = useAppSettings();
  const isMyAttendancePage = mode === 'my';
  const isSuperAdmin = isSuperAdminUser(user);
  const canManageAll = !isMyAttendancePage && (isSuperAdmin || canManageAllAttendance(user));
  const canViewAllAttendance = !isMyAttendancePage && isSuperAdmin;
  const canCreateAttendance = !isMyAttendancePage && canCreateAnyAttendance(user);
  const canUpdateAttendance = !isMyAttendancePage && canUpdateAnyAttendance(user);
  const manualAttendanceEnabled = getBoolean('manualAttendanceEnabled', true);
  const manualPunchEnabled = getBoolean('manualPunchMyAttendanceEnabled', false);
  const showManualEntry = canCreateAttendance && manualAttendanceEnabled;
  const showEmployeePunch = isMyAttendancePage && manualPunchEnabled;
  const showEmployeeMonthlyView = isMyAttendancePage;

  const initialPeriod = showEmployeeMonthlyView
    ? periodFromMonthYear(getDefaultMonthYear())
    : buildPeriod('day', getTodayDateValue());

  const listRequestIdRef = useRef(0);
  const employeesRef = useRef<any[]>(employees);
  const departmentsRef = useRef<any[]>(departments);
  const hasDisplayedRecordsRef = useRef(false);
  employeesRef.current = employees;
  departmentsRef.current = departments;
  hasDisplayedRecordsRef.current = records.length > 0;
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [departmentId, setDepartmentId] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [scheduleContext, setScheduleContext] = useState<any>({ workSchedule: null, leverageTime: null });
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewRecord, setViewRecord] = useState<any>(null);
  const [employeesReady, setEmployeesReady] = useState(!canManageAll);

  const filters = useMemo(
    () => ({ from, to, departmentId, userId, status }),
    [departmentId, from, status, to, userId],
  );

  const pageSubtitle = showEmployeeMonthlyView
    ? 'Your attendance at a glance'
    : canViewAllAttendance
      ? 'Attendance for all employees, including those created by any admin'
      : 'Attendance for employees you created';

  const loadAttendance = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    perfMarkStart(`attendance:${mode}`);
    setLoading(!hasDisplayedRecordsRef.current);
    setError('');
    try {
      const activeFilters = filters;
      const employeeList = employeesRef.current;
      const departmentList = departmentsRef.current;
      const assignmentsPromise = fetchAllAssignments().catch(() => []);
      const statsApiPromise =
        !showEmployeeMonthlyView && canViewAllAttendance
          ? fetchAttendanceStats(activeFilters).catch(() => null)
          : Promise.resolve(null);

      let departmentEmployeeIds: Set<string> | null = null;
      let list: any[] = [];
      const nextScheduleContext = scheduleContext;

      if (showEmployeeMonthlyView) {
        const leavesPromise = apiClient.get(API_ENDPOINTS.LEAVES.MY).catch(() => null);
        const [attendanceList, fetchedSchedule, assignmentsForContext, leavesResponse] = await Promise.all([
          fetchMyAttendanceRecords(activeFilters),
          fetchMyScheduleContext(user),
          assignmentsPromise,
          leavesPromise,
        ]);
        if (requestId !== listRequestIdRef.current) return;

        list = groupAttendanceRecordsByEmployeeDay(attendanceList);
        nextScheduleContext = fetchedSchedule;
        setScheduleContext(fetchedSchedule);

        list = await hydrateAttendanceRecords(list, {
          assignments: assignmentsForContext,
          departments: departmentList,
          fallbackContext: nextScheduleContext,
        });
        if (requestId !== listRequestIdRef.current) return;

        list = applyClientFilters(list, activeFilters, { scheduleContext: nextScheduleContext, employees: employeeList });
        list = sortAttendanceByDateDesc(list);
        setRecords(list);

        let approvedLeaves: any[] = [];
        let leaveApiAvailable = false;
        if (leavesResponse) {
          approvedLeaves = unwrapList(leavesResponse).filter(
            (leave: any) => String(leave?.status || '').toLowerCase() === 'approved',
          );
          leaveApiAvailable = true;
        }
        setStats(
          computeMonthAttendanceSummary(list, {
            approvedLeaves,
            from: activeFilters.from,
            to: activeFilters.to,
            leaveApiAvailable,
            workSchedule: nextScheduleContext.workSchedule,
            leverageTime: nextScheduleContext.leverageTime,
          }),
        );
      } else {
        const departmentIdsPromise =
          canManageAll && departmentId
            ? fetchDepartmentEmployeeIds(departmentId).then(ids =>
                !canViewAllAttendance ? restrictDepartmentEmployeeIds(ids, employeeList) : ids,
              )
            : Promise.resolve(null);

        const [resolvedDepartmentIds, assignmentsForContext] = await Promise.all([
          departmentIdsPromise,
          assignmentsPromise,
        ]);
        if (requestId !== listRequestIdRef.current) return;
        departmentEmployeeIds = resolvedDepartmentIds;

        try {
          list = await fetchAttendanceRecords(activeFilters, employeeList, user, departmentEmployeeIds);
        } catch (err: any) {
          if (err?.status === 403 && !isSuperAdmin && !canViewAllAttendance) {
            list = await fetchMyAttendanceRecords(activeFilters);
          } else {
            throw err;
          }
        }
        if (requestId !== listRequestIdRef.current) return;

        list = groupAttendanceRecordsByEmployeeDay(list);
        list = await hydrateAttendanceRecords(list, {
          assignments: assignmentsForContext,
          departments: departmentList,
          fallbackContext: {},
        });
        if (requestId !== listRequestIdRef.current) return;

        if (!isSuperAdmin) {
          list = getVisibleEmployeeLinkedRecords(list, employeeList, user);
        }

        list = applyClientFilters(list, activeFilters, { scheduleContext: nextScheduleContext, employees: employeeList });
        list = sortAttendanceByDateDesc(list);
        setRecords(list);

        const statusCounts = computeAttendanceStatusCounts(list, {
          workSchedule: nextScheduleContext.workSchedule,
          leverageTime: nextScheduleContext.leverageTime,
        });
        const computedStats = {
          ...computeTodayAttendanceStatsFromRecords(list, employeeList.length),
          ...statusCounts,
          todayPresent: statusCounts.present + statusCounts.late,
        };
        if (!canViewAllAttendance) {
          setStats(computedStats);
        } else {
          const apiStats = await statsApiPromise;
          if (requestId !== listRequestIdRef.current) return;
          setStats(apiStats ? mergeAttendanceStats(apiStats, computedStats) : computedStats);
        }
      }
      perfMarkEnd(`attendance:${mode}`);
    } catch (err) {
      if (requestId !== listRequestIdRef.current) return;
      setError(getErrorMessage(err, 'Failed to load attendance'));
      setRecords([]);
      setStats(null);
      perfMarkEnd(`attendance:${mode}`);
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    canManageAll,
    canViewAllAttendance,
    departmentId,
    filters,
    isSuperAdmin,
    mode,
    showEmployeeMonthlyView,
    user,
  ]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const departmentList = await fetchDepartmentsListCached();
        if (!active) return;
        setDepartments(isSuperAdmin ? departmentList : getVisibleDepartments(departmentList, user));
      } catch {
        if (active) setDepartments([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isSuperAdmin, user]);

  useEffect(() => {
    if (!canManageAll) {
      setEmployeesReady(true);
      return;
    }
    let active = true;
    (async () => {
      try {
        const employeeList = await fetchEmployeesListCached();
        if (!active) return;
        setEmployees(isSuperAdmin ? employeeList : getVisibleEmployees(employeeList, user));
      } catch {
        if (active) setEmployees([]);
      } finally {
        if (active) setEmployeesReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [canManageAll, isSuperAdmin, user]);

  useEffect(() => {
    if (canManageAll && !employeesReady) return;
    const delay = userId.trim() ? 400 : 0;
    const timer = setTimeout(() => {
      loadAttendance();
    }, delay);
    return () => clearTimeout(timer);
  }, [canManageAll, employeesReady, loadAttendance, userId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadAttendance();
    } finally {
      setRefreshing(false);
    }
  };

  const setPeriod = (period: string) => {
    const next = buildPeriod(period, getTodayDateValue());
    setFrom(next.from);
    setTo(next.to);
  };

  const statItems = showEmployeeMonthlyView
    ? MY_STAT_KEYS.map(item => ({
        label: item.label,
        value: stats?.[item.key] ?? (loading ? '—' : 0),
      }))
    : ADMIN_STAT_KEYS.map(item => ({
        label: item.label,
        value: stats
          ? item.keys.reduce((found: any, key) => (found != null ? found : stats[key]), null) ?? 0
          : loading
            ? '—'
            : 0,
      }));

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (formMode === 'manual') {
        await apiClient.post(API_ENDPOINTS.ATTENDANCE.MANUAL, {
          employeeId: form.employeeId,
          date: form.date,
          checkIn: form.checkIn || undefined,
          checkOut: form.checkOut || undefined,
          remarks: form.remarks,
          assignmentId: form.assignmentId || undefined,
        });
        setSuccess('Manual attendance saved');
      } else if (formMode === 'absent') {
        await apiClient.post(API_ENDPOINTS.ATTENDANCE.MARK_ABSENT, {
          employeeId: form.employeeId,
          date: form.date,
          remarks: form.remarks,
          assignmentId: form.assignmentId || undefined,
        });
        setSuccess('Marked absent');
      } else if (formMode === 'holiday') {
        await apiClient.post(API_ENDPOINTS.ATTENDANCE.HOLIDAY_PRESENT, {
          date: form.date,
          scope: 'department',
          departmentId: form.departmentId,
          remarks: form.remarks || undefined,
        });
        setSuccess('Holiday present saved');
      } else if (formMode === 'punch') {
        await apiClient.post(API_ENDPOINTS.ATTENDANCE.PUNCH, {
          source: 'manual',
          employeeId: form.employeeId || undefined,
          deviceId: form.deviceId || 'WEB',
          remarks: form.remarks || undefined,
          type: form.checkOut ? 'check-out' : 'check-in',
          timestamp: new Date().toISOString(),
        });
        setSuccess('Punch recorded');
      } else if (formMode === 'edit') {
        await apiClient.put(API_ENDPOINTS.ATTENDANCE.BY_ID(form.attendanceId), {
          checkIn: form.checkIn || undefined,
          checkOut: form.checkOut || undefined,
          remarks: form.remarks || undefined,
        });
        setSuccess('Attendance updated');
      }
      setFormMode('');
      await loadAttendance();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save attendance'));
    } finally {
      setSaving(false);
    }
  };

  const remove = (record: any) => {
    const id = getEditableAttendanceId(record);
    if (!id || !canUpdateAttendance) return;
    Alert.alert('Delete attendance', `Delete attendance for ${getRecordEmployeeName(record)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(API_ENDPOINTS.ATTENDANCE.BY_ID(id));
            setSuccess('Attendance deleted');
            await loadAttendance();
          } catch (err) {
            setError(getErrorMessage(err, 'Failed to delete attendance'));
          }
        },
      },
    ]);
  };

  const openEdit = (record: any) => {
    setForm({
      ...emptyForm(),
      attendanceId: getEditableAttendanceId(record) || '',
      date: getRecordDateKey(record),
      checkIn: formatPktPunchTime(getRecordCheckInTime(record)) || '',
      checkOut: formatPktPunchTime(getRecordCheckOutTime(record)) || '',
      remarks: getRecordRemarks(record),
    });
    setFormMode('edit');
  };

  const exportCsv = async () => {
    const header = [
      'User ID',
      'Name',
      'Department',
      'Date',
      'Check In',
      'Check Out',
      'Working Hours',
      'Status',
      'Device',
      'Source',
      'Remarks',
    ];
    const lines = [
      header,
      ...records.map(record => {
        const display = getRecordDisplayStatus(record, scheduleContext);
        return [
          getRecordUserId(record),
          getRecordEmployeeName(record),
          getRecordDepartmentName(record),
          getRecordAttendanceDate(record),
          formatPktPunchTime(getRecordCheckInTime(record)) || '',
          formatPktPunchTime(getRecordCheckOutTime(record)) || '',
          getRecordWorkingHoursCompact(record),
          display.label,
          record.deviceIp || record.deviceId || '',
          record.source || '',
          getRecordRemarks(record),
        ];
      }),
    ].map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
    await Share.share({ message: lines.join('\n'), title: 'Attendance.csv' });
  };

  const myColumns = [
    { key: 'date', header: 'Date', width: 120, render: (record: any) => <CellText>{getRecordAttendanceDate(record)}</CellText> },
    { key: 'day', header: 'Day', width: 110, render: (record: any) => <CellText>{getDayNameFromDateKey(getRecordDateKey(record)) || '—'}</CellText> },
    { key: 'department', header: 'Department', width: 140, render: (record: any) => <CellText>{getRecordDepartmentName(record)}</CellText> },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (record: any) => {
        const monthlyStatus = getAttendanceStatusDisplay(record, scheduleContext);
        const tone = STATUS_TONES[monthlyStatus.className] || STATUS_TONES['attendance-status-default'];
        return <Text style={[styles.badge, tone]}>{monthlyStatus.label}</Text>;
      },
    },
    { key: 'in', header: 'Check In', width: 100, render: (record: any) => <CellText strong>{formatPktPunchTime(getRecordCheckInTime(record)) || '—'}</CellText> },
    { key: 'out', header: 'Check Out', width: 110, render: (record: any) => <CellText strong>{formatPktPunchTime(getRecordCheckOutTime(record)) || '—'}</CellText> },
    { key: 'hours', header: 'Work Hours', width: 110, render: (record: any) => <CellText strong>{getRecordWorkingHoursCompact(record)}</CellText> },
  ];

  const adminColumns = [
    { key: 'id', header: 'User ID', width: 110, render: (record: any) => <CellText>{getRecordUserId(record)}</CellText> },
    {
      key: 'name',
      header: 'Name',
      width: 150,
      render: (record: any) => (
        <CellText>{getDisplayName(record.employee) || record.employeeName || '—'}</CellText>
      ),
    },
    { key: 'department', header: 'Department', width: 140, render: (record: any) => <CellText>{getRecordDepartmentName(record)}</CellText> },
    { key: 'date', header: 'Date', width: 120, render: (record: any) => <CellText>{getRecordAttendanceDate(record)}</CellText> },
    { key: 'in', header: 'Check In', width: 100, render: (record: any) => <CellText strong>{formatPktPunchTime(getRecordCheckInTime(record)) || '—'}</CellText> },
    { key: 'out', header: 'Check Out', width: 110, render: (record: any) => <CellText strong>{formatPktPunchTime(getRecordCheckOutTime(record)) || '—'}</CellText> },
    { key: 'hours', header: 'Working Hours', width: 110, render: (record: any) => <CellText strong>{getRecordWorkingHoursCompact(record)}</CellText> },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (record: any) => {
        const displayStatus = getRecordDisplayStatus(record, scheduleContext);
        const tone = STATUS_TONES[displayStatus.className] || STATUS_TONES['attendance-status-default'];
        return <Text style={[styles.badge, tone]}>{displayStatus.label}</Text>;
      },
    },
    { key: 'device', header: 'Device', width: 100, render: (record: any) => <CellText>{record.deviceIp || record.deviceId || '—'}</CellText> },
    { key: 'remarks', header: 'Remarks', width: 180, render: (record: any) => <CellText>{getRecordRemarks(record) || '—'}</CellText> },
    {
      key: 'actions',
      header: '',
      width: 220,
      render: (record: any) => {
        const attendanceId = getEditableAttendanceId(record);
        const canMutate = canUpdateAttendance && Boolean(attendanceId);
        return (
          <View style={styles.actions}>
            <Pressable onPress={() => setViewRecord(record)}>
              <Text style={styles.action}>View</Text>
            </Pressable>
            {canMutate ? (
              <Pressable onPress={() => openEdit(record)}>
                <Text style={styles.action}>Edit</Text>
              </Pressable>
            ) : null}
            {canMutate ? (
              <Pressable onPress={() => remove(record)}>
                <Text style={[styles.action, styles.danger]}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        );
      },
    },
  ];

  const columns = showEmployeeMonthlyView ? myColumns : adminColumns;

  return (
    <ScreenBody onRefresh={refresh} refreshing={refreshing}>
      <Text style={styles.title}>{showEmployeeMonthlyView ? 'My Attendance' : 'Attendance'}</Text>
      <Text style={styles.subtitle}>{pageSubtitle}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <StatGrid items={statItems} />
      <ChipRow
        value=""
        onChange={setPeriod}
        options={[
          { label: 'Today', value: 'day' },
          { label: 'This week', value: 'week' },
          { label: 'This month', value: 'month' },
        ]}
      />
      <DateField label="From" value={from} onChange={setFrom} />
      <DateField label="To" value={to} onChange={setTo} />
      <PrimaryButton label="Refresh" onPress={refresh} tone="teal" />
      {canManageAll ? (
        <>
          <SearchField
            value={userId}
            onChangeText={setUserId}
            placeholder="Search by name, employee ID or email"
          />
          <ChoiceField
            label="Department"
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { label: 'All departments', value: '' },
              ...departments.map(item => ({ label: getDisplayName(item), value: getRecordId(item) })),
            ]}
          />
          <ChoiceField
            label="Status"
            value={status}
            onChange={setStatus}
            options={ATTENDANCE_STATUS_FILTER_OPTIONS}
          />
        </>
      ) : null}
      <View style={styles.row}>
        <PrimaryButton label="CSV" onPress={exportCsv} tone="ghost" />
        {showManualEntry ? (
          <PrimaryButton label="Manual entry" onPress={() => { setForm(emptyForm()); setFormMode('manual'); }} />
        ) : null}
        {canCreateAttendance ? (
          <PrimaryButton
            label="Mark absent"
            onPress={() => { setForm(emptyForm()); setFormMode('absent'); }}
            tone="teal"
          />
        ) : null}
        {canCreateAttendance ? (
          <PrimaryButton
            label="Holiday present"
            onPress={() => { setForm(emptyForm()); setFormMode('holiday'); }}
            tone="ghost"
          />
        ) : null}
        {showEmployeePunch ? (
          <PrimaryButton
            label="Punch in/out"
            onPress={() => { setForm({ ...emptyForm(), employeeId: getRecordId(user) }); setFormMode('punch'); }}
            tone="teal"
          />
        ) : null}
      </View>
      {loading ? <LoadingBlock label="Loading attendance..." /> : null}
      {!loading && records.length === 0 ? (
        <EmptyBlock
          title="No attendance records"
          body={
            showEmployeeMonthlyView
              ? 'No records found for the selected month.'
              : 'No records match your current filters for this date.'
          }
        />
      ) : null}
      {!loading && records.length > 0 ? (
        <DataTable
          rows={records.map((record, index) => ({
            ...record,
            key: `${getRecordDateKey(record)}-${getRecordUserId(record)}-${index}`,
          }))}
          columns={columns}
        />
      ) : null}
      <FormSheet visible={Boolean(formMode)} title={formTitle(formMode)} onClose={() => setFormMode('')}>
        {error ? <Banner kind="error" message={error} /> : null}
        {(formMode === 'manual' || formMode === 'absent') && (
          <ChoiceField
            label="Employee"
            value={form.employeeId}
            onChange={value => setForm(prev => ({ ...prev, employeeId: value }))}
            options={[
              { label: 'Select employee', value: '' },
              ...employees.map(item => ({
                label: `${getDisplayName(item)} (${item.employeeId || ''})`,
                value: getRecordId(item),
              })),
            ]}
          />
        )}
        {formMode === 'holiday' ? (
          <ChoiceField
            label="Department"
            value={form.departmentId}
            onChange={value => setForm(prev => ({ ...prev, departmentId: value }))}
            options={[
              { label: 'Select department', value: '' },
              ...departments.map(item => ({ label: getDisplayName(item), value: getRecordId(item) })),
            ]}
          />
        ) : null}
        {formMode !== 'punch' ? (
          <DateField label="Date" value={form.date} onChange={value => setForm(prev => ({ ...prev, date: value }))} />
        ) : null}
        {(formMode === 'manual' || formMode === 'edit') && (
          <>
            <Field label="Check in (HH:mm)" value={form.checkIn} onChangeText={value => setForm(prev => ({ ...prev, checkIn: value }))} placeholder="09:00" />
            <Field label="Check out (HH:mm)" value={form.checkOut} onChangeText={value => setForm(prev => ({ ...prev, checkOut: value }))} placeholder="17:00" />
          </>
        )}
        <Field label="Remarks" value={form.remarks} onChangeText={value => setForm(prev => ({ ...prev, remarks: value }))} multiline placeholder="Optional remarks" />
        <PrimaryButton label={saving ? 'Saving...' : 'Save'} onPress={save} disabled={saving} />
      </FormSheet>
      <FormSheet
        visible={Boolean(viewRecord)}
        title="Attendance details"
        onClose={() => setViewRecord(null)}>
        {viewRecord ? (
          <CompactCard
            title={getRecordEmployeeName(viewRecord) || 'Record details'}
            body={[
              `User ID: ${getRecordUserId(viewRecord)}`,
              `Department: ${getRecordDepartmentName(viewRecord)}`,
              `Date: ${getRecordAttendanceDate(viewRecord)}`,
              `Check in: ${formatPktPunchTime(getRecordCheckInTime(viewRecord)) || '—'}`,
              `Check out: ${formatPktPunchTime(getRecordCheckOutTime(viewRecord)) || '—'}`,
              `Working hours: ${getRecordWorkingHoursCompact(viewRecord)}`,
              `Status: ${getRecordDisplayStatus(viewRecord, scheduleContext).label}`,
              `Device: ${viewRecord.deviceIp || viewRecord.deviceId || '—'}`,
              `Source: ${show(viewRecord.source)}`,
              `Remarks: ${getRecordRemarks(viewRecord) || '—'}`,
            ].join('\n')}
            actions={
              canUpdateAttendance && getEditableAttendanceId(viewRecord) ? (
                <>
                  <TextAction label="Edit record" onPress={() => { openEdit(viewRecord); setViewRecord(null); }} />
                  <TextAction label="Close" onPress={() => setViewRecord(null)} />
                </>
              ) : (
                <TextAction label="Close" onPress={() => setViewRecord(null)} />
              )
            }
          />
        ) : null}
      </FormSheet>
    </ScreenBody>
  );
}

function formTitle(mode: FormMode) {
  if (mode === 'manual') return 'Manual entry';
  if (mode === 'absent') return 'Mark absent';
  if (mode === 'holiday') return 'Holiday present';
  if (mode === 'punch') return 'Punch in / out';
  if (mode === 'edit') return 'Edit attendance';
  return 'Attendance';
}

const STATUS_TONES: Record<string, { backgroundColor: string; color: string }> = {
  'attendance-status-present': { backgroundColor: 'rgba(30,115,107,0.1)', color: '#1e736b' },
  'attendance-status-pending': { backgroundColor: '#f8fafc', color: '#64748b' },
  'attendance-status-absent': { backgroundColor: '#fef2f2', color: '#dc2626' },
  'attendance-status-missing': { backgroundColor: '#ffedd5', color: '#c2410c' },
  'attendance-status-late': { backgroundColor: '#fff7ed', color: '#c2410c' },
  'attendance-status-working': { backgroundColor: 'rgba(237,136,56,0.12)', color: '#ed8838' },
  'attendance-status-checkout': { backgroundColor: 'rgba(59,130,246,0.1)', color: '#2563eb' },
  'attendance-status-default': { backgroundColor: '#f1f5f9', color: '#64748b' },
};

const styles = StyleSheet.create({
  title: { color: colors.text, fontFamily: type.bold, fontSize: 22 },
  subtitle: { color: colors.muted, fontFamily: type.regular, fontSize: 13, marginTop: -6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: type.bold, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { color: '#1e736b', fontFamily: type.bold, fontSize: 12 },
  danger: { color: '#dc2626' },
});