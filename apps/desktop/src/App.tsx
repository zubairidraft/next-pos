import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageProvider, useAppLanguage } from "./context/LanguageContext";
import { PinLoginModal } from "./components/PinLoginModal";
import { FirstRunWizard } from "./components/FirstRunWizard";
import { MasterDataView } from "./components/MasterDataView";
import { SystemStatusDto } from "./lib/contracts";
import {
  ShieldCheck,
  Database,
  Cpu,
  WifiOff,
  Coins,
  CheckCircle2,
  Boxes,
  Languages,
  KeyRound,
  LayoutDashboard,
  FolderTree,
  Wand2,
} from "lucide-react";

function AppContent() {
  const { t } = useTranslation();
  const { language, toggleLanguage } = useAppLanguage();

  const [activeTab, setActiveTab] = useState<"dashboard" | "master" | "wizard">("dashboard");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    name: "Tariq Mahmood",
    role: "Cashier",
  });

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
      {/* Top Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-950">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Next POS{" "}
              <span className="text-emerald-400 text-sm font-nastaliq font-normal">
                (کاروبار پی او ایس)
              </span>
            </h1>
            <p className="text-xs text-slate-400">{t("app.subtitle") || "Offline-First Retail POS & ERP"}</p>
          </div>
        </div>

        {/* Center Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "dashboard"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            {t("nav.dashboard")}
          </button>
          <button
            onClick={() => setActiveTab("master")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "master"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            {t("nav.master_data")}
          </button>
          <button
            onClick={() => setActiveTab("wizard")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "wizard"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            {t("nav.setup_wizard")}
          </button>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          {/* Offline status indicator */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <WifiOff className="w-3.5 h-3.5" />
            {t("status.offline_ready")}
          </span>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Switch Language / زبان تبدیل کریں"
          >
            <Languages className="w-3.5 h-3.5 text-emerald-400" />
            <span>{language === "en" ? "اردو (Urdu)" : "English"}</span>
          </button>

          {/* Cashier Badge & PIN Switch */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="text-right hidden lg:block">
              <div className="text-xs font-semibold text-white leading-none">{currentUser.name}</div>
              <div className="text-[10px] text-emerald-400 font-medium capitalize mt-0.5">{currentUser.role}</div>
            </div>
            <button
              onClick={() => setIsPinModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Quick Switch / Lock"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t("nav.switch_user")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6">
        {activeTab === "wizard" && (
          <FirstRunWizard onComplete={() => setActiveTab("dashboard")} />
        )}

        {activeTab === "master" && <MasterDataView />}

        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-6">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold text-slate-100 mb-1">
                {t("app.title")}
              </h2>
              <p className="text-xs text-slate-400">
                Pure Rust <code className="text-emerald-400 font-mono">pos-core</code> engine • Dual Script Urdu & English • Offline SQLite WAL
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Core Engine */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700 transition shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Architecture</span>
                  <Cpu className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="text-xl font-bold text-white mb-1">pos-core v{status.pos_core_version}</div>
                  <p className="text-xs text-slate-400">Decoupled pure Rust business logic & RBAC matrix</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Active Operator</span>
                  <span className="text-emerald-400 font-mono font-medium">{currentUser.name}</span>
                </div>
              </div>

              {/* Card 2: Database & Storage */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700 transition shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Local Storage</span>
                  <Database className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xl font-bold text-white mb-1">SQLite {status.database.journal_mode} Mode</div>
                  <p className="text-xs text-slate-400">Power-cut safe ACID transactions & 46 tables</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Foreign Keys</span>
                  <span className="text-emerald-400 font-medium">Enforced & Active</span>
                </div>
              </div>

              {/* Card 3: Precision Money */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-700 transition shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Money Engine</span>
                  <Coins className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-xl font-bold text-white mb-1">{status.sample_currency.formatted}</div>
                  <p className="text-xs text-slate-400">Integer Paisa: {status.sample_currency.paisa} (Zero Float)</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Stock Policy</span>
                  <span className="text-rose-400 font-semibold uppercase">Block Negative</span>
                </div>
              </div>
            </div>

            {/* Security & Integrity Box */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Security & Urdu Localization Active</h3>
                  <p className="text-xs text-slate-400">
                    Argon2id PIN authentication, Dual-script category & brand search, Nastaliq typography.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sprint 2 Gates Met
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 px-6 py-3 text-center text-xs text-slate-500">
        Next POS v0.1.0 • {t("footer.offline_notice")} • Built for Pakistani Retailers
      </footer>

      {/* Fast PIN Switch Modal */}
      <PinLoginModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={(cashierName, role) => {
          setCurrentUser({ name: cashierName, role });
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
