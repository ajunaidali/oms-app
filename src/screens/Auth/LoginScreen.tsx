import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import apiClient from '../../api/apiClient';
import { API_ENDPOINTS } from '../../api/apiConfig';
import { useAuth } from '../../context/AuthContext';
import { type } from '../../theme/theme';
import {
  buildForgotPasswordPayload,
  buildLoginCredentialsPayload,
  getErrorMessage,
  mergeAuthUserFromApi,
  normalizeAuthUser,
  unwrapData,
} from '../../utils/apiHelpers';
import { readKeyboardHeight, scrollInputAboveKeyboard } from '../../utils/keyboardScroll';

type ViewName = 'login' | 'forgot' | 'reset' | 'verify';

const LOGIN_ACTIONS_EXTRA = 232;
const FIELD_EXTRA = 56;
const RESET_SUBMIT_EXTRA = 120;

function GradientFill({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ed8838" />
          <Stop offset="1" stopColor="#1e736b" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  trailing,
  disabled,
  inputRef,
  onFocus,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secure?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  onFocus?: () => void;
  returnKeyType?: 'done' | 'next' | 'go';
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          secureTextEntry={secure}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          importantForAutofill="yes"
          onFocus={onFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === 'done' || returnKeyType === 'go'}
          style={[styles.input, trailing ? styles.inputPad : null, disabled && styles.inputDisabled]}
        />
        {trailing}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const employeeIdRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const focusedScrollExtraRef = useRef(FIELD_EXTRA);
  const [view, setView] = useState<ViewName>('login');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const clear = () => {
    setError('');
    setSuccess('');
  };

  useEffect(() => {
    if (view === 'login') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clear();
      setView('login');
      return true;
    });
    return () => subscription.remove();
  }, [view]);

  const scrollFocusedField = useCallback((target?: TextInput | null, extraOffset?: number) => {
    const field = target ?? focusedInputRef.current;
    const extra = extraOffset ?? focusedScrollExtraRef.current;
    const metricsHeight = readKeyboardHeight();
    if (metricsHeight) setKeyboardHeight(metricsHeight);
    scrollInputAboveKeyboard(scrollRef, field, {
      extraOffset: extra,
      animated: true,
      retries: Platform.OS === 'android' ? 4 : 2,
    });
  }, []);

  const registerFieldFocus = useCallback(
    (input: TextInput | null, extraOffset: number) => {
      focusedInputRef.current = input;
      focusedScrollExtraRef.current = extraOffset;
      scrollFocusedField(input, extraOffset);
    },
    [scrollFocusedField],
  );

  useEffect(() => {
    const syncKeyboard = (height?: number) => {
      const next = typeof height === 'number' && height > 0 ? height : readKeyboardHeight();
      if (next > 0) setKeyboardHeight(next);
    };

    if (Keyboard.isVisible?.()) {
      syncKeyboard();
      scrollFocusedField();
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, event => {
      const height = event.endCoordinates?.height || 0;
      syncKeyboard(height);
      scrollFocusedField();
      if (Platform.OS === 'android' && height > 0) {
        setTimeout(() => scrollFocusedField(), 220);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollFocusedField]);

  useEffect(() => {
    if (keyboardHeight <= 0 || view !== 'login') return;
    scrollFocusedField(passwordRef.current, LOGIN_ACTIONS_EXTRA);
  }, [keyboardHeight, view, scrollFocusedField]);

  const login = async () => {
    if (!employeeId.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    clear();
    try {
      const response = await apiClient.post(
        API_ENDPOINTS.AUTH.LOGIN,
        buildLoginCredentialsPayload(employeeId, password),
      );
      const token = response?.data?.token;
      if (!token) {
        setError('Login failed. No authentication token received from server.');
        return;
      }
      apiClient.setAuthToken(token);
      if (response.data?.refreshToken) apiClient.setRefreshToken(response.data.refreshToken);
      try {
        const meResponse = await apiClient.get(API_ENDPOINTS.AUTH.ME);
        const apiRaw = unwrapData(meResponse) || meResponse.data || meResponse;
        const freshUser = mergeAuthUserFromApi(response.data?.user, apiRaw);
        if (freshUser) await setUser(freshUser);
      } catch {
        if (response.data?.user) await setUser(normalizeAuthUser(response.data.user));
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const forgot = async () => {
    if (!employeeId.trim()) {
      setError('Please enter your Employee ID or Email');
      return;
    }
    setLoading(true);
    clear();
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, buildForgotPasswordPayload(employeeId));
      setSuccess('If an account exists for this Employee ID or Email, password reset instructions have been sent.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not process forgot password request.'));
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!resetToken.trim() || !newPassword.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setLoading(true);
    clear();
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
        token: resetToken.trim(),
        newPassword,
      });
      setSuccess('Password reset successful. You can now log in with your new password.');
      setTimeout(() => setView('login'), 1500);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reset password. The link may be invalid or expired.'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!verifyToken.trim()) {
      setError('Please enter your verification token');
      return;
    }
    setLoading(true);
    clear();
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.VERIFY_EMAIL, { token: verifyToken.trim() });
      setSuccess('Email verified successfully. You can now log in.');
      setTimeout(() => setView('login'), 1500);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not verify email. The link may be invalid or expired.'));
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<ViewName, string> = {
    login: 'Management System',
    forgot: 'Forgot your password?',
    reset: 'Reset your password',
    verify: 'Verify your email',
  };
  const subtitles: Record<ViewName, string> = {
    login: 'Sign in to continue',
    forgot: 'Enter your Employee ID or Email to receive reset instructions',
    reset: 'Enter your reset token and choose a new password',
    verify: 'Paste the verification token from your email',
  };

  const keyboardOpen =
    keyboardHeight > 0 || (viewportHeight > 0 && viewportHeight < windowHeight - 120);
  const nativeImeResize =
    keyboardOpen && viewportHeight > 0 && viewportHeight < windowHeight - 80;
  // MainActivity applies IME inset on Android; add scroll padding only when the viewport did not shrink.
  const bottomPad = keyboardOpen
    ? nativeImeResize
      ? Math.max(insets.bottom, 8) + 20
      : Math.max(keyboardHeight, insets.bottom) + 24
    : Math.max(insets.bottom, 12) + 20;

  return (
    <View
      style={styles.page}
      onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}>
      <GradientFill id="page" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: keyboardOpen ? Math.max(insets.top, 12) + 8 : 20,
              paddingBottom: bottomPad,
              justifyContent: keyboardOpen ? 'flex-start' : 'center',
              minHeight: keyboardOpen ? undefined : Math.max(viewportHeight, 0) || undefined,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          {/* Android IME inset is handled in MainActivity; scroll keeps fields above the keyboard. */}
          <View style={[styles.card, keyboardOpen && styles.cardKeyboard]}>
            <Text style={[styles.brand, keyboardOpen && styles.brandKeyboard]}>OTS</Text>
            <Text style={styles.title}>{titles[view]}</Text>
            <Text style={styles.subtitle}>{subtitles[view]}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.success}>{success}</Text> : null}

            {view === 'login' ? (
              <View style={styles.form}>
                <LabeledInput
                  label="Employee ID or Email"
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  placeholder="Enter your Employee ID or Email"
                  disabled={loading}
                  inputRef={employeeIdRef}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={() => registerFieldFocus(employeeIdRef.current, FIELD_EXTRA)}
                />
                <LabeledInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  secure={!showPassword}
                  disabled={loading}
                  inputRef={passwordRef}
                  returnKeyType="go"
                  onSubmitEditing={login}
                  onFocus={() => registerFieldFocus(passwordRef.current, LOGIN_ACTIONS_EXTRA)}
                  trailing={
                    <Pressable
                      style={styles.eye}
                      onPress={() => setShowPassword(value => !value)}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                      <Text>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                    </Pressable>
                  }
                />
                <Pressable style={[styles.button, loading && styles.disabled]} onPress={login} disabled={loading}>
                  <GradientFill id="login" />
                  <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'forgot' ? (
              <View style={styles.form}>
                <LabeledInput
                  label="Employee ID or Email"
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  placeholder="Enter your Employee ID or Email"
                  disabled={loading}
                  returnKeyType="go"
                  onSubmitEditing={forgot}
                  onFocus={() => registerFieldFocus(null, FIELD_EXTRA)}
                />
                <Pressable style={[styles.button, loading && styles.disabled]} onPress={forgot} disabled={loading}>
                  <GradientFill id="forgot" />
                  <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Reset Instructions'}</Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'verify' ? (
              <View style={styles.form}>
                <LabeledInput
                  label="Verification Token"
                  value={verifyToken}
                  onChangeText={setVerifyToken}
                  placeholder="Paste your email verification token"
                  disabled={loading}
                  returnKeyType="go"
                  onSubmitEditing={verify}
                  onFocus={() => registerFieldFocus(null, FIELD_EXTRA)}
                />
                <Pressable style={[styles.button, loading && styles.disabled]} onPress={verify} disabled={loading}>
                  <GradientFill id="verify" />
                  <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify Email'}</Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'reset' ? (
              <View style={styles.form}>
                <LabeledInput
                  label="Reset Token"
                  value={resetToken}
                  onChangeText={setResetToken}
                  placeholder="Paste your reset token"
                  disabled={loading}
                  returnKeyType="next"
                  onSubmitEditing={() => newPasswordRef.current?.focus()}
                  onFocus={() => registerFieldFocus(null, FIELD_EXTRA)}
                />
                <LabeledInput
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  secure={!showNewPassword}
                  disabled={loading}
                  inputRef={newPasswordRef}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  onFocus={() => registerFieldFocus(newPasswordRef.current, RESET_SUBMIT_EXTRA)}
                  trailing={
                    <Pressable
                      style={styles.eye}
                      onPress={() => setShowNewPassword(value => !value)}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}>
                      <Text>{showNewPassword ? '👁️' : '👁️‍🗨️'}</Text>
                    </Pressable>
                  }
                />
                <LabeledInput
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  secure={!showNewPassword}
                  disabled={loading}
                  inputRef={confirmPasswordRef}
                  returnKeyType="go"
                  onSubmitEditing={reset}
                  onFocus={() => registerFieldFocus(confirmPasswordRef.current, RESET_SUBMIT_EXTRA)}
                />
                <Pressable style={[styles.button, loading && styles.disabled]} onPress={reset} disabled={loading}>
                  <GradientFill id="reset" />
                  <Text style={styles.buttonText}>{loading ? 'Resetting...' : 'Reset Password'}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.footer}>
              {view === 'login' ? (
                <Pressable onPress={() => { clear(); setView('forgot'); }}>
                  <Text style={styles.link}>Forgot Password?</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => { clear(); setView('login'); }}>
                  <Text style={styles.link}>Back to Login</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#1e736b' },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  cardKeyboard: {
    paddingTop: 20,
    paddingBottom: 22,
    paddingHorizontal: 24,
  },
  brand: { textAlign: 'center', color: '#ed8838', fontFamily: type.bold, fontSize: 32, marginBottom: 8 },
  brandKeyboard: { fontSize: 28, marginBottom: 4 },
  title: { textAlign: 'center', color: '#999', fontFamily: type.regular, fontSize: 14 },
  subtitle: { textAlign: 'center', color: '#777', fontFamily: type.regular, fontSize: 13, marginTop: 6, marginBottom: 16 },
  error: { backgroundColor: '#fee', color: '#c33', padding: 12, borderRadius: 6, borderLeftWidth: 4, borderLeftColor: '#c33', fontFamily: type.regular, fontSize: 13, marginBottom: 16, overflow: 'hidden' },
  success: { backgroundColor: '#eefaf3', color: '#1f7a4d', padding: 12, borderRadius: 6, borderLeftWidth: 4, borderLeftColor: '#1f7a4d', fontFamily: type.regular, fontSize: 13, marginBottom: 16, overflow: 'hidden' },
  form: { gap: 20 },
  group: { gap: 8 },
  label: { color: '#333', fontFamily: type.semibold, fontSize: 14 },
  inputWrap: { justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: type.regular,
    color: '#333',
    backgroundColor: '#fff',
  },
  inputPad: { paddingRight: 48 },
  inputDisabled: { backgroundColor: '#f5f5f5', color: '#999' },
  eye: { position: 'absolute', right: 8, padding: 6 },
  button: { borderRadius: 6, overflow: 'hidden', minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontFamily: type.semibold, fontSize: 14, paddingVertical: 12 },
  disabled: { opacity: 0.7 },
  footer: { alignItems: 'center', marginTop: 20 },
  link: { color: '#ed8838', fontFamily: type.regular, fontSize: 13 },
});
