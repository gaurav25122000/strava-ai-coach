const { withMainActivity, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// react-native-health-connect needs two things its own Expo plugin does NOT do:
//
// 1. MainActivity.onCreate must call
//    HealthConnectPermissionDelegate.setPermissionDelegate(this) or
//    requestPermission crashes ("lateinit property requestPermission has not
//    been initialized").
//
// 2. On Android 14+ (API 34+), Health Connect refuses to show/grant
//    permissions — the consent screen launches and self-finishes in ~10ms —
//    unless the app declares a privacy-policy intent filter
//    (ACTION_VIEW_PERMISSION_USAGE + category HEALTH_PERMISSIONS) on its
//    permission-handling activity. The library's plugin only adds the old
//    Android-13 ACTION_SHOW_PERMISSIONS_RATIONALE filter.

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

const withDelegate = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('withHealthConnectPermissionDelegate only supports a Kotlin MainActivity');
    }
    let src = config.modResults.contents;
    if (!src.includes(IMPORT)) {
      src = src.replace(/^(package .*)$/m, `$1\n\n${IMPORT}`);
    }
    if (!src.includes(CALL)) {
      src = src.replace(/(super\.onCreate\([^)]*\)[ \t]*\n)/, `$1    ${CALL}\n`);
    }
    config.modResults.contents = src;
    return config;
  });

// Android 14+ requires the privacy-policy declaration as an exported
// activity-alias guarded by START_VIEW_PERMISSION_USAGE (per Google's
// Health Connect docs + matinzd/react-native-health-connect#50). Without it
// the consent screen self-finishes for every request.
const withPermissionUsageIntent = (config) =>
  withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app['activity-alias'] = app['activity-alias'] || [];
    const exists = app['activity-alias'].some(
      (a) => a.$ && a.$['android:name'] === 'ViewPermissionUsageActivity',
    );
    if (!exists) {
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }
    return config;
  });

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withPermissionUsageIntent(withDelegate(config));
};
