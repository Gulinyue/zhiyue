export function createIpcGateway(ipcMain, assertMainRenderer, assertOverlayRenderer, overlayLayoutChannel, overlayReadChannels = []) {
  const assertSender = (event, allowOverlay = false) => {
    // Child frames share a webContents ID. They must not inherit privileged IPC.
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('unauthorized renderer frame');
    if (allowOverlay && assertOverlayRenderer(event.sender.id)) return;
    assertMainRenderer(event.sender.id);
  };
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        assertSender(event, overlayReadChannels.includes(channel));
        return handler(event, ...args);
      });
    },
    on(channel, handler) {
      ipcMain.on(channel, (event, ...args) => {
        try { assertSender(event, channel === overlayLayoutChannel); }
        catch { return; }
        handler(event, ...args);
      });
    },
  };
}
