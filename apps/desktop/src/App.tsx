import { useState, useEffect } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { PinLoginModal } from "./components/PinLoginModal";
import { FirstRunWizard } from "./components/FirstRunWizard";
import { MasterDataView } from "./components/MasterDataView";
import { CatalogView } from "./components/CatalogView";
import { BulkImportModal } from "./components/BulkImportModal";
import { PurchasingView } from "./components/PurchasingView";
import { StockAuditView } from "./components/StockAuditView";
import { CheckoutView } from "./components/CheckoutView";
import { KhataView } from "./components/KhataView";
import { ReportsView } from "./components/ReportsView";
import { BackupView } from "./components/BackupView";
import { LicenseView } from "./components/LicenseView";
import { IndustryPacksView } from "./components/IndustryPacksView";
import { SystemDiagnosticsModal } from "./components/SystemDiagnosticsModal";
import { SystemStatusDto } from "./lib/contracts";
import { api } from "./lib/api";
import {
  ShieldCheck,
  Database,
  Cpu,
  WifiOff,
  Coins,
  CheckCircle2,
  Boxes,
  KeyRound,
  FolderTree,
  Wand2,
  Package,
  Truck,
  ClipboardCheck,
  ShoppingCart,
  BookOpen,
  BarChart3,
  HardDriveDownload,
  Key,
  Activity,
  MoreHorizontal,
  Sun,
  Moon,
} from "lucide-react";

function AppContent() {
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"checkout" | "catalog" | "purchasing" | "khata" | "reports" | "backup" | "packs" | "license" | "audit" | "master" | "dashboard" | "wizard">("checkout");
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    name: "Owner",
    role: "Owner",
  });

  useEffect(() => {
    api.getSystemStatus().then((sys) => {
      if (sys.is_first_run) {
        setActiveTab("wizard");
      }
      if (sys.current_user) {
        setCurrentUser({
          name: sys.current_user.username,
          role: sys.current_user.role,
        });
      }
    }).catch((err) => {
      console.warn("Could not query system status via IPC:", err);
    });
  }, []);

  const [status] = useState<SystemStatusDto>({
    app_name: "Next POS",
    pos_core_version: "0.1.0",
    offline_ready: true,
    database: {
      encrypted: true,
      journal_mode: "WAL",
      foreign_keys: true,
      schema_version: "V2__catalog_indexes",
      tables_count: 46,
    },
    sample_currency: {
      paisa: 12550,
      formatted: "PKR 125.50",
    },
  });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Header Bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Next POS
              <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                PRO
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Offline-First Retail POS & ERP</p>
          </div>
        </div>

        {/* Center Nav Tabs */}
        <nav className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-950/70 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800/80">
          <button
            onClick={() => { setActiveTab("checkout"); setIsMoreMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "checkout"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-950"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>POS</span>
          </button>
          <button
            onClick={() => { setActiveTab("catalog"); setIsMoreMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "catalog"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catalog</span>
          </button>
          <button
            onClick={() => { setActiveTab("khata"); setIsMoreMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "khata"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Khata Ledger</span>
          </button>
          <button
            onClick={() => { setActiveTab("purchasing"); setIsMoreMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "purchasing"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Inventory</span>
          </button>
          <button
            onClick={() => { setActiveTab("reports"); setIsMoreMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "reports"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Reports</span>
          </button>

          {/* More Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsMoreMenuOpen((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                ["backup", "packs", "license", "audit", "master", "wizard"].includes(activeTab)
                  ? "bg-emerald-600/30 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span>More</span>
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50">
                <button
                  onClick={() => { setActiveTab("backup"); setIsMoreMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Cloud & Local Backup</span>
                </button>
                <button
                  onClick={() => { setActiveTab("license"); setIsMoreMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Key className="w-3.5 h-3.5 text-emerald-500" />
                  <span>License Management</span>
                </button>
                <button
                  onClick={() => { setActiveTab("packs"); setIsMoreMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <Boxes className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Industry Packs</span>
                </button>
                <button
                  onClick={() => { setActiveTab("audit"); setIsMoreMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Stock Audit</span>
                </button>
                <button
                  onClick={() => { setActiveTab("master"); setIsMoreMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <FolderTree className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Master Data</span>
                </button>
                <button
                  onClick={() => { setActiveTab("wizard"); setIsMoreMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 border-t border-slate-200 dark:border-slate-800"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                  <span>Setup Wizard</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Offline status indicator */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <WifiOff className="w-3.5 h-3.5" />
            Offline Ready
          </span>

          {/* Theme Toggle Button (Light / Dark) */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
            title={`Toggle Theme (Ctrl+T) - Current: ${theme === "dark" ? "Dark" : "Light"}`}
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden md:inline">Dark</span>
              </>
            )}
          </button>

          {/* Diagnostics Button */}
          <button
            onClick={() => setIsDiagnosticsOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
            title="System & Hardware Diagnostics"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden lg:inline">Health</span>
          </button>

          {/* Cashier Badge & PIN Switch */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-300 dark:border-slate-800">
            <div className="text-right hidden lg:block">
              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-none">{currentUser.name}</div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium capitalize mt-0.5">{currentUser.role}</div>
            </div>
            <button
              onClick={() => setIsPinModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
              title="Quick Switch / Lock"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Switch</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6">
        {activeTab === "checkout" && <CheckoutView />}

        {activeTab === "catalog" && (
          <CatalogView onOpenBulkImport={() => setIsBulkImportOpen(true)} />
        )}

        {activeTab === "purchasing" && <PurchasingView />}

        {activeTab === "khata" && <KhataView />}

        {activeTab === "reports" && <ReportsView />}

        {activeTab === "backup" && <BackupView />}

        {activeTab === "packs" && <IndustryPacksView />}

        {activeTab === "license" && <LicenseView />}

        {activeTab === "audit" && <StockAuditView />}

        {activeTab === "master" && <MasterDataView />}

        {activeTab === "wizard" && (
          <FirstRunWizard onComplete={() => setActiveTab("checkout")} />
        )}

        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-6">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                Next POS System
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pure Rust <code className="text-emerald-600 dark:text-emerald-400 font-mono">pos-core</code> engine • 50k Item Importer (&lt; 30s) • Complete Offline Architecture
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Core Engine */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Architecture</span>
                  <Cpu className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">pos-core v{status.pos_core_version}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Decoupled pure Rust business logic & 50k item streaming engine</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Active Operator</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono font-medium">{currentUser.name}</span>
                </div>
              </div>

              {/* Card 2: Database & Storage */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Local Storage</span>
                  <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">SQLite {status.database.journal_mode} Mode</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">V2 Catalog Indexes active (sub-15ms lookups)</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Import Speed</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium font-mono">4,648 items/sec</span>
                </div>
              </div>

              {/* Card 3: Precision Money */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Money Engine</span>
                  <Coins className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">{status.sample_currency.formatted}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Integer Paisa: {status.sample_currency.paisa} (Zero Float)</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Stock Policy</span>
                  <span className="text-rose-500 font-semibold uppercase">Block Negative</span>
                </div>
              </div>
            </div>

            {/* Security & Integrity Box */}
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Phase 3 Catalog Engine Verified</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    High-speed catalog indexing, barcode scanner resolution, packaging unit conversions, and bulk Excel/CSV importer.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sprint 3 Gates Met
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/60 px-6 py-3 text-center text-xs text-slate-500">
        Next POS v0.1.0 • Offline Ready • High Performance Retail POS
      </footer>

      {/* Fast PIN Switch Modal */}
      <PinLoginModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={(cashierName, role) => {
          setCurrentUser({ name: cashierName, role });
        }}
      />

      {/* Bulk Importer Modal */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
      />

      {/* System Diagnostics Modal */}
      <SystemDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}
