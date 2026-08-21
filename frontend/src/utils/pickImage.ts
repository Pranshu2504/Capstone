import { Platform, PermissionsAndroid } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

/**
 * One picked image, normalised for upload.
 *
 * On web `uri` is a `blob:` URL (the image-picker shim hands one back); on
 * native it is a `file://` or `content://` path. Both are displayable in an
 * <Image>, and tryOnApi knows how to turn either into multipart form data.
 */
export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

export type PickSource = 'camera' | 'gallery';

const ANDROID_PERMISSION_COPY: Record<PickSource, { title: string; message: string }> = {
  camera: {
    title: 'ZORA Camera Permission',
    message: 'ZORA needs access to your camera to photograph you and your wardrobe items.',
  },
  gallery: {
    title: 'ZORA Gallery Permission',
    message: 'ZORA needs access to your photo library to import images.',
  },
};

/** No-op anywhere but Android; the browser prompts for the camera itself. */
async function ensureAndroidPermission(source: PickSource): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permission =
    source === 'camera'
      ? PermissionsAndroid.PERMISSIONS.CAMERA
      : Number(Platform.Version) >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  try {
    const granted = await PermissionsAndroid.request(permission, {
      ...ANDROID_PERMISSION_COPY[source],
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Ask the user for a photo. Resolves null if they cancel or deny permission.
 *
 * Works unchanged on web: Vite aliases `react-native-image-picker` to
 * `@/shims/image-picker.web`, which opens a file dialog.
 *
 * Images are capped at 2000px on the long edge — FASHN downsamples internally
 * anyway, and it keeps the upload small over a phone connection.
 */
export async function pickImage(source: PickSource): Promise<PickedImage | null> {
  if (!(await ensureAndroidPermission(source))) return null;

  const options = {
    mediaType: 'photo' as const,
    maxWidth: 2000,
    maxHeight: 2000,
    quality: 0.9 as const,
    saveToPhotos: false,
  };

  const result =
    source === 'camera'
      ? await launchCamera({ ...options, cameraType: 'back' })
      : await launchImageLibrary(options);

  if (result.didCancel || result.errorCode) return null;

  const asset = result.assets?.[0];
  if (!asset?.uri) return null;

  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    type: asset.type ?? 'image/jpeg',
  };
}

export async function pickImages(source: PickSource): Promise<PickedImage[]> {
  if (!(await ensureAndroidPermission(source))) return [];

  const options = {
    mediaType: 'photo' as const,
    maxWidth: 2000,
    maxHeight: 2000,
    quality: 0.9 as const,
    selectionLimit: 0,
    saveToPhotos: false,
  };

  const result =
    source === 'camera'
      ? await launchCamera({ ...options, cameraType: 'back' })
      : await launchImageLibrary(options);

  if (result.didCancel || result.errorCode) return [];
  if (!result.assets?.length) return [];

  return result.assets
    .filter(a => !!a.uri)
    .map(asset => ({
      uri: asset.uri!,
      name: asset.fileName ?? `photo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.jpg`,
      type: asset.type ?? 'image/jpeg',
    }));
}
