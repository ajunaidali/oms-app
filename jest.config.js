module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-community|react-native-gesture-handler|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-reanimated)/)',
  ],
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js', './jest.setup.js'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
  },
};