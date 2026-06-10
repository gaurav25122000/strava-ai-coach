/* eslint-env jest */
// AsyncStorage ships its own jest mock — required because useStore touches
// storage at module load (persist + data-cache hydration).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
