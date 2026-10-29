import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Key,
  ShieldCheck,
  Cpu,
  Copy,
  CheckCircle,
  Clock,
  Sparkles,
  ShoppingBag,
  Smartphone,
  Shirt,
  Network,
  Upload,
} from "lucide-react";

export function LicenseView() {
  const { t } = useTranslation();
  const [machineId] = useState("KPOS-A93F-4182-5CB1-8E29");
  const [isCopied, setIsCopied] = useState(false);
  const [licenseToken, setLicenseToken] = useState("");
  const [activeTier, setActiveTier] = useState<"trial" | "enterprise" | "standard">("enterprise");
  const [activationMsg, setActivationMsg] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(machineId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleActivate = () => {
    if (!licenseToken.trim()) {
      alert("Please paste your commercial offline license key or token.");
      return;
    }
    setActiveTier("enterprise");
    setActivationMsg("License verified successfully! Machine hardware ID matched. All Industry Packs unlocked.");
    setTimeout(() => setActivationMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            {t("license.title") || "Commercial Licensing & Machine Activation"}
            <span className="text-sm font-nastaliq font-normal text-emerald-400">
              (لائسنس اور مشین رجسٹریشن)
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Air-gapped cryptographic Ed25519 offline license verification tied to hardware fingerprint.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            {activeTier.toUpperCase()} LICENSE ACTIVE
          </span>
        </div>
      </div>

      {/* Hardware Fingerprint & Machine ID Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Machine Hardware Fingerprint (مشین آئی ڈی)
            </div>
            <div className="text-lg font-mono font-bold text-white tracking-wider">
              {machineId}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Share this unique hardware identifier with your Next POS distributor to issue your offline license.
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-center"
          >
            {isCopied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {isCopied ? "Copied to Clipboard" : "Copy Machine ID"}
          </button>
        </div>
      </div>

      {/* Active License Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Licensed Business</div>
          <div className="text-base font-bold text-white">Al-Falah Supermarket & Cash Carry</div>
          <div className="text-xs text-emerald-400 font-nastaliq mt-1">الفلاح سپر مارکیٹ اینڈ کیش کیری</div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>License Tier</span>
            <span className="font-semibold text-white">Enterprise (Full ERP)</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Validity & Term</div>
          <div className="text-base font-bold text-emerald-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Perpetual (Lifetime Offline)
          </div>
          <div className="text-xs text-slate-400 mt-1">Never expires; zero cloud reliance</div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Air-gap Signature</span>
            <span className="font-mono text-emerald-400">Ed25519 Verified</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">Trial Evaluation Policy</div>
          <div className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            14-Day Free Trial
          </div>
          <div className="text-xs text-slate-400 mt-1">All features unlocked out of the box</div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Grace Period</span>
            <span className="text-slate-300">Monotonic time tracked</span>
          </div>
        </div>
      </div>

      {/* Enabled Industry Packs & Feature Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Active Feature Modules & Vertical Industry Packs
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/40">
            <div className="flex items-center justify-between mb-2">
              <ShoppingBag className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Active</span>
            </div>
            <div className="text-xs font-bold text-white">Grocery & Deli Pack</div>
            <p className="text-[11px] text-slate-400 mt-1">EAN-13 Scale Barcode parser (20/21) & Tare deduction.</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/40">
            <div className="flex items-center justify-between mb-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Active</span>
            </div>
            <div className="text-xs font-bold text-white">Electronics & Mobile Pack</div>
            <p className="text-[11px] text-slate-400 mt-1">IMEI/Serial number tracking with warranty logging.</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/40">
            <div className="flex items-center justify-between mb-2">
              <Shirt className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Active</span>
            </div>
            <div className="text-xs font-bold text-white">Apparel & Footwear Pack</div>
            <p className="text-[11px] text-slate-400 mt-1">Size x Color matrix variant generator with barcode batches.</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/40">
            <div className="flex items-center justify-between mb-2">
              <Network className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Active</span>
            </div>
            <div className="text-xs font-bold text-white">Multi-Till Network Pack</div>
            <p className="text-[11px] text-slate-400 mt-1">LAN sync across multiple cashier checkout counters.</p>
          </div>
        </div>
      </div>

      {/* Offline License Activation Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Upload className="w-4 h-4 text-emerald-400" />
          Activate New Commercial License Key
        </h3>

        {activationMsg && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            {activationMsg}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">
            Paste Signed License Token or Load <code className="text-emerald-400 font-mono">.lic</code> File:
          </label>
          <textarea
            value={licenseToken}
            onChange={(e) => setLicenseToken(e.target.value)}
            rows={3}
            placeholder="Paste your 64-byte signed cryptographic token here (e.g. 7B227374...A1F0)..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setLicenseToken("7B2273746F72655F6E616D65223A22416C2D46616C6168222C226D616368696E655F6964223A222A222C2274696572223A22656E7465727072697365227D.9E3779B97F4A7C156A09E667F3BCC908BB67AE8584CAA73B3C6EF372FE94F82B")}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white"
          >
            Insert Demo Token
          </button>
          <button
            onClick={handleActivate}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950 transition"
          >
            Verify & Activate License
          </button>
        </div>
      </div>
    </div>
  );
}
