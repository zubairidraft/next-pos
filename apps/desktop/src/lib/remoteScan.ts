// Barcodes read by a paired phone go to the screen that is open on the PC,
// the same as a USB scanner would. A screen that uses the scan marks it handled.
import { useEffect, useRef } from "react";

export const REMOTE_SCAN_EVENT = "nextpos:remote-scan";

export interface RemoteScanDetail {
  code: string;
  device_name: string;
  handled: boolean;
}

/** Hand a phone scan to whichever screen is listening. Returns true if one used it. */
export function deliverRemoteScan(code: string, device_name: string): boolean {
  const detail: RemoteScanDetail = { code, device_name, handled: false };
  window.dispatchEvent(new CustomEvent(REMOTE_SCAN_EVENT, { detail }));
  return detail.handled;
}

/** Use phone scans on this screen while it is open. */
export function useRemoteScan(handler: (code: string, deviceName: string) => void, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const f = (e: Event) => {
      const d = (e as CustomEvent<RemoteScanDetail>).detail;
      if (d.handled) return;
      d.handled = true;
      ref.current(d.code, d.device_name);
    };
    window.addEventListener(REMOTE_SCAN_EVENT, f);
    return () => window.removeEventListener(REMOTE_SCAN_EVENT, f);
  }, [active]);
}
