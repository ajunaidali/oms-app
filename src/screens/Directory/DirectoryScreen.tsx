import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { canPerform } from '../../utils/permissionHelpers';
import { updateDepartmentLeaveQuota } from '../../utils/leaveHelpers';
import { show } from '../../utils/display';

type Kind = 'department' | 'employee' | 'position';

const blank: Record<Kind, any> = {
  department: { name: '', code: '', description: '', parentDepartment: '', hrManager: '', teamLead: '', checkInMinutes: '0', checkOutMinutes: '0', year: String(new Date().getFullYear()), casual: '10', sick: '10', annual: '10' },
  employee: { employeeId: '', name: '', email: '', password: '', role: '', phone: '', cnic: '', address: '', biometricId: '', biometricPassword: '' },
  position: { name: '', description: '' },
};

export default function DirectoryScreen({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const moduleName = kind === 'position' ? 'position' : kind;
  const canCreate = canPerform(user, moduleName, 'create');
  const canUpdate = canPerform(user, moduleName, 'update');
  const canDelete = canPerform(user, moduleName, 'delete');
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(blank[kind]);
  const [saving, setSaving] = useState(false);

  const endpoint = kind === 'department' ? API_ENDPOINTS.DEPARTMENTS.LIST : kind === 'employee' ? API_ENDPOINTS.EMPLOYEES.LIST : API_ENDPOINTS.POSITIONS.LIST;
  const byId = (id: string) => kind === 'department' ? API_ENDPOINTS.DEPARTMENTS.BY_ID(id) : kind === 'employee' ? API_ENDPOINTS.EMPLOYEES.BY_ID(id) : API_ENDPOINTS.POSITIONS.BY_ID(id);

  const load = useCallback(async () => {
    const response = await apiClient.get(endpoint);
    setRows(unwrapList(response));
    if (kind === 'employee') {
      setRoles(unwrapList(await apiClient.get(API_ENDPOINTS.ROLES.LIST).catch(() => [])));
    }
    if (kind === 'department') {
      setDepartments(unwrapList(response));
    }
  }, [endpoint, kind]);

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load records'))).finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (err) { setError(getErrorMessage(err, 'Could not load records')); }
    setRefreshing(false);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(row => JSON.stringify(row).toLowerCase().includes(needle));
  }, [query, rows]);

  const set = (key: string, value: string) => setForm((prev: any) => ({ ...prev, [key]: value }));

  const payload = () => {
    if (kind === 'position') {
      return { name: form.name.trim(), description: form.description.trim() };
    }
    if (kind === 'department') {
      return {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        parentDepartment: form.parentDepartment || null,
        hrManager: form.hrManager.trim() || null,
        teamLead: form.teamLead.trim() || null,
        leverageTime: {
          checkInMinutes: Number(form.checkInMinutes) || 0,
          checkOutMinutes: Number(form.checkOutMinutes) || 0,
        },
      };
    }
    const body: any = { name: form.name.trim(), email: form.email.trim() };
    if (!editing && form.employeeId.trim()) body.employeeId = form.employeeId.trim().toUpperCase();
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.cnic.trim()) body.cnic = form.cnic.trim();
    if (form.address.trim()) body.address = form.address.trim();
    if (form.biometricId !== '') body.biometricId = Number(form.biometricId);
    if (form.biometricPassword !== '') body.biometricPassword = Number(form.biometricPassword);
    if (!editing || form.password.trim()) body.password = form.password;
    if (form.role) body.role = form.role;
    return body;
  };

  const save = async () => {
    if (kind !== 'position' && kind !== 'department' && !form.name.trim()) return;
    if ((kind === 'employee' || kind === 'department' || kind === 'position') && !form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (kind === 'employee' && (!form.email.trim() || !form.role || (!editing && !form.password.trim()))) {
      setError('Name, email, role, and password are required');
      return;
    }
    if (kind === 'department' && !form.code.trim()) {
      setError('Department code is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) await apiClient.put(byId(getRecordId(editing)), payload());
      else await apiClient.post(endpoint, payload());
      setSuccess(editing ? 'Updated' : 'Created');
      setOpen(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const applyQuota = async () => {
    if (!editing) return;
    Alert.alert('Apply leave quotas', 'This overwrites quotas for every employee in the department.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply',
        onPress: async () => {
          try {
            await updateDepartmentLeaveQuota(apiClient, API_ENDPOINTS, getRecordId(editing), {
              year: form.year,
              quotas: { casual: Number(form.casual), sick: Number(form.sick), annual: Number(form.annual) },
            });
            setSuccess('Leave quotas applied');
          } catch (err) {
            setError(getErrorMessage(err, 'Could not apply quotas'));
          }
        },
      },
    ]);
  };

  const remove = (row: any) => {
    Alert.alert('Delete', `Delete ${getDisplayName(row)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(byId(getRecordId(row)));
            setSuccess('Deleted');
            await load();
          } catch (err) {
            setError(getErrorMessage(err, 'Could not delete'));
          }
        },
      },
    ]);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    if (kind === 'department') {
      setForm({
        ...blank.department,
        name: row.name || '',
        code: row.code || '',
        description: row.description || '',
        parentDepartment: getRecordId(row.parentDepartment) || '',
        hrManager: typeof row.hrManager === 'string' ? row.hrManager : getDisplayName(row.hrManager) === '—' ? '' : getDisplayName(row.hrManager),
        teamLead: typeof row.teamLead === 'string' ? row.teamLead : '',
        checkInMinutes: String(row.leverageTime?.checkInMinutes ?? 0),
        checkOutMinutes: String(row.leverageTime?.checkOutMinutes ?? 0),
      });
    } else if (kind === 'employee') {
      setForm({
        ...blank.employee,
        employeeId: row.employeeId || '',
        name: row.name || '',
        email: row.email || '',
        role: getRecordId(row.role) || '',
        phone: row.phone || '',
        cnic: row.cnic || '',
        address: row.address || '',
        biometricId: row.biometricId == null ? '' : String(row.biometricId),
        biometricPassword: '',
      });
    } else {
      setForm({ name: row.name || '', description: row.description || '' });
    }
    setOpen(true);
  };

  const title = kind === 'department' ? 'Department' : kind === 'employee' ? 'Employee' : 'Positions';

  return (
    <ScreenBody onRefresh={refresh} refreshing={refreshing}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <SearchField value={query} onChangeText={setQuery} placeholder={`Search ${title.toLowerCase()}...`} />
      {canCreate ? (
        <PrimaryButton label={`Add ${title}`} onPress={() => { setEditing(null); setForm(blank[kind]); setOpen(true); }} />
      ) : null}
      {loading ? <LoadingBlock /> : null}
      {!loading && visible.length === 0 ? <EmptyBlock title={`No ${title.toLowerCase()} records`} body={query.trim() ? 'Nothing matches this search.' : 'The server returned no records for this account.'} /> : null}
      {visible.map(row => (
        <CompactCard
          key={getRecordId(row) || row.name}
          title={getDisplayName(row)}
          meta={kind === 'employee' ? row.employeeId : row.code || ''}
          lines={cardRows(kind, row).map(item => `${item.label}: ${item.value}`)}
          actions={
            <>
              {canUpdate ? <TextAction label="Edit" onPress={() => openEdit(row)} /> : null}
              {canDelete ? <TextAction label="Delete" tone="danger" onPress={() => remove(row)} /> : null}
            </>
          }
        />
      ))}
      <FormSheet visible={open} title={editing ? `Edit ${title}` : `Create ${title}`} onClose={() => setOpen(false)}>
        {error ? <Banner kind="error" message={error} /> : null}
        {kind === 'employee' ? <Field label="Employee ID (optional)" value={form.employeeId} onChangeText={value => set('employeeId', value)} placeholder="OTS0001" /> : null}
        <Field label="Name *" value={form.name} onChangeText={value => set('name', value)} />
        {kind === 'department' ? <Field label="Code *" value={form.code} onChangeText={value => set('code', value)} /> : null}
        {kind === 'position' ? <Field label="Description" value={form.description} onChangeText={value => set('description', value)} multiline /> : null}
        {kind === 'employee' ? (
          <>
            <Field label="Email *" value={form.email} onChangeText={value => set('email', value)} keyboardType="email-address" />
            <Field label={editing ? 'Password (blank keeps current)' : 'Password *'} value={form.password} onChangeText={value => set('password', value)} secure />
            <ChoiceField label="Role *" value={form.role} onChange={value => set('role', value)} options={[{ label: 'Select a role', value: '' }, ...roles.map(role => ({ label: role.name, value: getRecordId(role) }))]} />
            <Field label="Phone" value={form.phone} onChangeText={value => set('phone', value)} keyboardType="phone-pad" />
            <Field label="CNIC" value={form.cnic} onChangeText={value => set('cnic', value)} placeholder="12345-1234567-1" hint="Optional. Format XXXXX-XXXXXXX-X" />
            <Field label="Address" value={form.address} onChangeText={value => set('address', value)} multiline />
            <Field label="Biometric ID" value={form.biometricId} onChangeText={value => set('biometricId', value)} keyboardType="numeric" />
            <Field label="Biometric Password" value={form.biometricPassword} onChangeText={value => set('biometricPassword', value)} keyboardType="numeric" />
          </>
        ) : null}
        {kind === 'department' ? (
          <>
            <ChoiceField label="Parent department" value={form.parentDepartment} onChange={value => set('parentDepartment', value)} options={[{ label: 'None', value: '' }, ...departments.filter(item => getRecordId(item) !== getRecordId(editing)).map(item => ({ label: getDisplayName(item), value: getRecordId(item) }))]} />
            <Field label="HR manager" value={form.hrManager} onChangeText={value => set('hrManager', value)} />
            <Field label="Team lead" value={form.teamLead} onChangeText={value => set('teamLead', value)} />
            <Field label="Check-in grace minutes" value={form.checkInMinutes} onChangeText={value => set('checkInMinutes', value)} keyboardType="numeric" />
            <Field label="Check-out grace minutes" value={form.checkOutMinutes} onChangeText={value => set('checkOutMinutes', value)} keyboardType="numeric" />
            {editing ? (
              <>
                <Field label="Quota year" value={form.year} onChangeText={value => set('year', value)} keyboardType="numeric" />
                <Field label="Casual quota" value={form.casual} onChangeText={value => set('casual', value)} keyboardType="numeric" />
                <Field label="Sick quota" value={form.sick} onChangeText={value => set('sick', value)} keyboardType="numeric" />
                <Field label="Annual quota" value={form.annual} onChangeText={value => set('annual', value)} keyboardType="numeric" />
                <PrimaryButton label="Apply department quotas" tone="teal" onPress={applyQuota} />
              </>
            ) : null}
          </>
        ) : null}
        <PrimaryButton label={saving ? 'Saving...' : editing ? 'Update' : 'Save'} onPress={save} disabled={saving} />
      </FormSheet>
    </ScreenBody>
  );
}

function cardRows(kind: Kind, row: any) {
  if (kind === 'employee') {
    return [
      { label: 'Email', value: show(row.email) },
      { label: 'Phone', value: show(row.phone) },
      { label: 'Role', value: show(row.role) },
      { label: 'CNIC', value: show(row.cnic) },
      { label: 'Biometric ID', value: show(row.biometricId) },
    ];
  }
  if (kind === 'department') {
    return [
      { label: 'Code', value: show(row.code) },
      { label: 'Description', value: show(row.description) },
      { label: 'Parent', value: show(row.parentDepartment) },
      { label: 'Check-in grace', value: show(row.leverageTime?.checkInMinutes) },
      { label: 'Check-out grace', value: show(row.leverageTime?.checkOutMinutes) },
    ];
  }
  return [{ label: 'Description', value: show(row.description) }];
}
