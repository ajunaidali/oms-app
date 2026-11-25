import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../../theme/theme';
import { dateKeyFromDate, parseDateKey } from '../../utils/display';

export function ScreenBody({
  children,
  onRefresh,
  refreshing,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
      requestAnimationFrame(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), Platform.OS === 'android' ? 120 : 40);
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Android edge-to-edge IME inset is applied in MainActivity. Use a small cushion only.
  const bottomPad =
    keyboardHeight > 0
      ? Math.max(insets.bottom, 12) + 28
      : Math.max(insets.bottom, 12) + 16;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, { paddingBottom: bottomPad }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} colors={[colors.primary]} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  );
}

export function PageIntro({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.intro}>
      <Text style={styles.introKicker}>OTS MANAGEMENT</Text>
      <Text style={styles.introTitle}>{title}</Text>
      {subtitle ? <Text style={styles.introSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Banner({
  kind,
  message,
}: {
  kind: 'error' | 'success' | 'offline';
  message: string;
}) {
  if (!message) return null;
  const style =
    kind === 'success' ? styles.success : kind === 'offline' ? styles.offline : styles.error;
  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'teal' | 'ghost' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'teal' && styles.buttonTeal,
        tone === 'ghost' && styles.buttonGhost,
        tone === 'danger' && styles.buttonDanger,
        (disabled || pressed) && styles.buttonPressed,
      ]}>
      <Text style={[styles.buttonText, tone === 'ghost' && styles.buttonGhostText]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  multiline,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secure}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={[styles.input, multiline && styles.inputMulti]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={value ? styles.inputText : styles.placeholder}>{value || 'Select date'}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parseDateKey(value)}
          mode="date"
          onChange={(_event, selected) => {
            setOpen(false);
            if (selected) onChange(dateKeyFromDate(selected));
          }}
        />
      ) : null}
    </View>
  );
}

export function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={selected ? styles.inputText : styles.placeholder}>
          {selected?.label || 'Select'}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView>
              {options.map(option => (
                <Pressable
                  key={option.value || 'empty'}
                  style={styles.option}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}>
                  <Text style={[styles.optionText, option.value === value && styles.optionActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={styles.search}
      autoCapitalize="none"
    />
  );
}

export function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; tone?: string }>;
}) {
  return (
    <View style={styles.statGrid}>
      {items.map(item => (
        <View key={item.label} style={styles.statCard}>
          <Text style={styles.statLabel}>{item.label}</Text>
          <Text style={styles.statValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function TextAction({
  label,
  onPress,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger' | 'muted';
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text
        style={[
          styles.textAction,
          tone === 'danger' && styles.textActionDanger,
          tone === 'muted' && styles.textActionMuted,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CompactCard({
  title,
  badge,
  meta,
  body,
  lines,
  actions,
}: {
  title: string;
  badge?: string;
  meta?: string;
  body?: string;
  lines?: string[];
  actions?: React.ReactNode;
}) {
  return (
    <View style={styles.compact}>
      <View style={styles.compactHead}>
        <Text style={styles.compactTitle} numberOfLines={2}>{title}</Text>
        {badge ? <Text style={styles.compactBadge}>{badge}</Text> : null}
      </View>
      {meta ? <Text style={styles.compactMeta} numberOfLines={2}>{meta}</Text> : null}
      {body ? <Text style={styles.compactBody} numberOfLines={3}>{body}</Text> : null}
      {(lines || []).filter(Boolean).map(line => (
        <Text key={line} style={styles.compactLine} numberOfLines={2}>{line}</Text>
      ))}
      {actions ? <View style={styles.compactActions}>{actions}</View> : null}
    </View>
  );
}

export function RecordCard({
  title,
  subtitle,
  badge,
  rows,
  actions,
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  rows?: Array<{ label: string; value: string }>;
  actions?: React.ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.compact}>
      <View style={styles.compactHead}>
        <View style={styles.cardCopy}>
          <Text style={styles.compactTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.compactMeta} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {badge ? <Text style={styles.compactBadge}>{badge}</Text> : null}
      </View>
      {rows?.slice(0, 4).map(row => (
        <Text key={row.label} style={styles.compactLine} numberOfLines={2}>
          {row.label}: {row.value}
        </Text>
      ))}
      {actions ? <View style={styles.compactActions}>{actions}</View> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

export function LoadingBlock({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{body}</Text>
    </View>
  );
}

export function FormSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return undefined;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const bottomPad =
    keyboardHeight > 0
      ? Math.max(insets.bottom, 12) + 28
      : Math.max(insets.bottom, 12) + 20;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.formScreen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}>
        <View style={[styles.formHeader, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.formTitle}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
            <Text style={styles.formClose}>Close</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.formContent, { paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ChipRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value || 'all'}
            onPress={() => onChange(option.value)}
            style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: spacing.md, paddingBottom: 24, gap: 10 },
  intro: {
    backgroundColor: colors.tealDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  introKicker: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: type.semibold,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  introTitle: {
    color: colors.white,
    fontFamily: type.bold,
    fontSize: 24,
    marginTop: 4,
  },
  introSubtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: type.regular,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  banner: { borderRadius: radius.md, padding: spacing.md },
  error: { backgroundColor: colors.dangerBg },
  success: { backgroundColor: colors.successBg },
  offline: { backgroundColor: colors.warningBg },
  bannerText: { color: colors.text, fontFamily: type.medium, fontSize: 13, lineHeight: 18 },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonTeal: { backgroundColor: colors.teal },
  buttonGhost: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.72 },
  buttonText: { color: colors.white, fontFamily: type.bold, fontSize: 14 },
  buttonGhostText: { color: colors.tealDark },
  field: { gap: 6 },
  label: { color: colors.text, fontFamily: type.semibold, fontSize: 13 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    justifyContent: 'center',
    color: colors.text,
    fontFamily: type.regular,
    fontSize: 14,
  },
  inputMulti: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  inputText: { color: colors.text, fontFamily: type.regular, fontSize: 14 },
  placeholder: { color: colors.muted, fontFamily: type.regular, fontSize: 14 },
  hint: { color: colors.muted, fontFamily: type.regular, fontSize: 12 },
  search: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    color: colors.text,
    fontFamily: type.regular,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { color: colors.muted, fontFamily: type.medium, fontSize: 12 },
  statValue: { color: colors.tealDark, fontFamily: type.bold, fontSize: 22, marginTop: 4 },
  compact: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  compactHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  compactTitle: { flex: 1, color: '#0f172a', fontFamily: type.bold, fontSize: 15, lineHeight: 20 },
  compactBadge: {
    color: colors.primaryDark,
    backgroundColor: '#fff4eb',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontFamily: type.semibold,
    fontSize: 11,
  },
  compactMeta: { color: '#64748b', fontFamily: type.medium, fontSize: 12, lineHeight: 16 },
  compactBody: { color: '#334155', fontFamily: type.regular, fontSize: 13, lineHeight: 18 },
  compactLine: { color: '#475569', fontFamily: type.regular, fontSize: 12, lineHeight: 16 },
  compactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 2 },
  textAction: { color: colors.teal, fontFamily: type.bold, fontSize: 13 },
  textActionDanger: { color: '#dc2626' },
  textActionMuted: { color: '#64748b' },
  cardCopy: { flex: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: colors.text, fontFamily: type.bold, fontSize: 15 },
  cardSubtitle: { color: colors.muted, fontFamily: type.regular, fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: '#fff4eb',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeText: { color: colors.primaryDark, fontFamily: type.semibold, fontSize: 11 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kvLabel: { color: colors.muted, fontFamily: type.medium, fontSize: 12, flex: 1 },
  kvValue: { color: colors.text, fontFamily: type.semibold, fontSize: 13, flex: 1.3, textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 2 },
  state: { alignItems: 'center', padding: 28, gap: 8 },
  stateTitle: { color: colors.text, fontFamily: type.bold, fontSize: 16 },
  stateText: { color: colors.muted, fontFamily: type.regular, fontSize: 13, textAlign: 'center' },
  formScreen: { flex: 1, backgroundColor: colors.bg },
  formHeader: {
    backgroundColor: colors.tealDark,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formTitle: { color: colors.white, fontFamily: type.bold, fontSize: 18, flex: 1 },
  formClose: { color: colors.white, fontFamily: type.semibold, fontSize: 14 },
  formContent: { padding: 16, gap: 12, paddingBottom: 40 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  sheetTitle: { fontFamily: type.bold, fontSize: 16, color: colors.text, marginBottom: 8 },
  option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { fontFamily: type.medium, color: colors.text, fontSize: 15 },
  optionActive: { color: colors.primaryDark },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.text, fontFamily: type.semibold, fontSize: 12 },
  chipTextActive: { color: colors.white },
});
