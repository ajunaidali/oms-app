import React, { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
  ChoiceField,
  Field,
  LoadingBlock,
  PrimaryButton,
  RecordCard,
  ScreenBody,
} from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, unwrapData } from '../../utils/apiHelpers';
import { BOOLEAN_SETTING_KEYS, SETTING_META, formatSettingLabel, invalidateSettingsCache } from '../../utils/settingsHelpers';
import { hasPermission } from '../../utils/permissionHelpers';

function normalizeSettings(payload: any) {
  const data = unwrapData(payload) || payload;
  if (Array.isArray(data)) return data.map(item => ({ key: item.key || item.name, value: item.value }));
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .filter(([key]) => !['success', 'message', 'status'].includes(key))
      .map(([key, value]) => ({ key, value }));
  }
  return [];
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const canUpdate = hasPermission(user, 'settings:update');
  const [settings, setSettings] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [health, setHealth] = useState('');

  const load = async () => {
    const list = normalizeSettings(await apiClient.get(API_ENDPOINTS.SETTINGS.LIST));
    setSettings(list);
    setDrafts(Object.fromEntries(list.map(item => [item.key, item.value == null ? '' : typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)])));
  };

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load settings'))).finally(() => setLoading(false));
  }, []);

  const save = async (key: string) => {
    let value: any = drafts[key];
    if (BOOLEAN_SETTING_KEYS.has(key)) value = value === 'true';
    else if (value !== '' && !Number.isNaN(Number(value)) && SETTING_META[key] && key.toLowerCase().includes('allowed')) value = Number(value);
    try {
      if (key === 'leaveTypes') value = JSON.parse(drafts[key]);
    } catch {
      setError('Leave types must be valid JSON');
      return;
    }
    try {
      await apiClient.put(API_ENDPOINTS.SETTINGS.LIST, { key, value });
      invalidateSettingsCache();
      setSuccess(`${formatSettingLabel(key)} saved`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save setting'));
    }
  };

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      {loading ? <LoadingBlock /> : null}
      {settings.map(setting => (
        <RecordCard
          key={setting.key}
          title={formatSettingLabel(setting.key)}
          subtitle={SETTING_META[setting.key]?.description || setting.key}
          actions={
            <>
              {BOOLEAN_SETTING_KEYS.has(setting.key) ? (
                <ChoiceField label="Value" value={drafts[setting.key]} onChange={value => setDrafts(prev => ({ ...prev, [setting.key]: value }))} options={[{ label: 'Enabled', value: 'true' }, { label: 'Disabled', value: 'false' }]} />
              ) : (
                <Field label="Value" value={drafts[setting.key] || ''} onChangeText={value => setDrafts(prev => ({ ...prev, [setting.key]: value }))} multiline={setting.key === 'leaveTypes'} />
              )}
              {canUpdate ? <PrimaryButton label="Save" onPress={() => save(setting.key)} /> : null}
            </>
          }
        />
      ))}
      <PrimaryButton label="Check biometric health" tone="teal" onPress={async () => {
        try {
          const response = await apiClient.get(API_ENDPOINTS.BIOMETRIC.HEALTH);
          setHealth(JSON.stringify(unwrapData(response) || response));
        } catch (err) {
          setError(getErrorMessage(err, 'Biometric device is not reachable'));
        }
      }} />
      <PrimaryButton label="Sync biometric time" tone="ghost" onPress={async () => {
        try {
          await apiClient.post(API_ENDPOINTS.BIOMETRIC.SYNC_TIME, {});
          setSuccess('Biometric time sync requested');
        } catch (err) {
          setError(getErrorMessage(err, 'Could not sync biometric time'));
        }
      }} />
      {health ? <Banner kind="success" message={health} /> : null}
    </ScreenBody>
  );
}
