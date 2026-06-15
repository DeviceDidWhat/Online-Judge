import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { ApiSubmission } from '@/lib/api';

type SubmissionResultPayload = Partial<ApiSubmission> & { submissionId: string };

/**
 * Subscribes to the `submission:result` socket event for a given submissionId.
 *
 * When the server pushes a verdict, `onResult` is called with the payload.
 * If the socket reconnects while we are still waiting for a verdict (e.g. a
 * brief network blip), `onReconnect` is called so the consumer can poll HTTP
 * as a recovery path in case the event was missed during the disconnect.
 *
 * @param submissionId - The ID to watch. Pass `null` to disable the listener.
 * @param onResult     - Callback invoked with the judge result payload.
 * @param onReconnect  - Optional callback invoked when the socket reconnects
 *                       while this hook is actively watching a submission.
 */
export function useSubmissionStatus(
  submissionId: string | null,
  onResult: (payload: SubmissionResultPayload) => void,
  onReconnect?: () => void,
): void {
  const socket = getSocket();
  // Keep stable refs so we never need to re-subscribe on every render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!submissionId) return;

    if (!socket.connected) socket.connect();

    const handler = (payload: SubmissionResultPayload) => {
      if (payload.submissionId === submissionId) {
        onResultRef.current(payload);
      }
    };

    // When the socket reconnects while we're waiting, the server may have
    // already emitted the verdict during the brief disconnect window.
    // Notify the consumer so it can do a one-shot HTTP poll to recover.
    const reconnectHandler = () => {
      onReconnectRef.current?.();
    };

    socket.on('submission:result', handler);
    socket.on('connect', reconnectHandler);
    return () => {
      socket.off('submission:result', handler);
      socket.off('connect', reconnectHandler);
    };
  }, [socket, submissionId]);
}
