import AsyncStorage from '@react-native-async-storage/async-storage';

export const SESSION_KEYS = {
  token: 'oms.authToken',
  refresh: 'oms.refreshToken',
  user: 'oms.user',
};

export async function readStoredSession() {
  const pairs = await AsyncStorage.multiGet([
    SESSION_KEYS.token,
    SESSION_KEYS.refresh,
    SESSION_KEYS.user,
  ]);
  const map = Object.fromEntries(pairs);
  return {
    authToken: map[SESSION_KEYS.token] || null,
    refreshToken: map[SESSION_KEYS.refresh] || null,
    userJson: map[SESSION_KEYS.user] || null,
  };
}

export async function writeStoredUser(user: unknown) {
  if (user) {
    await AsyncStorage.setItem(SESSION_KEYS.user, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(SESSION_KEYS.user);
  }
}

export async function persistTokens(tokens: {
  authToken: string | null;
  refreshToken: string | null;
}) {
  if (tokens.authToken) {
    await AsyncStorage.setItem(SESSION_KEYS.token, tokens.authToken);
  } else {
    await AsyncStorage.removeItem(SESSION_KEYS.token);
  }
  if (tokens.refreshToken) {
    await AsyncStorage.setItem(SESSION_KEYS.refresh, tokens.refreshToken);
  } else {
    await AsyncStorage.removeItem(SESSION_KEYS.refresh);
  }
}
