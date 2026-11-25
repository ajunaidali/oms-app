import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { pick, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  ChoiceField,
  CompactCard,
  DateField,
  EmptyBlock,
  Field,
  FormSheet,
  LoadingBlock,
  PrimaryButton,
  RecordCard,
  ScreenBody,
  SearchField,
  TextAction,
} from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { collectRefIdentityIds, collectUserIdentityIds, getDisplayName, getErrorMessage, getRecordId, unwrapData, unwrapList } from '../../utils/apiHelpers';
import { hasPermission, isSuperAdminUser } from '../../utils/permissionHelpers';
import { getStudioBookingStatus } from '../../utils/studioBookingHelpers';
import { detailEntries, show, titleCase } from '../../utils/display';

type ModuleKey = 'salary' | 'tickets' | 'tasks' | 'projects' | 'assets' | 'feedback' | 'resources' | 'studio' | 'audit' | 'email' | 'uploads';

const configs: Record<ModuleKey, any> = {
  salary: {
    title: 'Salary',
    list: () => apiClient.get(API_ENDPOINTS.SALARIES.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.SALARIES.CALCULATE, {
      employeeId: form.employeeId,
      month: Number(form.month),
      year: Number(form.year),
      assignmentId: form.assignmentId,
      baseSalary: Number(form.baseSalary),
    }),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.SALARIES.BY_ID(id)),
    fields: ['employeeId', 'assignmentId', 'month', 'year', 'baseSalary'],
    titleOf: (row: any) => getDisplayName(row.employee),
  },
  tickets: {
    title: 'Tickets',
    list: () => apiClient.get(API_ENDPOINTS.TICKETS.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.TICKETS.LIST, { ...form, status: 'Open', ticketId: `TKT-${Date.now().toString(36).toUpperCase()}` }),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.TICKETS.BY_ID(id), form),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.TICKETS.BY_ID(id)),
    fields: ['title', 'description', 'category', 'priority', 'reportedAgainst'],
    options: { category: ['hardware', 'software', 'hr', 'other'], priority: ['low', 'medium', 'high'] },
  },
  tasks: {
    title: 'Tasks',
    list: () => apiClient.get(API_ENDPOINTS.TASKS.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.TASKS.LIST, { ...form, assignedTo: form.assignedTo ? [form.assignedTo] : [], taskId: `TSK-${Date.now().toString(36).toUpperCase()}` }),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.TASKS.BY_ID(id), form),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.TASKS.BY_ID(id)),
    fields: ['title', 'description', 'status', 'priority', 'dueDate', 'project', 'assignedTo'],
    options: { status: ['todo', 'in-progress', 'completed'], priority: ['low', 'medium', 'high'] },
  },
  projects: {
    title: 'Projects',
    list: () => apiClient.get(API_ENDPOINTS.PROJECTS.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.PROJECTS.LIST, form),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.PROJECTS.BY_ID(id), form),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.PROJECTS.BY_ID(id)),
    fields: ['name', 'description', 'status', 'department', 'manager', 'startDate', 'dueDate'],
    options: { status: ['planned', 'active', 'on-hold', 'completed'] },
  },
  assets: {
    title: 'Assets',
    list: () => apiClient.get(API_ENDPOINTS.ASSETS.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.ASSETS.LIST, { ...form, quantity: Number(form.quantity) || 1 }),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.ASSETS.BY_ID(id), { ...form, quantity: Number(form.quantity) || 1 }),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.ASSETS.BY_ID(id)),
    fields: ['assetId', 'name', 'category', 'quantity', 'status', 'notes'],
    options: { category: ['laptop', 'phone', 'camera', 'other'], status: ['available', 'assigned', 'maintenance'] },
  },
  feedback: {
    title: 'Feedback',
    list: () => apiClient.get(API_ENDPOINTS.FEEDBACK.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.FEEDBACK.LIST, form),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.FEEDBACK.BY_ID(id), form),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.FEEDBACK.BY_ID(id)),
    fields: ['category', 'subject', 'message', 'priority'],
    options: { category: ['general', 'hr', 'it', 'workplace'], priority: ['low', 'medium', 'high'] },
  },
  resources: {
    title: 'Resources',
    list: () => apiClient.get(API_ENDPOINTS.RESOURCES.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.RESOURCES.LIST, { ...form, cost: Number(form.cost) || 0 }),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.RESOURCES.BY_ID(id), form),
    remove: (id: string) => apiClient.delete(API_ENDPOINTS.RESOURCES.BY_ID(id)),
    renew: (id: string) => apiClient.post(API_ENDPOINTS.RESOURCES.RENEW(id), {}),
    fields: ['name', 'type', 'provider', 'cost', 'currency', 'billingCycle', 'expiryDate', 'status'],
    options: { type: ['domain', 'hosting', 'software', 'other'], billingCycle: ['monthly', 'yearly'], status: ['Active', 'Expired'] },
  },
  studio: {
    title: 'Studio Bookings',
    list: () => apiClient.get(API_ENDPOINTS.STUDIO_BOOKINGS.LIST),
    create: (form: any) => apiClient.post(API_ENDPOINTS.STUDIO_BOOKINGS.LIST, form),
    remove: (id: string) => apiClient.post(API_ENDPOINTS.STUDIO_BOOKINGS.CANCEL(id), {}),
    fields: ['date', 'type', 'title', 'startTime', 'endTime', 'notes', 'guestName', 'guestContact'],
    options: { type: ['podcast', 'shoot'] },
  },
  audit: {
    title: 'Audit Logs',
    list: () => apiClient.get(API_ENDPOINTS.AUDIT_LOGS.LIST),
    fields: [],
  },
  email: {
    title: 'Email Templates',
    list: () => apiClient.get(API_ENDPOINTS.EMAIL_TEMPLATES.LIST),
    update: (id: string, form: any) => apiClient.put(API_ENDPOINTS.EMAIL_TEMPLATES.BY_KEY(id), form),
    fields: ['subject', 'body'],
  },
  uploads: {
    title: 'Uploads',
    list: () => apiClient.get(API_ENDPOINTS.UPLOAD.STATUS),
    fields: [],
  },
};

const PERMISSION_MODULE: Record<ModuleKey, string> = {
  salary: 'salary',
  tickets: 'ticket',
  tasks: 'task',
  projects: 'project',
  assets: 'asset',
  feedback: 'feedback',
  resources: 'resource',
  studio: 'studio-booking',
  audit: 'audit',
  email: 'email-template',
  uploads: 'upload',
};

function canAct(user: any, moduleKey: ModuleKey, action: string) {
  const moduleName = PERMISSION_MODULE[moduleKey];
  return isSuperAdminUser(user) || hasPermission(user, `${moduleName}:${action}`) || hasPermission(user, `${moduleName}:${action}:own`) || hasPermission(user, `${moduleName}:${action}:any`) || hasPermission(user, `${moduleName}:${action}:scoped`);
}

function ownBooking(booking: any, user: any) {
  const userIds = collectUserIdentityIds(user);
  const owners = [booking?.bookedBy, booking?.createdBy, booking?.employee, booking?.user];
  return owners.some(owner => owner != null && [...collectRefIdentityIds(owner)].some(id => userIds.has(id)));
}

export default function WorkScreen({ moduleKey }: { moduleKey: ModuleKey }) {
  const { user } = useAuth();
  const config = configs[moduleKey];
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = async () => {
    const response = await config.list();
    const list = unwrapList(response);
    setRows(list.length ? list : moduleKey === 'uploads' ? [unwrapData(response) || response] : []);
  };

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load records'))).finally(() => setLoading(false));
  }, [moduleKey]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(row => {
      const parts = [
        row?.title,
        row?.name,
        row?.description,
        row?.status,
        row?.category,
        row?.ticketId,
        row?.taskId,
        getDisplayName(row?.employee),
        getDisplayName(row?.bookedBy),
      ];
      return parts.some(part => part != null && String(part).toLowerCase().includes(needle));
    });
  }, [query, rows]);

  const save = async () => {
    try {
      const id = editing ? (moduleKey === 'email' ? editing.key || editing.name || getRecordId(editing) : getRecordId(editing)) : '';
      if (editing && config.update) await config.update(id, form);
      else if (config.create) await config.create(form);
      setSuccess('Saved');
      setOpen(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save'));
    }
  };

  const uploadFile = async (endpoint: string) => {
    try {
      const [file] = await pick({ type: [types.allFiles] });
      const body = new FormData();
      body.append('file', { uri: file.uri, name: file.name || 'upload', type: file.type || 'application/octet-stream' } as any);
      await apiClient.postFormData(endpoint, body);
      setSuccess('File uploaded');
      await load();
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      setError(getErrorMessage(err, 'Upload failed'));
    }
  };

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <SearchField value={query} onChangeText={setQuery} placeholder={`Search ${config.title.toLowerCase()}`} />
      {config.create && canAct(user, moduleKey, 'create') ? <PrimaryButton label={`Add ${config.title}`} onPress={() => { setEditing(null); setForm({}); setOpen(true); }} /> : null}
      {moduleKey === 'uploads' ? (
        <>
          <PrimaryButton label="Upload leaves file" onPress={() => uploadFile(API_ENDPOINTS.UPLOAD.LEAVES)} />
          <PrimaryButton label="Upload tasks file" tone="teal" onPress={() => uploadFile(API_ENDPOINTS.UPLOAD.TASKS)} />
          <PrimaryButton label="Upload tickets file" tone="ghost" onPress={() => uploadFile(API_ENDPOINTS.UPLOAD.TICKETS)} />
          <PrimaryButton label="Upload assets file" tone="ghost" onPress={() => uploadFile(API_ENDPOINTS.UPLOAD.ASSETS)} />
        </>
      ) : null}
      {loading ? <LoadingBlock /> : null}
      {!loading && visible.length === 0 ? <EmptyBlock title={`No ${config.title.toLowerCase()}`} body="Records from the OMS API will appear here." /> : null}
      <View style={styles.list}>
        {visible.map((row, index) => {
          const title = config.titleOf ? config.titleOf(row) : show(row.title || row.name || row.subject || row.action || row.key || `${config.title} ${index + 1}`);
          const badge = row.status ? titleCase(row.status) : undefined;
          const meta = moduleKey === 'studio'
            ? [show(row.date), [row.startTime, row.endTime].filter(Boolean).join(' – '), titleCase(row.type || '')].filter(Boolean).join('  ·  ')
            : moduleKey === 'tasks'
              ? [row.taskId, row.priority ? titleCase(row.priority) : '', row.dueDate ? `Due ${show(row.dueDate)}` : ''].filter(Boolean).join('  ·  ')
              : moduleKey === 'tickets'
                ? [row.ticketId, row.category ? titleCase(row.category) : '', row.priority ? titleCase(row.priority) : ''].filter(Boolean).join('  ·  ')
                : [show(row.type || row.category || row.provider || row.employeeId || row.key), row.priority ? titleCase(row.priority) : ''].filter(Boolean).join('  ·  ');
          const body = show(row.description || row.message || row.notes || row.subject || '');
          const canCancelStudio = moduleKey === 'studio'
            && getStudioBookingStatus(row) !== 'cancelled'
            && getStudioBookingStatus(row) !== 'rejected'
            && (hasPermission(user, 'studio-booking:cancel:any') || ((hasPermission(user, 'studio-booking:cancel:own') || hasPermission(user, 'studio-booking:create')) && ownBooking(row, user)));
          const canApproveStudio = moduleKey === 'studio'
            && getStudioBookingStatus(row) === 'pending'
            && String(row.type || '').toLowerCase() === 'podcast'
            && (isSuperAdminUser(user) || hasPermission(user, 'studio-booking:approve'));
          return (
            <CompactCard
              key={getRecordId(row) || String(index)}
              title={title}
              badge={badge}
              meta={meta || undefined}
              body={body !== '—' ? body : undefined}
              lines={moduleKey === 'studio' && row.guestName ? [`Guest: ${show(row.guestName)}`] : undefined}
              actions={
                <>
                  {config.update && canAct(user, moduleKey, 'update') ? <TextAction label="Edit" onPress={() => { setEditing(row); setForm(Object.fromEntries(config.fields.map((key: string) => [key, row[key] == null ? '' : String(row[key])]))); setOpen(true); }} /> : null}
                  {canApproveStudio ? <TextAction label="Approve" onPress={async () => { await apiClient.post(API_ENDPOINTS.STUDIO_BOOKINGS.APPROVE(getRecordId(row)), {}); await load(); }} /> : null}
                  {canApproveStudio ? <TextAction label="Reject" tone="danger" onPress={async () => { await apiClient.post(API_ENDPOINTS.STUDIO_BOOKINGS.REJECT(getRecordId(row)), { reason: 'Rejected from mobile' }); await load(); }} /> : null}
                  {config.renew && canAct(user, moduleKey, 'update') ? <TextAction label="Renew" onPress={async () => { await config.renew(getRecordId(row)); setSuccess('Renewed'); await load(); }} /> : null}
                  {(moduleKey === 'studio' ? canCancelStudio : config.remove && canAct(user, moduleKey, 'delete')) ? (
                    <TextAction
                      label={moduleKey === 'studio' ? 'Cancel' : 'Delete'}
                      tone="danger"
                      onPress={() => Alert.alert('Confirm', 'Continue?', [{ text: 'No', style: 'cancel' }, { text: 'Yes', onPress: async () => { await config.remove(getRecordId(row)); await load(); } }])}
                    />
                  ) : null}
                  {moduleKey === 'tasks' && canAct(user, moduleKey, 'update') ? (
                    <TextAction label="Comment" tone="muted" onPress={async () => {
                      await apiClient.post(API_ENDPOINTS.TASKS.COMMENT(getRecordId(row)), { comment: 'Updated from the Android app' });
                      setSuccess('Comment added');
                    }} />
                  ) : null}
                </>
              }
            />
          );
        })}
      </View>
      <FormSheet visible={open} title={editing ? `Edit ${config.title}` : `Create ${config.title}`} onClose={() => setOpen(false)}>
        {config.fields.map((key: string) => {
          const options = config.options?.[key];
          if (options) {
            return <ChoiceField key={key} label={titleCase(key)} value={form[key] || ''} onChange={value => setForm(prev => ({ ...prev, [key]: value }))} options={[{ label: 'Select', value: '' }, ...options.map((option: string) => ({ label: titleCase(option), value: option }))]} />;
          }
          if (key.toLowerCase().includes('date') || key === 'expiryDate') {
            return <DateField key={key} label={titleCase(key)} value={form[key] || ''} onChange={value => setForm(prev => ({ ...prev, [key]: value }))} />;
          }
          return <Field key={key} label={titleCase(key)} value={form[key] || ''} onChangeText={value => setForm(prev => ({ ...prev, [key]: value }))} multiline={['description', 'message', 'notes', 'body'].includes(key)} />;
        })}
        <PrimaryButton label="Save" onPress={save} />
      </FormSheet>
    </ScreenBody>
  );
}

export function AttendanceImportScreen() {
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitText = async () => {
    if (!content.trim()) {
      setError('Paste the attendance file contents first');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.post(API_ENDPOINTS.IMPORT.TEXT, { fileContent: content });
      setResult(JSON.stringify(unwrapData(response) || response, null, 2));
    } catch (err) {
      setError(getErrorMessage(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitFile = async () => {
    try {
      const [file] = await pick({ type: [types.allFiles] });
      const body = new FormData();
      body.append('file', { uri: file.uri, name: file.name || 'attendance.dat', type: file.type || 'text/plain' } as any);
      setBusy(true);
      const response = await apiClient.postFormData(API_ENDPOINTS.IMPORT.UPLOAD, body);
      setResult(JSON.stringify(unwrapData(response) || response, null, 2));
    } catch (err: any) {
      if (!(isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)) {
        setError(getErrorMessage(err, 'File import failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenBody>
      {error ? <Banner kind="error" message={error} /> : null}
      <Field label="Attendance file contents" value={content} onChangeText={setContent} multiline placeholder="Paste .dat or .txt device export" />
      <PrimaryButton label={busy ? 'Importing...' : 'Import pasted text'} onPress={submitText} disabled={busy} />
      <PrimaryButton label="Import a file" tone="teal" onPress={submitFile} disabled={busy} />
      {result ? <RecordCard title="Import result" rows={[{ label: 'Response', value: result }]} /> : <EmptyBlock title="No import yet" body="Use the same attendance import the website sends to the OMS server." />}
    </ScreenBody>
  );
}

export function AttendanceLogsScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [list, stat] = await Promise.all([
      apiClient.get(API_ENDPOINTS.ATTENDANCE_LOGS.LIST),
      apiClient.get(API_ENDPOINTS.ATTENDANCE_LOGS.STATS).catch(() => null),
    ]);
    setRows(unwrapList(list));
    setStats(unwrapData(stat));
  };

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load attendance logs'))).finally(() => setLoading(false));
  }, []);

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {stats ? <RecordCard title="Log stats" rows={detailEntries(stats).slice(0, 8)} /> : null}
      {loading ? <LoadingBlock /> : null}
      {rows.map((row, index) => (
        <RecordCard
          key={getRecordId(row) || index}
          title={show(row.action || row.status || 'Log')}
          subtitle={show(row.createdAt)}
          rows={detailEntries(row).slice(0, 6)}
          actions={<PrimaryButton label="Reprocess" tone="teal" onPress={async () => {
            try {
              await apiClient.post(API_ENDPOINTS.ATTENDANCE_LOGS.REPROCESS(getRecordId(row)), {});
              await load();
            } catch (err) {
              setError(getErrorMessage(err, 'Could not reprocess log'));
            }
          }} />}
        />
      ))}
      {rows.length ? <PrimaryButton label="Share logs" tone="ghost" onPress={() => Share.share({ message: JSON.stringify(rows.slice(0, 30), null, 2) })} /> : null}
    </ScreenBody>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
});
