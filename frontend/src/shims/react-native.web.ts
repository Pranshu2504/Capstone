/**
 * The `react-native` module as seen by the web bundle.
 *
 * Everything comes straight from react-native-web; this file exists only to
 * fill the handful of Android-only APIs RNW does not implement, so shared
 * screens can keep importing them unconditionally.
 */
export * from 'react-native-web';

/**
 * Android runtime permissions have no web equivalent — the browser prompts
 * at the point of use (camera, file picker). Reporting "granted" lets the
 * existing permission gates fall through to that native browser prompt.
 */
export const PermissionsAndroid = {
  PERMISSIONS: {
    CAMERA: 'android.permission.CAMERA',
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
    READ_MEDIA_VIDEO: 'android.permission.READ_MEDIA_VIDEO',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  async request(): Promise<'granted'> {
    return 'granted';
  },
  async requestMultiple(
    permissions: string[],
  ): Promise<Record<string, 'granted'>> {
    return Object.fromEntries(permissions.map((p) => [p, 'granted' as const]));
  },
  async check(): Promise<boolean> {
    return true;
  },
};
