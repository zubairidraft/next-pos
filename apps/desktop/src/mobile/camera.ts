// Reading barcodes with the phone camera (Android app). In browser test mode
// there is no camera, so the code is typed instead.
import { isTauri } from "../lib/api";

export type AskText = (title: string, label: string) => Promise<string | null>;

/** Returns the barcode text, or null if the person cancelled. */
export async function scanWithCamera(ask: AskText, what: "product" | "pairing" = "product"): Promise<string | null> {
  if (!isTauri) {
    const t = await ask(what === "pairing" ? "Pairing code" : "Scan barcode", what === "pairing" ? "Paste the PC pairing code (browser test mode)" : "Barcode (browser test mode: type it)");
    return t?.trim() || null;
  }
  const bs = await import("@tauri-apps/plugin-barcode-scanner");
  let perm = await bs.checkPermissions();
  if (perm !== "granted") perm = await bs.requestPermissions();
  if (perm !== "granted") {
    throw new Error("Camera permission is off. Allow the camera for Next POS in the phone settings.");
  }
  const F = bs.Format;
  const formats =
    what === "pairing"
      ? [F.QRCode]
      : [F.EAN13, F.EAN8, F.UPC_A, F.UPC_E, F.Code128, F.Code39, F.Code93, F.ITF, F.Codabar, F.QRCode, F.DataMatrix];
  try {
    const r = await bs.scan({ windowed: false, formats, cameraDirection: "back" });
    return r.content?.trim() || null;
  } catch (e) {
    const m = String((e as Error)?.message || e).toLowerCase();
    if (m.includes("cancel")) return null;
    throw e;
  }
}

/** Short buzz after a good scan (if the phone allows it). */
export function buzz(ms = 60) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not available */
  }
}
