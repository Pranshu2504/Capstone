import { API_BASE_URL } from '@/config/api';
import { getAuthToken } from '@/api/client';
import type { ApiWardrobeItem } from '@/api/types';
import type { PickedImage } from '@/utils/pickImage';

/**
 * Multipart upload of garment photos.
 *
 * Kept out of `api/client.ts` because that wrapper always sets a JSON
 * Content-Type; multipart needs the runtime to set the boundary itself.
 */

/**
 * Append an image in whichever shape the platform needs.
 *
 * The web image-picker shim hands back a `blob:` URL, which multipart cannot
 * upload directly — fetch it back into a Blob first. React Native instead
 * understands its own {uri, name, type} descriptor.
 */
async function appendImage(form: FormData, image: PickedImage): Promise<void> {
  if (image.uri.startsWith('blob:') || image.uri.startsWith('data:')) {
    const blob = await (await fetch(image.uri)).blob();
    (form.append as (n: string, v: unknown, f?: string) => void)('photos', blob, image.name);
    return;
  }
  form.append('photos', { uri: image.uri, name: image.name, type: image.type } as never);
}

/**
 * Uploads photos and returns the wardrobe items the server made from them.
 *
 * Each photo goes through a vision pass server-side, so this is slow relative
 * to a normal request — show a spinner and expect a few seconds per photo.
 */
export async function uploadGarmentPhotos(images: PickedImage[]): Promise<ApiWardrobeItem[]> {
  const form = new FormData();
  for (const image of images) await appendImage(form, image);

  const token = getAuthToken();

  // Content-Type is deliberately unset so the runtime adds the multipart boundary.
  const response = await fetch(`${API_BASE_URL}/api/wardrobe/upload`, {
    method: 'POST',
    body: form,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      (payload as { error?: string } | null)?.error ?? `Upload failed (${response.status})`,
    );
  }

  return response.json();
}
