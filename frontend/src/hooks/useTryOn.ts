import { useCallback, useRef, useState } from 'react';

import {
  submitTryOn,
  waitForTryOn,
  TryOnApiError,
  type TryOnJob,
  type TryOnOptions,
} from '@/services/tryOnApi';

import type { PickedImage } from '@/utils/pickImage';

export type TryOnPhase = 'idle' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';

interface TryOnState {
  phase: TryOnPhase;
  job: TryOnJob | null;
  error: string | null;
  /** Human-readable line for the UI, e.g. "in queue…". */
  progressLabel: string;
}

const INITIAL: TryOnState = { phase: 'idle', job: null, error: null, progressLabel: '' };

/** Map the backend's raw FASHN status onto copy the UI can show. */
function labelFor(job: TryOnJob): string {
  switch (job.fashnStatus) {
    case 'in_queue':
      return 'waiting in queue…';
    case 'processing':
      return 'wrapping the garment…';
    case 'starting':
      return 'starting up…';
    default:
      return 'working…';
  }
}

/**
 * Drives one try-on: upload both images, poll until the image is ready, and
 * expose a phase the UI can render directly.
 */
export function useTryOn() {
  const [state, setState] = useState<TryOnState>(INITIAL);
  /** Guards against a stale run overwriting a newer one. */
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState(INITIAL);
  }, []);

  const run = useCallback(
    async (person: PickedImage, garment: PickedImage, options?: TryOnOptions) => {
      const runId = ++runIdRef.current;
      const isStale = () => runId !== runIdRef.current;

      setState({ phase: 'uploading', job: null, error: null, progressLabel: 'uploading photos…' });

      try {
        const queued = await submitTryOn(person, garment, options);
        if (isStale()) return;

        setState({ phase: 'queued', job: queued, error: null, progressLabel: 'queued…' });

        const finished = await waitForTryOn(queued.jobId, (job) => {
          if (isStale()) return;
          setState({ phase: 'processing', job, error: null, progressLabel: labelFor(job) });
        });
        if (isStale()) return;

        if (finished.status === 'completed' && finished.images.length > 0) {
          setState({ phase: 'done', job: finished, error: null, progressLabel: '' });
          return;
        }

        setState({
          phase: 'error',
          job: finished,
          error:
            finished.error?.message ??
            (finished.status === 'timeout'
              ? 'The try-on timed out. Try again.'
              : 'The try-on finished without producing an image.'),
          progressLabel: '',
        });
      } catch (error) {
        if (isStale()) return;

        setState({
          phase: 'error',
          job: null,
          error:
            error instanceof TryOnApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Something went wrong.',
          progressLabel: '',
        });
      }
    },
    [],
  );

  return { ...state, run, reset, isBusy: ['uploading', 'queued', 'processing'].includes(state.phase) };
}
