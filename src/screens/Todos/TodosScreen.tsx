import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
  StatGrid,
  TextAction,
} from '../../components/common/Ui';
import { getErrorMessage, getRecordId, unwrapList } from '../../utils/apiHelpers';
import { show } from '../../utils/display';
import { colors, type } from '../../theme/theme';

export default function TodosScreen() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [description, setDescription] = useState('');

  const load = async () => setNotes(unwrapList(await apiClient.get(API_ENDPOINTS.TODOS.LIST)));
  useEffect(() => {
    load().catch(err => setError(getErrorMessage(err, 'Could not load notes'))).finally(() => setLoading(false));
  }, []);

  const done = notes.filter(note => note.completed || note.isCompleted || note.done).length;
  const save = async () => {
    if (!description.trim()) return;
    try {
      if (editing) await apiClient.put(API_ENDPOINTS.TODOS.BY_ID(getRecordId(editing)), { description: description.trim() });
      else await apiClient.post(API_ENDPOINTS.TODOS.LIST, { description: description.trim() });
      setOpen(false);
      setSuccess(editing ? 'Note updated' : 'Note added');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save note'));
    }
  };

  return (
    <ScreenBody onRefresh={load}>
      {error ? <Banner kind="error" message={error} /> : null}
      {success ? <Banner kind="success" message={success} /> : null}
      <StatGrid items={[{ label: 'Notes', value: notes.length }, { label: 'Done', value: done }, { label: 'Open', value: notes.length - done }]} />
      <PrimaryButton label="Add note" onPress={() => { setEditing(null); setDescription(''); setOpen(true); }} />
      {loading ? <LoadingBlock /> : null}
      {!loading && notes.length === 0 ? <EmptyBlock title="No notes" body="Personal notes you add here stay on your account." /> : null}
      {notes.map(note => {
        const complete = Boolean(note.completed || note.isCompleted || note.done);
        return (
          <CompactCard
            key={getRecordId(note)}
            title={note.description || note.title || 'Note'}
            badge={complete ? 'Done' : 'Open'}
            meta={show(note.updatedAt || note.createdAt)}
            actions={
              <>
                <TextAction label={complete ? 'Reopen' : 'Complete'} onPress={async () => { await apiClient.patch(API_ENDPOINTS.TODOS.TOGGLE(getRecordId(note))); await load(); }} />
                <TextAction label="Edit" onPress={() => { setEditing(note); setDescription(note.description || ''); setOpen(true); }} />
                <TextAction label="Delete" tone="danger" onPress={() => Alert.alert('Delete note', 'Remove this note?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await apiClient.delete(API_ENDPOINTS.TODOS.BY_ID(getRecordId(note))); await load(); } }])} />
              </>
            }
          />
        );
      })}
      <FormSheet visible={open} title={editing ? 'Edit note' : 'New note'} onClose={() => setOpen(false)}>
        <Field label="Note" value={description} onChangeText={setDescription} multiline />
        <PrimaryButton label="Save note" onPress={save} />
      </FormSheet>
    </ScreenBody>
  );
}

export function PolicyScreen() {
  const content = require('../../constants/policyContent');
  const meta = content.POLICY_META;
  return (
    <ScreenBody>
      <Text style={policy.title}>{meta.title}</Text>
      <Text style={policy.subtitle}>{meta.subtitle}</Text>
      <Text style={policy.meta}>{meta.organization} · {meta.period} · Version {meta.version} · {meta.status}</Text>
      <Text style={policy.meta}>Approved by {meta.approvedBy}</Text>
      <View style={policy.notice}>
        <Text style={policy.noticeTitle}>{content.ENGAGEMENT_NOTICE.title}</Text>
        <Text style={policy.body}>{content.ENGAGEMENT_NOTICE.description}</Text>
        <Text style={policy.roles}>{content.ENGAGEMENT_ROLES.map((role: any) => role.label).join('  ·  ')}</Text>
      </View>
      <Text style={policy.section}>Quick reference</Text>
      {content.QUICK_REFERENCE.map((item: any) => (
        <View key={item.area} style={policy.block}>
          <Text style={policy.heading}>{item.area}</Text>
          <Text style={policy.body}>{item.rule}</Text>
        </View>
      ))}
      {content.POLICY_SECTIONS.map((section: any) => (
        <View key={section.id} style={policy.block}>
          <Text style={policy.heading}>{section.number}. {section.title}</Text>
          {(section.paragraphs || []).map((paragraph: string) => (
            <Text key={paragraph.slice(0, 24)} style={policy.body}>{paragraph}</Text>
          ))}
          {(section.bullets || []).map((bullet: string) => (
            <Text key={bullet.slice(0, 24)} style={policy.bullet}>•  {bullet}</Text>
          ))}
          {(section.numbered || []).map((step: string, index: number) => (
            <Text key={step.slice(0, 24)} style={policy.bullet}>{index + 1}.  {step}</Text>
          ))}
          {section.note ? <Text style={policy.note}>{section.note}</Text> : null}
          {section.table === 'leave' ? content.LEAVE_ENTITLEMENTS.map((item: any) => (
            <View key={item.type} style={policy.tableRow}>
              <Text style={policy.tableTitle}>{item.type}</Text>
              <Text style={policy.body}>{item.limit}. {item.purpose}</Text>
              <Text style={policy.note}>{item.carryForward}</Text>
            </View>
          )) : null}
          {section.table === 'engagement' ? content.ENGAGEMENT_CATEGORIES.map((item: any) => (
            <View key={item.category} style={policy.tableRow}>
              <Text style={policy.tableTitle}>{item.category}</Text>
              <Text style={policy.body}>{item.purpose}</Text>
              <Text style={policy.note}>{item.schedule}. {item.approval}</Text>
            </View>
          )) : null}
          {(section.acknowledgementFields || []).map((field: string) => (
            <Text key={field} style={policy.field}>{field}</Text>
          ))}
        </View>
      ))}
      <Pressable onPress={() => Linking.openURL(content.POLICY_PDF.href)} style={policy.pdf}>
        <Text style={policy.pdfText}>{content.POLICY_PDF.label}</Text>
      </Pressable>
    </ScreenBody>
  );
}

const policy = StyleSheet.create({
  title: { color: '#0f172a', fontFamily: type.bold, fontSize: 22, lineHeight: 28 },
  subtitle: { color: colors.teal, fontFamily: type.semibold, fontSize: 14, marginTop: -8 },
  meta: { color: '#64748b', fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  notice: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 12, gap: 4 },
  noticeTitle: { color: '#0f172a', fontFamily: type.bold, fontSize: 15, lineHeight: 21 },
  section: { color: '#0f172a', fontFamily: type.bold, fontSize: 18, marginTop: 8 },
  block: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  heading: { color: '#0f172a', fontFamily: type.bold, fontSize: 16, lineHeight: 22 },
  body: { color: '#334155', fontFamily: type.regular, fontSize: 14, lineHeight: 22 },
  bullet: { color: '#334155', fontFamily: type.regular, fontSize: 14, lineHeight: 22, paddingLeft: 2 },
  note: { color: '#64748b', fontFamily: type.regular, fontSize: 13, lineHeight: 20 },
  roles: { color: colors.tealDark, fontFamily: type.medium, fontSize: 12, lineHeight: 18, marginTop: 4 },
  tableRow: { gap: 2, paddingVertical: 4 },
  tableTitle: { color: colors.tealDark, fontFamily: type.semibold, fontSize: 14 },
  field: { color: '#334155', fontFamily: type.medium, fontSize: 14, lineHeight: 22 },
  pdf: { alignSelf: 'flex-start', paddingVertical: 8 },
  pdfText: { color: colors.primary, fontFamily: type.bold, fontSize: 14 },
});
