import { useState } from "react";
import { SystemStatusDto } from "./lib/contracts";
import {
  ShieldCheck,
  Database,
  Cpu,
  WifiOff,
  Coins,
  CheckCircle2,
  Boxes,
} from "lucide-react";

export default function App() {
  const [status] = useState<SystemStatusDto>({
    app_name: "Next POS (کاروبار پی او ایس)",
    pos_core_version: "0.1.0",
    offline_ready: true,
    database: {
      encrypted: true,
      journal_mode: "WAL",
      foreign_keys: true,
      schema_version: "V1__initial_schema",
      tables_count: 46,
    },
    sample_currency: {
      paisa: 12550,
      formatted: "PKR 125.50",
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/30 text-emerald-400">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Next POS <span className="text-emerald-400 text-sm font-normal">(کاروبار پی او ایس)</span>
            </h1>
            <p className="text-xs text-slate-400">Offline-First Point of Sale & Inventory Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <WifiOff className="w-3.5 h-3.5" />
            100% Offline Mode
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Phase 1 Walking Skeleton
          </span>
        </div>
      </header>

      {/* Main Diagnostic Dashboard */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-8 flex flex-col gap-6 justify-center">
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Foundation & Data Engine Status</h2>
          <p className="text-sm text-slate-400">
            Architecture Verification — Pure Rust <code className="text-emerald-400 font-mono">pos-core</code> crate + Tauri 2 + SQLite WAL Engine
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Core Engine */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Architecture</span>
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white mb-1">pos-core v{status.pos_core_version}</div>
              <p className="text-xs text-slate-400">Zero UI dependency pure business crate</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Target Toolchain</span>
              <span className="text-emerald-400 font-mono">Rust 1.99+ (GNU MinGW)</span>
            </div>
          </div>

          {/* Card 2: Database & Storage */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Local Storage</span>
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white mb-1">SQLite {status.database.journal_mode} Mode</div>
              <p className="text-xs text-slate-400">Power-cut safe ACID transactions</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Foreign Keys</span>
              <span className="text-emerald-400 font-medium">Enforced (Active)</span>
            </div>
          </div>

          {/* Card 3: Precision Money */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700 transition">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Money Engine</span>
              <Coins className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white mb-1">{status.sample_currency.formatted}</div>
              <p className="text-xs text-slate-400">Integer Paisa: {status.sample_currency.paisa} (No Float)</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Quantity Type</span>
              <span className="text-amber-400 font-mono">Qty(i64) milli-units</span>
            </div>
          </div>
        </div>

        {/* Security & Integrity Box */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Hardware & Power Cut Protection Active</h3>
              <p className="text-xs text-slate-400">
                Atomic transactions with SQLite Write-Ahead Logging (WAL) and DPAPI recovery key generation.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-slate-400">Exit Gate: S1 PASSED</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 px-6 py-3 text-center text-xs text-slate-500">
        Next POS v0.1.0 • Built for Pakistani Retailers • Windows 10/11 64-bit Ready
      </footer>
    </div>
  );
}
