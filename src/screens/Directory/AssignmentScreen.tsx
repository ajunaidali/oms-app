import React, { Fragment, useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  ChoiceField,
  EmptyBlock,
  Field,
  FormSheet,
  LoadingBlock,
  CompactCard,
  PrimaryButton,
  ScreenBody,
  SearchField,
  TextAction,
} from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getErrorMessage, getRecordId, unwrapList } from '../../utils/apiHelpers';
import {
  DEFAULT_SCHEDULE_FORM,
  WEEK_DAYS,
  buildAssignmentPayload,
  formatWorkScheduleSummary,
  validateAssignmentForm,
} from '../../utils/assignmentHelpers';
import { canPerform } from '../../utils/permissionHelpers';
import { show } from '../../utils/display';

export default function AssignmentScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ employee: '', department: '', position: '', isPrimary: 'true', settimestampMinutes: '180' });
  const [schedule, setSchedule] = useState<any>(DEFAULT_SCHEDULE_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [assignmentRes, employeeRes, departmentRes, positionRes] = await Promise.all([
      apiClient.get(API_ENDPOINTS.ASSIGNMENTS.LIST),
      apiClient.get(API_ENDPOINTS.EMPLOYEES.LIST),
      apiClient.get(API_ENDPOINTS.DEPARTMENTS.LIST),
      apiClient.get(API_ENDPOINTS.POSITIONS.LIST),
    ]);
    setRows(unwrapList(assignmentRes));
    setEmployees(unwrapList(employeeRes));
    setDepartments(unwrapList(departmentRes));
    setPositions(unwrapList(positionRes));
  }, []);

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load assignments'))).finally(() => setLoading(false));
  }, [load]);

  const save = async () => {
    const validation = validateAssignmentForm(form, schedule);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = buildAssignmentPayload(form, schedule);
      if (editing) await apiClient.put(API_ENDPOINTS.ASSIGNMENTS.BY_ID(getRecordId(editing)), body);
      else await apiClient.post(API_ENDPOINTS.ASSIGNMENTS.LIST, body);
      setSuccess(editing ? 'Assignment updated' : 'Assignment created');
      setOpen(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save assignment'));
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: any) => {
    Alert.alert('Delete assignment', 'Are you sure you want to delete this assignment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(API_ENDPOINTS.ASSIGNMENTS.BY_ID(getRecordId(row)));
            await load();
          } catch (err) {
            setError(getErrorMessage(err, 'Could not delete assignment'));
          }
        },
      },
    ]);
  };

  const filtered = rows.filter(row => JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <SearchField value={query} onChangeText={setQuery} placeholder="Search assignments" />
      {canPerform(user, 'assignment', 'create') ? (
        <PrimaryButton label="Add assignment" onPress={() => { setEditing(null); setForm({ employee: '', department: '', position: '', isPrimary: 'true', settimestampMinutes: '180' }); setSchedule(DEFAULT_SCHEDULE_FORM); setOpen(true); }} />
      ) : null}
      {loading ? <LoadingBlock /> : null}
      {!loading && filtered.length === 0 ? <EmptyBlock title="No assignments" body="Department assignments will appear here." /> : null}
      {filtered.map(row => (
        <CompactCard
          key={getRecordId(row)}
          title={getDisplayName(row.employee)}
          badge={row.isPrimary ? 'Primary' : 'Secondary'}
          meta={getDisplayName(row.position)}
          lines={[
            `Department: ${show(row.department)}`,
            `Schedule: ${formatWorkScheduleSummary(row.workSchedule)}`,
            `Dedup minutes: ${show(row.settimestampMinutes)}`,
          ]}
          actions={
            <>
              {canPerform(user, 'assignment', 'update') ? <TextAction label="Edit" onPress={() => { setEditing(row); setForm({ employee: getRecordId(row.employee), department: getRecordId(row.department), position: getRecordId(row.position), isPrimary: row.isPrimary ? 'true' : 'false', settimestampMinutes: String(row.settimestampMinutes || 180) }); setSchedule({ ...DEFAULT_SCHEDULE_FORM, ...(row.workSchedule || {}) }); setOpen(true); }} /> : null}
              {canPerform(user, 'assignment', 'delete') ? <TextAction label="Delete" tone="danger" onPress={() => remove(row)} /> : null}
            </>
          }
        />
      ))}
      <FormSheet visible={open} title={editing ? 'Edit assignment' : 'Create assignment'} onClose={() => setOpen(false)}>
        <ChoiceField label="Employee *" value={form.employee} onChange={value => setForm((prev: any) => ({ ...prev, employee: value }))} options={[{ label: 'Select employee', value: '' }, ...employees.map(item => ({ label: `${getDisplayName(item)} (${item.employeeId || ''})`, value: getRecordId(item) }))]} />
        <ChoiceField label="Department *" value={form.department} onChange={value => setForm((prev: any) => ({ ...prev, department: value }))} options={[{ label: 'Select department', value: '' }, ...departments.map(item => ({ label: getDisplayName(item), value: getRecordId(item) }))]} />
        <ChoiceField label="Position *" value={form.position} onChange={value => setForm((prev: any) => ({ ...prev, position: value }))} options={[{ label: 'Select position', value: '' }, ...positions.map(item => ({ label: getDisplayName(item), value: getRecordId(item) }))]} />
        <ChoiceField label="Primary" value={form.isPrimary} onChange={value => setForm((prev: any) => ({ ...prev, isPrimary: value }))} options={[{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]} />
        <Field label="Dedup window (minutes)" value={form.settimestampMinutes} onChangeText={value => setForm((prev: any) => ({ ...prev, settimestampMinutes: value }))} keyboardType="numeric" />
        {WEEK_DAYS.map(day => (
          <Fragment key={day}>
            <ChoiceField label={`${day} off`} value={schedule[day]?.isOff ? 'true' : 'false'} onChange={value => setSchedule((prev: any) => ({ ...prev, [day]: { ...prev[day], isOff: value === 'true' } }))} options={[{ label: 'Working', value: 'false' }, { label: 'Off', value: 'true' }]} />
            {!schedule[day]?.isOff ? (
              <>
                <Field label={`${day} check in`} value={schedule[day]?.checkInTime || ''} onChangeText={value => setSchedule((prev: any) => ({ ...prev, [day]: { ...prev[day], checkInTime: value } }))} placeholder="09:00" />
                <Field label={`${day} check out`} value={schedule[day]?.checkOutTime || ''} onChangeText={value => setSchedule((prev: any) => ({ ...prev, [day]: { ...prev[day], checkOutTime: value } }))} placeholder="17:00" />
              </>
            ) : null}
          </Fragment>
        ))}
        <PrimaryButton label={saving ? 'Saving...' : 'Save assignment'} onPress={save} disabled={saving} />
      </FormSheet>
    </ScreenBody>
  );
}
