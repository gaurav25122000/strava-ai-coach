/* eslint-env jest */
// AsyncStorage ships its own jest mock — required because useStore touches
// storage at module load (persist + data-cache hydration).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Skia has no JSI bindings under jest — use its official CanvasKit-free mock
// so chart components (and anything importing victory-native) can load.
require('@shopify/react-native-skia/jestSetup.js');
