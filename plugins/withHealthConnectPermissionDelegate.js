const { withMainActivity } = require('@expo/config-plugins');

// react-native-health-connect requires the host Activity to register the
// permission-request ActivityResultLauncher in onCreate:
//   HealthConnectPermissionDelegate.setPermissionDelegate(this)
// Its own Expo plugin only patches the manifest — it does NOT wire this up, so
// without this calling requestPermission() throws
// "lateinit property requestPermission has not been initialized" and crashes
// the app. This plugin injects the import + call (idempotently) so it survives
// prebuild / EAS regeneration.

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withHealthConnectPermissionDelegate only supports a Kotlin MainActivity');
    }
    let src = config.modResults.contents;

    if (!src.includes(IMPORT)) {
      src = src.replace(/^(package .*)$/m, `$1\n\n${IMPORT}`);
    }
    // Insert right after the first super.onCreate(...) so the launcher is
    // registered before the Activity reaches STARTED/RESUMED.
    if (!src.includes(CALL)) {
      src = src.replace(/(super\.onCreate\([^)]*\)[ \t]*\n)/, `$1    ${CALL}\n`);
    }

    config.modResults.contents = src;
    return config;
  });
};
