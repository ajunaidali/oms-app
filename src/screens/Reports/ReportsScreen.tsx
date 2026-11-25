import React, { useState } from 'react';
import { Share } from 'react-native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  ChipRow,
  EmptyBlock,
  Field,
  LoadingBlock,
  PrimaryButton,
  RecordCard,
  ScreenBody,
} from '../../components/common/Ui';
import { getErrorMessage, unwrapList } from '../../utils/apiHelpers';
import { detailEntries, show } from '../../utils/display';

const REPORTS = [
  { id: 'attendance', label: 'Attendance', endpoint: API_ENDPOINTS.REPORTS.ATTENDANCE },
  { id: 'employee', label: 'Employees', endpoint: API_ENDPOINTS.REPORTS.EMPLOYEE_WISE },
  { id: 'monthly', label: 'Monthly', endpoint: API_ENDPOINTS.REPORTS.MONTHLY_SUMMARY },
  { id: 'salary', label: 'Salary', endpoint: API_ENDPOINTS.REPORTS.SALARY_SUMMARY },
  { id: 'department', label: 'Departments', endpoint: API_ENDPOINTS.REPORTS.DEPARTMENT_WISE },
];

export default function ReportsScreen() {
  const [report, setReport] = useState(REPORTS[0].id);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    const active = REPORTS.find(item => item.id === report) || REPORTS[0];
    setLoading(true);
    setError('');
    try {
      const monthKey = `${year}-${month.padStart(2, '0')}`;
      const query = active.id === 'monthly' || active.id === 'salary'
        ? `month=${month}&year=${year}`
        : `month=${encodeURIComponent(monthKey)}`;
      const response = await apiClient.get(`${active.endpoint}?${query}`);
      const list = unwrapList(response);
      setRows(list.length ? list : response?.data ? [response.data] : []);
    } catch (err) {
      setRows([]);
      setError(getErrorMessage(err, 'Could not generate report'));
    } finally {
      setLoading(false);
    }
  };

  const share = async () => {
    const lines = rows.map(row => detailEntries(row).map(([key, value]) => `${key}: ${value}`).join(' | '));
    await Share.share({ message: lines.join('\n') || 'No rows', title: 'OMS report' });
  };

  return (
    <ScreenBody>
      <ChipRow value={report} onChange={setReport} options={REPORTS.map(item => ({ label: item.label, value: item.id }))} />
      <Field label="Month" value={month} onChangeText={setMonth} keyboardType="numeric" />
      <Field label="Year" value={year} onChangeText={setYear} keyboardType="numeric" />
      <PrimaryButton label={loading ? 'Generating...' : 'Generate report'} onPress={generate} disabled={loading} />
      {rows.length ? <PrimaryButton label="Share report" tone="ghost" onPress={share} /> : null}
      {error ? <Banner kind="error" message={error} /> : null}
      {loading ? <LoadingBlock label="Generating report..." /> : null}
      {!loading && rows.length === 0 ? <EmptyBlock title="No report yet" body="Choose a report and generate it from the live OMS data." /> : null}
      {rows.map((row, index) => (
        <RecordCard key={index} title={show(row.name || row.employee || row.department || `Row ${index + 1}`)} rows={detailEntries(row).slice(0, 12)} />
      ))}
    </ScreenBody>
  );
}

const EXPORTS = [
  { label: 'Attendance', endpoint: API_ENDPOINTS.EXPORT.ATTENDANCE },
  { label: 'Employees', endpoint: API_ENDPOINTS.EXPORT.EMPLOYEES },
  { label: 'Tasks', endpoint: API_ENDPOINTS.EXPORT.TASKS },
  { label: 'Tickets', endpoint: API_ENDPOINTS.EXPORT.TICKETS },
  { label: 'Departments', endpoint: API_ENDPOINTS.EXPORT.DEPARTMENTS },
  { label: 'Salaries', endpoint: API_ENDPOINTS.EXPORT.SALARIES },
  { label: 'Audit logs', endpoint: API_ENDPOINTS.EXPORT.AUDIT_LOGS },
];

export function ExportScreen() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const run = async (item: { label: string; endpoint: string }) => {
    setBusy(item.label);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.download(item.endpoint);
      const text = typeof result.blob?.text === 'function' ? await result.blob.text() : `${item.label} export completed`;
      await Share.share({ message: text.slice(0, 20000), title: `${item.label} export` });
      setMessage(`${item.label} export is ready`);
    } catch (err) {
      setError(getErrorMessage(err, `Could not export ${item.label}`));
    } finally {
      setBusy('');
    }
  };

  return (
    <ScreenBody>
      {error ? <Banner kind="error" message={error} /> : null}
      {message ? <Banner kind="success" message={message} /> : null}
      {EXPORTS.map(item => (
        <PrimaryButton key={item.label} label={busy === item.label ? 'Exporting...' : `Export ${item.label}`} tone="teal" onPress={() => run(item)} disabled={Boolean(busy)} />
      ))}
    </ScreenBody>
  );
}
