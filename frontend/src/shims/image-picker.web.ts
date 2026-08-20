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
  selectionLimit?: number;
  cameraType?: 'front' | 'back';
  includeBase64?: boolean;
  saveToPhotos?: boolean;
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
      finish({
        assets: files.map((file) => ({
          uri: URL.createObjectURL(file),
          fileName: file.name,
          fileSize: file.size,
          type: file.type,
        })),
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
