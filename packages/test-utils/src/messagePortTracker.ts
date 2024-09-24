export type MessagePortTracker = {
  isOpen: () => boolean;
};

/**
 *  Create a message port tracker to track the open state of a message port.
 *
 * @param port - The message port to track.
 * @returns An object with a function to check if the port is open.
 */
export function messagePortTracker(port: MessagePort): MessagePortTracker {
  let isOpen = true;
  const originalClose = port.close.bind(port);
  port.close = () => {
    isOpen = false;
    originalClose();
  };

  return {
    isOpen: () => isOpen,
  };
}
