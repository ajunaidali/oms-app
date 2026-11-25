import React, { useEffect, useState } from 'react';
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
  TextAction,
} from '../../components/common/Ui';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, getRecordId, parseUnreadCount, unwrapList } from '../../utils/apiHelpers';
import { hasPermission } from '../../utils/permissionHelpers';
import { show } from '../../utils/display';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const canSend = hasPermission(user, 'notification:create');
  const [rows, setRows] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const [list, count] = await Promise.all([
      apiClient.get(API_ENDPOINTS.NOTIFICATIONS.LIST),
      apiClient.get(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT).catch(() => null),
    ]);
    setRows(unwrapList(list));
    setUnread(parseUnreadCount(count) || 0);
  };

  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load notifications'))).finally(() => setLoading(false));
  }, []);

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <PrimaryButton label={`Mark all read (${unread})`} tone="teal" onPress={async () => {
        await apiClient.put(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ, {});
        await load();
      }} />
      {canSend ? <PrimaryButton label="Send notification" onPress={() => setOpen(true)} /> : null}
      {loading ? <LoadingBlock /> : null}
      {!loading && rows.length === 0 ? <EmptyBlock title="No notifications" body="Your inbox is empty." /> : null}
      {rows.map(item => (
        <CompactCard
          key={getRecordId(item)}
          title={item.title || 'Notification'}
          badge={item.read || item.isRead ? 'Read' : 'Unread'}
          meta={show(item.createdAt)}
          body={show(item.message || item.body)}
          actions={
            <>
              <TextAction label="Mark read" onPress={async () => { await apiClient.put(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(getRecordId(item)), {}); await load(); }} />
              <TextAction label="Delete" tone="danger" onPress={async () => { await apiClient.delete(API_ENDPOINTS.NOTIFICATIONS.DELETE(getRecordId(item))); await load(); }} />
            </>
          }
        />
      ))}
      <FormSheet visible={open} title="Send notification" onClose={() => setOpen(false)}>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Message" value={message} onChangeText={setMessage} multiline />
        <PrimaryButton label="Send" onPress={async () => {
          try {
            await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.SEND, { title: title.trim(), message: message.trim() });
            setSuccess('Notification sent');
            setOpen(false);
            await load();
          } catch (err) {
            setError(getErrorMessage(err, 'Could not send notification'));
          }
        }} />
      </FormSheet>
    </ScreenBody>
  );
}
