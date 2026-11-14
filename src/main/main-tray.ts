import { Menu, nativeImage, Tray } from "electron";
import { nativeMessage } from "./native-messages";

const TRAY_ICON_SIZE = 16;

/**
 * Returns null when no tray can be shown. The caller then treats the tray as unavailable, so closing the
 * window quits the app instead of hiding it where the user could not find it again.
 */
export function createMainTray(options: { iconPath: string; onOpen: () => void; onQuit: () => void }): Tray | null {
  try {
    const icon = nativeImage.createFromPath(options.iconPath);
    if (icon.isEmpty()) return null;
    const tray = new Tray(icon.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }));
    tray.setToolTip(nativeMessage("window.title"));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: nativeMessage("tray.open"), click: options.onOpen },
        { type: "separator" },
        { label: nativeMessage("tray.quit"), click: options.onQuit },
      ]),
    );
    tray.on("click", options.onOpen);
    return tray;
  } catch (error) {
    console.error("Unable to create the system tray:", error);
    return null;
  }
}
