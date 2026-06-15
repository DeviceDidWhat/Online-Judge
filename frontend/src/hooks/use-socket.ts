import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

/**
 * Returns the singleton socket and manages its connect/disconnect lifecycle.
 *
 * The socket is connected when this hook mounts and disconnected when the
 * last component using the hook unmounts (reference-counted via useEffect).
 *
 * If you want a permanent connection for the whole app lifetime, mount this
 * hook once at the root level (see __root.tsx).
 */
export function useSocket(): Socket {
  const socket = getSocket();
  const [, forceRender] = useState(0);

  useEffect(() => {
    // Connect if not already connected.
    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => forceRender((n) => n + 1);
    const onDisconnect = () => forceRender((n) => n + 1);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return socket;
}
