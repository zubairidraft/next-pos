import { useEffect, useRef, useState } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { SessionProvider, useSession } from "./context/SessionContext";
import { ToastProvider } from "./lib/toast";
import { Agentation } from "agentation";
import { LoginScreen } from "./components/LoginScreen";
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
import { UsersView } from "./components/UsersView";
import { PhonesView } from "./components/PhonesView";
import { SaleHistoryView } from "./components/SaleHistoryView";
import { deliverRemoteScan } from "./lib/remoteScan";
import { useToast } from "./lib/toast";
import { SystemDiagnosticsModal } from "./components/SystemDiagnosticsModal";
import { PrinterSettingsModal } from "./components/PrinterSettingsModal";
import { BranchesModal, BranchPicker, ShopNameModal } from "./components/BranchViews";
import { api, BranchesInfo, isBrowserTest, isTauri, licenseLabel, onRemoteScan, Permission } from "./lib/api";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  FileUp,
  FolderTree,
  HardDriveDownload,
  History,
  Key,
  Loader2,
  Lock,
  Moon,
  MoreHorizontal,
  Package,
  Printer,
  Scale,
  ShoppingCart,
  ShieldCheck,
  Smartphone,
  Store,
  Sun,
  Tag,
  Truck,
  UserCog,
  Users,
  WifiOff,
} from "lucide-react";

type Tab = "checkout" | "sales" | "catalog" | "purchasing" | "khata" | "reports" | "backup" | "packs" | "license" | "audit" | "master" | "users" | "phones";

/** Which permission opens each screen (the backend checks again on every action). */
const TAB_PERMS: Record<Tab, Permission[]> = {
  checkout: ["SalesCreate"],
  sales: ["SalesCreate", "SalesReturn"],
  catalog: ["PriceEdit", "InventoryAdjust"],
  master: ["PriceEdit"],
  khata: ["SalesCreate"],
  purchasing: ["PurchaseEntry"],
  audit: ["InventoryAdjust"],
  reports: ["ReportsView"],
  backup: ["BackupManage"],
  license: ["SettingsManage"],
  packs: ["SettingsManage"],
  users: ["SettingsManage"],
  phones: ["SettingsManage"],
};

const menuItem = "w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium transition";

function Shell() {
  const { theme, toggleTheme } = useTheme();
  const { status, session, logout, can } = useSession();
  const allowed = (t: Tab) => TAB_PERMS[t].some((p) => can(p));
  const firstTab = (Object.keys(TAB_PERMS) as Tab[]).find(allowed) || "checkout";

  const [activeTab, setActiveTab] = useState<Tab>(firstTab);
  const [masterSubTab, setMasterSubTab] = useState<"categories" | "brands" | "units">("categories");
  const [purchasingSubTab, setPurchasingSubTab] = useState<"invoices" | "stock" | "vendors" | "claims">("invoices");
  const [openMenu, setOpenMenu] = useState<null | "catalog" | "inventory" | "more">(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isPrinterOpen, setIsPrinterOpen] = useState(false);
  const [isBranchesOpen, setIsBranchesOpen] = useState(false);
  const [isShopNameOpen, setIsShopNameOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [reportKind, setReportKind] = useState("daily");
  const toast = useToast();

  // Barcodes from paired phones go to the open Sale, Purchase or Stock count screen.
  useEffect(() => {
    if (!session) return;
    return onRemoteScan((s) => {
      if (!deliverRemoteScan(s.code, s.device_name)) {
        toast.info(`${s.device_name} scanned ${s.code}. Open Sale, a new purchase, or Stock count to use phone scans.`);
      }
    });
  }, [session, toast]);

  // A different user logged in: make sure the open screen is one they may use.
  useEffect(() => {
    if (!allowed(activeTab)) setActiveTab(firstTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user_id]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const go = (t: Tab) => {
    setActiveTab(t);
    setOpenMenu(null);
  };
  const tabBtn = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
      active ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
    }`;

  const lic = status?.license;
  const licWarn = lic && lic.status !== "Active" ? licenseLabel(lic) : null;
  const moreTabs: Tab[] = ["backup", "license", "packs", "users", "phones"];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 backdrop-blur px-4 lg:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-40 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-emerald-500/10 dark:bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm">
            <Boxes className="w-6 h-6" />
          </div>
          <div className="min-w-0 hidden md:block">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">{status?.store_name || "Next POS"}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Next POS</p>
          </div>
        </div>

        <nav ref={navRef} className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-950/70 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800/80">
          {allowed("checkout") && (
            <button onClick={() => go("checkout")} className={tabBtn(activeTab === "checkout") + " font-bold"}>
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>POS</span>
            </button>
          )}

          {allowed("sales") && (
            <button onClick={() => go("sales")} className={tabBtn(activeTab === "sales")}>
              <History className="w-3.5 h-3.5" />
              <span>Sale history</span>
            </button>
          )}

          {(allowed("catalog") || allowed("master")) && (
            <div className="relative">
              <button onClick={() => setOpenMenu(openMenu === "catalog" ? null : "catalog")} className={tabBtn(activeTab === "catalog" || activeTab === "master")}>
                <Package className="w-3.5 h-3.5" />
                <span>Catalog</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
              {openMenu === "catalog" && (
                <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50">
                  <button onClick={() => go("catalog")} className={menuItem}>
                    <Package className="w-3.5 h-3.5 text-emerald-500" /> Products & prices
                  </button>
                  {allowed("master") && (
                    <>
                      <button onClick={() => { setMasterSubTab("categories"); go("master"); }} className={menuItem}>
                        <FolderTree className="w-3.5 h-3.5 text-emerald-500" /> Categories
                      </button>
                      <button onClick={() => { setMasterSubTab("brands"); go("master"); }} className={menuItem}>
                        <Tag className="w-3.5 h-3.5 text-emerald-500" /> Brands
                      </button>
                      <button onClick={() => { setMasterSubTab("units"); go("master"); }} className={menuItem}>
                        <Scale className="w-3.5 h-3.5 text-emerald-500" /> Units of measure
                      </button>
                      <button onClick={() => { setIsBulkImportOpen(true); setOpenMenu(null); }} className={menuItem + " border-t border-slate-100 dark:border-slate-800"}>
                        <FileUp className="w-3.5 h-3.5 text-emerald-500" /> Import from CSV
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {allowed("khata") && (
            <button onClick={() => go("khata")} className={tabBtn(activeTab === "khata")}>
              <BookOpen className="w-3.5 h-3.5" />
              <span>Khata</span>
            </button>
          )}

          {(allowed("purchasing") || allowed("audit")) && (
            <div className="relative">
              <button onClick={() => setOpenMenu(openMenu === "inventory" ? null : "inventory")} className={tabBtn(activeTab === "purchasing" || activeTab === "audit")}>
                <Truck className="w-3.5 h-3.5" />
                <span>Inventory</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
              {openMenu === "inventory" && (
                <div className="absolute left-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50">
                  {allowed("purchasing") && (
                    <>
                      <button onClick={() => { setPurchasingSubTab("stock"); go("purchasing"); }} className={menuItem}>
                        <Boxes className="w-3.5 h-3.5 text-emerald-500" /> Stock balances
                      </button>
                      <button onClick={() => { setPurchasingSubTab("invoices"); go("purchasing"); }} className={menuItem}>
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Purchase / return
                      </button>
                      <button onClick={() => { setPurchasingSubTab("vendors"); go("purchasing"); }} className={menuItem}>
                        <Users className="w-3.5 h-3.5 text-emerald-500" /> Vendors
                      </button>
                      <button onClick={() => { setPurchasingSubTab("claims"); go("purchasing"); }} className={menuItem}>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Claims
                      </button>
                    </>
                  )}
                  {allowed("audit") && (
                    <button onClick={() => go("audit")} className={menuItem}>
                      <ClipboardCheck className="w-3.5 h-3.5 text-amber-500" /> Stock count
                    </button>
                  )}
                  {allowed("reports") && (
                    <button onClick={() => (setReportKind("stock"), go("reports"))} className={menuItem + " border-t border-slate-100 dark:border-slate-800"}>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Low stock
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {allowed("reports") && (
            <button onClick={() => (setReportKind("daily"), go("reports"))} className={tabBtn(activeTab === "reports")}>
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Reports</span>
            </button>
          )}

          {moreTabs.some(allowed) && (
            <div className="relative">
              <button onClick={() => setOpenMenu(openMenu === "more" ? null : "more")} className={tabBtn(moreTabs.includes(activeTab))}>
                <MoreHorizontal className="w-3.5 h-3.5" />
                <span>More</span>
              </button>
              {openMenu === "more" && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1.5 z-50">
                  {allowed("backup") && (
                    <button onClick={() => go("backup")} className={menuItem}>
                      <HardDriveDownload className="w-3.5 h-3.5 text-emerald-500" /> Backup & cloud sync
                    </button>
                  )}
                  {allowed("users") && (
                    <button onClick={() => go("users")} className={menuItem}>
                      <UserCog className="w-3.5 h-3.5 text-emerald-500" /> Users & PINs
                    </button>
                  )}
                  {allowed("phones") && (
                    <button onClick={() => go("phones")} className={menuItem}>
                      <Smartphone className="w-3.5 h-3.5 text-emerald-500" /> Mobile phones
                    </button>
                  )}
                  {allowed("license") && (
                    <button onClick={() => go("license")} className={menuItem}>
                      <Key className="w-3.5 h-3.5 text-emerald-500" /> License
                    </button>
                  )}
                  {allowed("packs") && (
                    <button onClick={() => go("packs")} className={menuItem}>
                      <Boxes className="w-3.5 h-3.5 text-emerald-500" /> Industry packs
                    </button>
                  )}
                  {can("SettingsManage") && (
                    <button onClick={() => { setIsShopNameOpen(true); setOpenMenu(null); }} className={menuItem}>
                      <Store className="w-3.5 h-3.5 text-emerald-500" /> Shop name
                    </button>
                  )}
                  {can("SettingsManage") && (
                    <button onClick={() => { setIsBranchesOpen(true); setOpenMenu(null); }} className={menuItem}>
                      <Store className="w-3.5 h-3.5 text-emerald-500" /> Branches
                    </button>
                  )}
                  {can("SettingsManage") && (
                    <button onClick={() => { setIsPrinterOpen(true); setOpenMenu(null); }} className={menuItem}>
                      <Printer className="w-3.5 h-3.5 text-emerald-500" /> Printer & cash drawer
                    </button>
                  )}
                  {can("SettingsManage") && (
                    <button onClick={() => { setIsDiagnosticsOpen(true); setOpenMenu(null); }} className={menuItem + " border-t border-slate-100 dark:border-slate-800"}>
                      <Activity className="w-3.5 h-3.5 text-amber-500" /> System health
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <WifiOff className="w-3.5 h-3.5" /> Offline
          </span>
          <button
            onClick={toggleTheme}
            aria-label="Toggle light or dark theme"
            className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>
          <div className="flex items-center gap-2 pl-2 border-l border-slate-300 dark:border-slate-800">
            <div className="text-right hidden lg:block">
              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-none">{session?.username}</div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">{session?.role}</div>
            </div>
            <button
              onClick={logout}
              title="Lock / switch user"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
            >
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      {licWarn && (
        <div className={`px-6 py-2 text-xs font-semibold text-center ${status?.can_post_sales ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" : "bg-rose-600 text-white"}`}>
          {licWarn}
          {!status?.can_post_sales && " — new sales are blocked. Reports, khata and backups still work."}
          {can("SettingsManage") && (
            <button onClick={() => go("license")} className="underline ml-2">
              Open License
            </button>
          )}
        </div>
      )}

      <main className="flex-1 w-full px-4 sm:px-6 py-3">
        {activeTab === "checkout" && allowed("checkout") && <CheckoutView />}
        {activeTab === "sales" && allowed("sales") && <SaleHistoryView />}
        {activeTab === "catalog" && allowed("catalog") && <CatalogView onOpenBulkImport={() => setIsBulkImportOpen(true)} />}
        {activeTab === "purchasing" && allowed("purchasing") && <PurchasingView initialTab={purchasingSubTab} />}
        {activeTab === "khata" && allowed("khata") && <KhataView />}
        {activeTab === "reports" && allowed("reports") && <ReportsView initialKind={reportKind} />}
        {activeTab === "backup" && allowed("backup") && <BackupView />}
        {activeTab === "packs" && allowed("packs") && <IndustryPacksView />}
        {activeTab === "license" && allowed("license") && <LicenseView />}
        {activeTab === "audit" && allowed("audit") && <StockAuditView />}
        {activeTab === "master" && allowed("master") && <MasterDataView initialTab={masterSubTab} />}
        {activeTab === "users" && allowed("users") && <UsersView />}
        {activeTab === "phones" && allowed("phones") && <PhonesView />}
        {!allowed(activeTab) && (
          <div className="text-center text-sm text-slate-500 mt-20">Your role has no screens here. Ask the Owner for access.</div>
        )}
      </main>

      {isBrowserTest && (
        <div className="fixed bottom-2 left-2 z-30 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold shadow">
          Browser test mode · test data · printing off
        </div>
      )}
      <footer className="border-t border-slate-200 dark:border-slate-800/60 px-6 py-2 text-center text-xs text-slate-500">
        Next POS v{status?.app_version} · {lic ? licenseLabel(lic) : ""}
      </footer>

      <BulkImportModal isOpen={isBulkImportOpen} onClose={() => setIsBulkImportOpen(false)} />
      <SystemDiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
      <PrinterSettingsModal isOpen={isPrinterOpen} onClose={() => setIsPrinterOpen(false)} />
      <BranchesModal isOpen={isBranchesOpen} onClose={() => setIsBranchesOpen(false)} />
      <ShopNameModal isOpen={isShopNameOpen} onClose={() => setIsShopNameOpen(false)} />
    </div>
  );
}

/** Decides what to show: branch choice → startup error → first-run setup → login → the app. */
function Gate() {
  const { loading, startupError, status, session } = useSession();
  // More than one branch on this PC: choose one when the app starts.
  const [branches, setBranches] = useState<BranchesInfo | null | undefined>(isTauri || isBrowserTest ? undefined : null);
  useEffect(() => {
    if (branches !== undefined) return;
    api.branches().then(setBranches).catch(() => setBranches(null));
  }, [branches]);
  if (branches && !branches.chosen && branches.list.length > 1) {
    return <BranchPicker info={branches} onStay={() => setBranches(null)} />;
  }
  if (loading || branches === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (startupError || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-6">
        <div role="alert" className="max-w-lg bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-2xl p-6 shadow-xl">
          <h1 className="text-lg font-bold text-rose-600 mb-2">The shop data could not be opened</h1>
          <p className="text-sm text-slate-700 dark:text-slate-300 break-words">{startupError}</p>
          <ul className="text-xs text-slate-600 dark:text-slate-400 mt-4 list-disc pl-5 space-y-1">
            <li>Close any other copy of Next POS and open it again.</li>
            <li>If Windows was reinstalled, the shop key must be restored from the Owner's recovery phrase. Contact your dealer.</li>
            <li>Do not delete anything in the NextPOS folder.</li>
          </ul>
        </div>
      </div>
    );
  }
  if (status.needs_setup) return <FirstRunWizard />;
  if (!session) return <LoginScreen />;
  return <Shell key={session.user_id} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <SessionProvider>
            <Gate />
          </SessionProvider>
        </ToastProvider>
        {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" appName="Next POS" />}
      </LanguageProvider>
    </ThemeProvider>
  );
}
