/**
 * Web stand-in for `react-native-image-picker`.
 * Both entry points open a file dialog; `launchCamera` additionally asks for
 * the environment-facing camera, which mobile browsers honour.
 */

export interface Asset {
  uri?: string;
  fileName?: string;
  fileSize?: number;
  type?: string;
  width?: number;
  height?: number;
  base64?: string;
}

export interface ImagePickerResponse {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: Asset[];
}

interface Options {
  mediaType?: 'photo' | 'video' | 'mixed';
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  selectionLimit?: number;
  cameraType?: 'front' | 'back';
  includeBase64?: boolean;
  saveToPhotos?: boolean;
}


/** Formats FASHN accepts. Anything else must be transcoded before upload. */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Decodes a picked file and re-encodes it as JPEG, honouring the caller's
 * maxWidth/maxHeight/quality the way react-native-image-picker does natively.
 *
 * This is what makes iPhone photos work: the camera roll hands back HEIC, which
 * FASHN rejects with a 415. Anything the browser can decode becomes a JPEG
 * here. Files already in an accepted format and within bounds pass through
 * untouched, so a garment PNG keeps its transparency.
 *
 * If decoding fails (Chrome cannot read HEIC, for instance) the original file
 * is returned unchanged, so the server's explicit "not a JPEG, PNG or WebP"
 * message reaches the user instead of a silent no-op.
 */
async function normalizeImage(file: File, options: Options): Promise<File> {
  const maxWidth = options.maxWidth ?? Infinity;
  const maxHeight = options.maxHeight ?? Infinity;
  const isAccepted = ACCEPTED_TYPES.includes(file.type.toLowerCase());

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const needsResize = scale < 1;

  if (isAccepted && !needsResize) {
    bitmap.close();
    return file;
  }

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }

  // JPEG has no alpha; without this, transparent areas render black and the
  // try-on result comes back masked by a dark block.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', options.quality ?? 0.9);
  });
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
}

function pick(options: Options = {}, useCamera = false): Promise<ImagePickerResponse> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ errorCode: 'others', errorMessage: 'Not available in this environment' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.mediaType === 'video' ? 'video/*' : 'image/*';
    if ((options.selectionLimit ?? 1) !== 1) input.multiple = true;
    if (useCamera) {
      input.capture = options.cameraType === 'front' ? 'user' : 'environment';
    }
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (response: ImagePickerResponse) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(response);
    };

    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) {
        finish({ didCancel: true });
        return;
      }
      void Promise.all(files.map((file) => normalizeImage(file, options)))
        .then((normalized) => {
          finish({
            assets: normalized.map((file) => ({
              uri: URL.createObjectURL(file),
              fileName: file.name,
              fileSize: file.size,
              type: file.type,
            })),
          });
        })
        .catch((cause) => {
          finish({
            errorCode: 'others',
            errorMessage: cause instanceof Error ? cause.message : 'Could not read that image.',
          });
        });
    });

    // `cancel` is not universally supported; window focus is the fallback.
    input.addEventListener('cancel', () => finish({ didCancel: true }));
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!input.files?.length) finish({ didCancel: true });
        }, 500);
      },
      { once: true },
    );

    input.click();
  });
}

export const launchImageLibrary = (options?: Options) => pick(options, false);
export const launchCamera = (options?: Options) => pick(options, true);

export default { launchCamera, launchImageLibrary };
