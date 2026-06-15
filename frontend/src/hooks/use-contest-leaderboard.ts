import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { ApiContestRegistration } from '@/lib/api';

interface LeaderboardPayload {
  contestId: string;
  leaderboard: ApiContestRegistration[];
}

/**
 * Joins the contest's socket room and subscribes to `contest:leaderboard` push events.
 *
 * When the server broadcasts a leaderboard update, `onUpdate` is called with
 * the fresh leaderboard array.  The socket joins the contest room on mount,
 * re-joins on every reconnect (server clears rooms on disconnect), and
 * leaves on unmount or when contestId changes.
 *
 * @param contestId - The contest to watch. Pass `null` to disable.
 * @param onUpdate  - Callback invoked with the updated leaderboard array.
 */
export function useContestLeaderboard(
  contestId: string | null,
  onUpdate: (leaderboard: ApiContestRegistration[]) => void,
): void {
  const socket = getSocket();
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!contestId) return;

    if (!socket.connected) socket.connect();

    // Encapsulate join so we can call it both immediately and on reconnect.
    const joinRoom = () => socket.emit('contest:join', { contestId });
    joinRoom();

    // Re-join every time the socket reconnects: the server drops all room
    // memberships on disconnect, so we must re-send contest:join on each
    // new connection to keep receiving contest:leaderboard events.
    socket.on('connect', joinRoom);

    const handler = (payload: LeaderboardPayload) => {
      if (payload.contestId === contestId) {
        onUpdateRef.current(payload.leaderboard);
      }
    };

    socket.on('contest:leaderboard', handler);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('contest:leaderboard', handler);
      socket.emit('contest:leave', { contestId });
    };
  }, [socket, contestId]);
}
