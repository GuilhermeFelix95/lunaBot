import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { isTrustedRendererUrl } from "./trusted-renderer";

export function handleTrusted<Result>(channel: string, handler: (...arguments_: unknown[]) => Result): void {
  ipcMain.handle(channel, (event, ...arguments_: unknown[]) => {
    if (!isTrustedRendererUrl(event.senderFrame?.url)) {
      throw new Error("Blocked an IPC call from a window that isn't trusted.");
    }
    return handler(...arguments_);
  });
}

export function handleTrustedWithEvent<Result>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...arguments_: unknown[]) => Result,
): void {
  ipcMain.handle(channel, (event, ...arguments_: unknown[]) => {
    if (!isTrustedRendererUrl(event.senderFrame?.url)) {
      throw new Error("Blocked an IPC call from a window that isn't trusted.");
    }
    return handler(event, ...arguments_);
  });
}
