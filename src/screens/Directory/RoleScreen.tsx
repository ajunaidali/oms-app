import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import {
  Banner,
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
import { colors, type } from '../../theme/theme';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABELS } from '../../config/permissions';
import { getErrorMessage, getRecordId, unwrapList } from '../../utils/apiHelpers';
import {
  collapseImpliedPermissions,
  expandRolePermissions,
  getImpliedPermissions,
  hasPermission,
} from '../../utils/permissionHelpers';

export default function RoleScreen() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const canCreate = hasPermission(user, 'role:create:any') || hasPermission(user, 'role:create');
  const canUpdate = hasPermission(user, 'role:update:any') || hasPermission(user, 'role:update');
  const canDelete = hasPermission(user, 'role:delete:any') || hasPermission(user, 'role:delete');

  const load = async () => {
    setRoles(unwrapList(await apiClient.get(API_ENDPOINTS.ROLES.LIST)));
  };

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load roles'))).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => roles.filter(role => `${role.name} ${role.description || ''}`.toLowerCase().includes(query.trim().toLowerCase())),
    [query, roles],
  );

  const toggle = (permission: string) => {
    setSelected(current => current.includes(permission) ? current.filter(item => item !== permission) : [...current, permission]);
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Role name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const expanded = expandRolePermissions(selected);
      if (!editing) {
        await apiClient.post(API_ENDPOINTS.ROLES.LIST, { name: name.trim(), description: description.trim(), permissions: expanded });
      } else {
        const id = getRecordId(editing);
        await apiClient.put(API_ENDPOINTS.ROLES.BY_ID(id), { name: name.trim(), description: description.trim() });
        const original = expandRolePermissions(editing.permissions || []);
        const toAdd = expanded.filter((item: string) => !original.includes(item));
        const implied = new Set(getImpliedPermissions(expanded));
        const toRemove = original.filter((item: string) => !expanded.includes(item) && !implied.has(item));
        if (toAdd.length) await apiClient.patch(API_ENDPOINTS.ROLES.ADD_PERMISSIONS(id), { permissions: toAdd });
        if (toRemove.length) await apiClient.delete(API_ENDPOINTS.ROLES.REMOVE_PERMISSIONS(id), { permissions: toRemove });
      }
      setSuccess(editing ? 'Role updated' : 'Role created');
      setOpen(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save role'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <SearchField value={query} onChangeText={setQuery} placeholder="Search roles" />
      {canCreate ? <PrimaryButton label="Add role" onPress={() => { setEditing(null); setName(''); setDescription(''); setSelected([]); setOpen(true); }} /> : null}
      {loading ? <LoadingBlock /> : null}
      {!loading && visible.length === 0 ? <EmptyBlock title="No roles" body="Roles you can read will appear here." /> : null}
      {visible.map(role => (
        <CompactCard
          key={getRecordId(role)}
          title={role.name}
          meta={role.description || 'No description'}
          lines={[`Permissions: ${(role.permissions || []).length}`]}
          actions={canUpdate || canDelete ? (
            <>
              {canUpdate ? <TextAction label="Edit" onPress={() => { setEditing(role); setName(role.name || ''); setDescription(role.description || ''); setSelected(collapseImpliedPermissions(role.permissions || [])); setOpen(true); }} /> : null}
              {canDelete ? <TextAction label="Delete" tone="danger" onPress={async () => {
                try { await apiClient.delete(API_ENDPOINTS.ROLES.BY_ID(getRecordId(role))); await load(); }
                catch (err) { setError(getErrorMessage(err, 'Could not delete role')); }
              }} /> : null}
            </>
          ) : undefined}
        />
      ))}
      <FormSheet visible={open} title={editing ? 'Edit role' : 'Create role'} onClose={() => setOpen(false)}>
        <Field label="Name *" value={name} onChangeText={setName} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline />
        {PERMISSION_GROUPS.map(group => (
          <React.Fragment key={group.label}>
            <Text style={{ fontFamily: type.bold, color: colors.text }}>{group.label}</Text>
            {group.permissions.map(permission => (
              <Pressable key={permission} onPress={() => toggle(permission)} style={{ paddingVertical: 8 }}>
                <Text style={{ color: selected.includes(permission) ? colors.teal : colors.text, fontFamily: type.medium }}>
                  {selected.includes(permission) ? '☑ ' : '☐ '}{PERMISSION_LABELS[permission] || permission}
                </Text>
              </Pressable>
            ))}
          </React.Fragment>
        ))}
        <Text style={{ color: colors.muted, fontFamily: type.regular }}>{selected.length} of {ALL_PERMISSIONS.length} selected</Text>
        <PrimaryButton label={saving ? 'Saving...' : 'Save role'} onPress={save} disabled={saving} />
      </FormSheet>
    </ScreenBody>
  );
}
