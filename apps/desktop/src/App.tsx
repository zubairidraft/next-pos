import { useState, useEffect, useRef } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { Agentation } from "agentation";
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
  ChevronDown,
  Tag,
  Scale,
  Users,
  FileSpreadsheet,
  Lock,
  LogOut,
  X,
  AlertCircle,
  FileUp,
  AlertTriangle,
} from "lucide-react";

function AppContent() {
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<"checkout" | "catalog" | "purchasing" | "khata" | "reports" | "backup" | "packs" | "license" | "audit" | "master" | "dashboard" | "wizard">("checkout");
  const [masterSubTab, setMasterSubTab] = useState<"categories" | "brands" | "units">("categories");
  const [purchasingSubTab, setPurchasingSubTab] = useState<"invoices" | "stock" | "vendors">("invoices");
  const [isCatalogDropdownOpen, setIsCatalogDropdownOpen] = useState(false);
  const [isInventoryDropdownOpen, setIsInventoryDropdownOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // SaaS Admin State (Protected behind master password: NextPOS57348861!)
  const [isSaasAdmin, setIsSaasAdmin] = useState<boolean>(() => {
    try {
      return localStorage.getItem("nextpos_saas_admin") === "true";
    } catch {
      return false;
    }
  });
  const [isSaasAdminModalOpen, setIsSaasAdminModalOpen] = useState(false);
  const [saasPasswordInput, setSaasPasswordInput] = useState("");
  const [saasError, setSaasError] = useState("");

  const navRef = useRef<HTMLElement>(null);

  // Global click-outside and Escape key listener for all dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsCatalogDropdownOpen(false);
        setIsInventoryDropdownOpen(false);
        setIsMoreMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsCatalogDropdownOpen(false);
        setIsInventoryDropdownOpen(false);
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSaasAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (saasPasswordInput === "NextPOS57348861!") {
      setIsSaasAdmin(true);
      try {
        localStorage.setItem("nextpos_saas_admin", "true");
      } catch {}
      setIsSaasAdminModalOpen(false);
      setSaasPasswordInput("");
      setSaasError("");
    } else {
      setSaasError("Invalid SaaS Admin credentials. Access denied.");
    }
  };

  const handleSaasAdminLogout = () => {
    setIsSaasAdmin(false);
    try {
      localStorage.removeItem("nextpos_saas_admin");
    } catch {}
    setIsMoreMenuOpen(false);
  };

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
        <nav ref={navRef} className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-950/70 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800/80">
          <button
            onClick={() => {
              setActiveTab("checkout");
              setIsCatalogDropdownOpen(false);
              setIsInventoryDropdownOpen(false);
              setIsMoreMenuOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "checkout"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-950"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>POS</span>
          </button>

          {/* Catalog Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsCatalogDropdownOpen((v) => !v);
                setIsInventoryDropdownOpen(false);
                setIsMoreMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "catalog" || activeTab === "master"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Catalog</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {isCatalogDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                <button
                  onClick={() => {
                    setActiveTab("catalog");
                    setIsCatalogDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <Package className="w-3.5 h-3.5 text-emerald-500" />
                  <span>All Products & Prices</span>
                </button>
                <button
                  onClick={() => {
                    setMasterSubTab("categories");
                    setActiveTab("master");
                    setIsCatalogDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <FolderTree className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Categories Manager</span>
                </button>
                <button
                  onClick={() => {
                    setMasterSubTab("brands");
                    setActiveTab("master");
                    setIsCatalogDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Brands Directory</span>
                </button>
                <button
                  onClick={() => {
                    setMasterSubTab("units");
                    setActiveTab("master");
                    setIsCatalogDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <Scale className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Units of Measure (UOM)</span>
                </button>
                <button
                  onClick={() => {
                    setIsBulkImportOpen(true);
                    setIsCatalogDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition border-t border-slate-100 dark:border-slate-800"
                >
                  <FileUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Excel / CSV Bulk Importer</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setActiveTab("khata");
              setIsCatalogDropdownOpen(false);
              setIsInventoryDropdownOpen(false);
              setIsMoreMenuOpen(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "khata"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Khata Ledger</span>
          </button>

          {/* Inventory Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsInventoryDropdownOpen((v) => !v);
                setIsCatalogDropdownOpen(false);
                setIsMoreMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "purchasing" || activeTab === "audit"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Inventory</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {isInventoryDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                <button
                  onClick={() => {
                    setPurchasingSubTab("stock");
                    setActiveTab("purchasing");
                    setIsInventoryDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <Boxes className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Stock Balances & Valuation</span>
                </button>
                <button
                  onClick={() => {
                    setPurchasingSubTab("invoices");
                    setActiveTab("purchasing");
                    setIsInventoryDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Purchase Invoices (Receiving)</span>
                </button>
                <button
                  onClick={() => {
                    setPurchasingSubTab("vendors");
                    setActiveTab("purchasing");
                    setIsInventoryDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Vendors & Distributors</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("khata");
                    setIsInventoryDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Customers & Khata Accounts</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("audit");
                    setIsInventoryDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 text-amber-500" />
                  <span>Stock Audit & Physical Count</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("reports");
                    setIsInventoryDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition border-t border-slate-100 dark:border-slate-800"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  <span>Low Stock Reorder Alerts</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setActiveTab("reports");
              setIsCatalogDropdownOpen(false);
              setIsInventoryDropdownOpen(false);
              setIsMoreMenuOpen(false);
            }}
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
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50">
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

                {/* SaaS Admin Section */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-1 mt-1">
                  {!isSaasAdmin ? (
                    <button
                      onClick={() => {
                        setIsSaasAdminModalOpen(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center gap-2 font-medium"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>SaaS Admin Login</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsDiagnosticsOpen(true);
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-semibold"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Diagnostics (Admin)</span>
                      </button>
                      <button
                        onClick={handleSaasAdminLogout}
                        className="w-full px-3 py-2 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 font-medium"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>SaaS Admin Logout</span>
                      </button>
                    </>
                  )}
                </div>
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
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
            title={`Toggle Theme (Ctrl+T) - Currently: ${theme === "dark" ? "Dark Mode" : "Light Mode"}`}
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

          {/* Health Diagnostics Button - ONLY VISIBLE TO SAAS ADMIN */}
          {isSaasAdmin && (
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 transition"
              title="SaaS Admin: Hardware & Engine Health Diagnostics"
            >
              <Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden lg:inline">Health (Admin)</span>
            </button>
          )}

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

      {/* Main Content Area - Full Width */}
      <main className="flex-1 w-full px-4 sm:px-6 py-3">
        {activeTab === "checkout" && <CheckoutView />}

        {activeTab === "catalog" && (
          <CatalogView onOpenBulkImport={() => setIsBulkImportOpen(true)} />
        )}

        {activeTab === "purchasing" && <PurchasingView initialTab={purchasingSubTab} />}

        {activeTab === "khata" && <KhataView />}

        {activeTab === "reports" && <ReportsView />}

        {activeTab === "backup" && <BackupView />}

        {activeTab === "packs" && <IndustryPacksView />}

        {activeTab === "license" && <LicenseView />}

        {activeTab === "audit" && <StockAuditView />}

        {activeTab === "master" && <MasterDataView initialTab={masterSubTab} />}

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

      {/* SaaS Admin Master Authentication Modal */}
      {isSaasAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">SaaS Admin Access</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Master Administrative Portal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSaasAdminModalOpen(false);
                  setSaasPasswordInput("");
                  setSaasError("");
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaasAdminLogin} className="p-6 space-y-4">
              {saasError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saasError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Master Password
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Enter SaaS master password..."
                  value={saasPasswordInput}
                  onChange={(e) => {
                    setSaasPasswordInput(e.target.value);
                    if (saasError) setSaasError("");
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSaasAdminModalOpen(false);
                    setSaasPasswordInput("");
                    setSaasError("");
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Unlock Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
        {import.meta.env.DEV && (
          <Agentation
            endpoint="http://localhost:4747"
            appName="Next POS"
          />
        )}
      </LanguageProvider>
    </ThemeProvider>
  );
}
