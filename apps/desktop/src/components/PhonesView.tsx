import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { api, errorText, isBrowserTest, LanDevice, PhonesStatus } from "../lib/api";
import { useToast } from "../lib/toast";

const PAIRING_SECONDS = 10 * 60;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Owner screen: let Android phones on the shop WiFi work with this PC.
 * The PC keeps all the data; phones are paired with a QR code and can be removed.
 */
export function PhonesView() {
  const toast = useToast();
  const [status, setStatus] = useState<PhonesStatus | null>(null);
  const [devices, setDevices] = useState<LanDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([api.phonesStatus(), api.listPhones()]);
      setStatus(st);
      setDevices(list);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async () => {
    if (!status) return;
    if (status.enabled) {
      const ok = await toast.confirm("Turn off phone access?", "All paired phones stop working until you turn it on again. They stay paired.", { confirmLabel: "Turn off" });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.setPhonesEnabled(!status.enabled);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: LanDevice) => {
    const ok = await toast.confirm(`Remove ${d.name}?`, "This phone stops working with the shop at once. To use it again, pair it with a new QR code.", { confirmLabel: "Remove phone" });
    if (!ok) return;
    try {
      await api.removePhone(d.id);
      toast.success(`${d.name} removed`);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const active = devices.filter((d) => !d.revoked);
  const removed = devices.filter((d) => d.revoked);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col gap-5 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Smartphone className="w-5 h-5 text-emerald-500" /> Mobile phones</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Android phones on the shop WiFi can scan barcodes into this PC, and make sales, stock counts and purchases or see today's reports. All data stays on this PC. Internet is not needed.
          </p>
        </div>
        {status && (
          <button
            onClick={toggle}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 ${status.enabled ? "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100" : "bg-emerald-600 text-white"}`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : status.enabled ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
            {status.enabled ? "Turn off phone access" : "Turn on phone access"}
          </button>
        )}
      </div>

      {!status && <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />}

      {status && (
        <div className={`rounded-xl border p-3 text-sm ${status.enabled && status.running ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800" : status.enabled ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800" : "border-slate-200 dark:border-slate-700"}`}>
          {!status.enabled && <span className="text-slate-600 dark:text-slate-300">Phone access is off. Phones cannot connect.</span>}
          {status.enabled && status.running && (
            <div className="space-y-1">
              <div className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Phones can connect</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                This PC on the WiFi: <b className="font-mono">{status.addresses.length ? status.addresses.join(", ") : "no network found"}</b> · port {status.port}
              </div>
              {!isBrowserTest && (
                <div className="text-xs text-slate-500">If Windows asks whether Next POS may use the network, choose <b>Allow</b> for private networks.</div>
              )}
            </div>
          )}
          {status.enabled && !status.running && (
            <div className="text-rose-700 dark:text-rose-300">
              <b>The phone link could not start.</b> {status.error || ""}
            </div>
          )}
        </div>
      )}

      {status?.enabled && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-sm">Paired phones ({active.length})</h3>
          <button onClick={() => setPairing(true)} disabled={!status.running} className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Connect a phone
          </button>
        </div>
      )}

      {status && devices.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
              <tr className="text-left">
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2">WiFi address</th>
                <th className="px-3 py-2">Paired</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...active, ...removed].map((d) => (
                <tr key={d.id} className={`border-t border-slate-100 dark:border-slate-800 ${d.revoked ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-semibold">{d.name}{d.revoked && <span className="ml-2 text-xs font-normal text-rose-600">removed</span>}</td>
                  <td className="px-3 py-2">{ago(d.last_seen_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.last_ip || ""}</td>
                  <td className="px-3 py-2 text-xs">{new Date(d.paired_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    {!d.revoked && (
                      <button onClick={() => remove(d)} className="px-2 py-1 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status?.enabled && devices.length === 0 && <p className="text-sm text-slate-500">No phones yet. Press <b>Connect a phone</b>.</p>}

      {pairing && (
        <PairingDialog
          knownIds={devices.map((d) => d.id)}
          onClose={() => {
            setPairing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function PairingDialog({ knownIds, onClose }: { knownIds: string[]; onClose: () => void }) {
  const toast = useToast();
  const [img, setImg] = useState<string | null>(null);
  const [qrText, setQrText] = useState("");
  const [left, setLeft] = useState(PAIRING_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const known = useRef(new Set(knownIds));

  const newCode = useCallback(async () => {
    setError(null);
    setImg(null);
    try {
      const text = await api.phonePairingQr();
      setQrText(text);
      setImg(await QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2, width: 320 }));
      setLeft(PAIRING_SECONDS);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    newCode();
  }, [newCode]);

  // Countdown, and watch for the phone to arrive.
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const w = setInterval(async () => {
      try {
        const list = await api.listPhones();
        const fresh = list.find((d) => !d.revoked && !known.current.has(d.id));
        if (fresh) {
          known.current.add(fresh.id);
          toast.success(`${fresh.name} is connected`);
          onClose();
        }
      } catch {
        /* keep waiting */
      }
    }, 1500);
    return () => {
      clearInterval(t);
      clearInterval(w);
    };
  }, [onClose, toast]);

  const close = () => {
    api.cancelPhonePairing().catch(() => undefined);
    onClose();
  };

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><QrCode className="w-5 h-5 text-emerald-500" /> Connect a phone</h2>
          <button onClick={close} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid md:grid-cols-[auto_1fr] gap-6 items-center">
          <div className="w-[260px] h-[260px] flex items-center justify-center bg-white rounded-xl border border-slate-200">
            {img && left > 0 ? <img src={img} alt="Pairing QR code" data-qr-text={qrText} className="w-[250px] h-[250px]" /> : error ? null : left === 0 ? null : <Loader2 className="w-6 h-6 animate-spin text-slate-400" />}
            {left === 0 && <span className="text-sm text-slate-500 px-6 text-center">This code has expired.</span>}
          </div>
          <div className="space-y-3 text-sm">
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-700 dark:text-slate-200">
              <li>Install <b>Next POS Mobile</b> on the Android phone.</li>
              <li>Connect the phone to the <b>same WiFi</b> as this PC.</li>
              <li>Open the app, press <b>Scan PC code</b>, and point the camera at this code.</li>
            </ol>
            {error ? (
              <p className="text-rose-600 text-sm">{error}</p>
            ) : (
              <p className="text-xs text-slate-500">
                The code works once, for one phone. {left > 0 ? `It expires in ${mm}:${ss}.` : ""}
              </p>
            )}
            <button onClick={newCode} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> New code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
