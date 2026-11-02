import React, { useState } from "react";
import { Store, Layers, Calculator, KeyRound, ArrowRight, ArrowLeft, Check, AlertCircle, Sparkles, FolderPlus } from "lucide-react";
import { api } from "../lib/api";

interface FirstRunWizardProps {
  onComplete: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    accountType: "demo" | "fresh";
    shopNameEn: string;
    phone: string;
    address: string;
    ntn: string;
    pack: string;
    taxMode: string;
    policy: string;
    adminUser: string;
    adminPassword: string;
    cashierPin: string;
  }>({
    accountType: "demo",
    shopNameEn: "Al-Rehman Superstore",
    phone: "03001234567",
    address: "Shop 12, Main Commercial Market, Lahore",
    ntn: "",
    pack: "grocery",
    taxMode: "inclusive",
    policy: "Block",
    adminUser: "owner",
    adminPassword: "password123",
    cashierPin: "1234",
  });

  const nextStep = () => {
    setErrorMsg(null);
    setStep((s) => Math.min(s + 1, 5));
  };
  const prevStep = () => {
    setErrorMsg(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleFinish = async () => {
    setErrorMsg(null);
    if (!formData.adminPassword || formData.adminPassword.length < 8) {
      setErrorMsg("Owner password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api.setupFirstOwner({
        username: formData.adminUser,
        password: formData.adminPassword,
        pin: formData.cashierPin,
        shop_name: formData.shopNameEn,
        phone: formData.phone,
        address: formData.address,
        account_type: formData.accountType,
      });
      onComplete();
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full dark:bg-slate-900 bg-white dark:border-slate-800 border-slate-200 border rounded-2xl shadow-xl overflow-hidden p-8 transition-colors">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold dark:text-white text-slate-900 mb-2">Next POS Setup Wizard</h2>
        <p className="text-xs dark:text-slate-400 text-slate-500">Configure your store settings, initial inventory mode, and owner credentials</p>

        {/* Stepper indicators */}
        <div className="flex justify-center items-center gap-2 mt-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                step === i
                  ? "w-8 bg-emerald-500"
                  : step > i
                  ? "w-4 bg-emerald-600/40"
                  : "w-4 dark:bg-slate-800 bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Account Mode Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 mb-2">
            <Sparkles className="w-4 h-4" />
            <span>Select Account Mode</span>
          </div>

          <div
            onClick={() =>
              setFormData({
                ...formData,
                accountType: "demo",
                shopNameEn: formData.shopNameEn || "Al-Rehman Superstore",
              })
            }
            className={`p-5 rounded-2xl border cursor-pointer transition ${
              formData.accountType === "demo"
                ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                : "dark:border-slate-800 border-slate-200 dark:bg-slate-800/40 bg-slate-50 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-500">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold dark:text-white text-slate-900 text-base">
                    1. Demo Account (Testing & Exploration)
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Preloaded catalog, stock balances, and sample customer
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                Recommended for Testing
              </span>
            </div>
            <p className="text-xs dark:text-slate-300 text-slate-600 mt-3 leading-relaxed">
              Pre-loaded with popular retail items (Tea, Cooking Oil, Milk, Basmati Rice, Beauty Soap, Spices), real inventory stock levels, and a credit customer account. You can immediately test barcode scanning, invoice printing, shifts, and reports.
            </p>
          </div>

          <div
            onClick={() =>
              setFormData({
                ...formData,
                accountType: "fresh",
                shopNameEn: formData.shopNameEn === "Al-Rehman Superstore" ? "My Retail Store" : formData.shopNameEn,
              })
            }
            className={`p-5 rounded-2xl border cursor-pointer transition ${
              formData.accountType === "fresh"
                ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                : "dark:border-slate-800 border-slate-200 dark:bg-slate-800/40 bg-slate-50 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-500">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold dark:text-white text-slate-900 text-base">
                    2. Fresh Account (Clean Store Launch)
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    0 transactions, 0 demo products, clean slate
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300">
                100% Clean
              </span>
            </div>
            <p className="text-xs dark:text-slate-300 text-slate-600 mt-3 leading-relaxed">
              Completely clean database. 0 transactions, 0 demo products, and 0 sample customer balances. Standard units (PC, KG, LTR, CTN) and categories are created so store owners can enter their real catalog and start live business immediately.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Shop Profile */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 mb-2">
            <Store className="w-4 h-4" />
            <span>Store Profile & Information</span>
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Store Name *
            </label>
            <input
              type="text"
              value={formData.shopNameEn}
              onChange={(e) => setFormData({ ...formData, shopNameEn: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
                Phone Number *
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
                NTN / Tax Registration (Optional)
              </label>
              <input
                type="text"
                value={formData.ntn}
                onChange={(e) => setFormData({ ...formData, ntn: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="e.g. 1234567-8"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Store Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Step 3: Industry Pack */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 mb-2">
            <Layers className="w-4 h-4" />
            <span>Select Industry Workflow</span>
          </div>

          <div
            onClick={() => setFormData({ ...formData, pack: "grocery" })}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              formData.pack === "grocery"
                ? "border-emerald-500 bg-emerald-500/10"
                : "dark:border-slate-800 border-slate-200 dark:bg-slate-800/40 bg-slate-50 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="font-semibold text-sm dark:text-white text-slate-900">Grocery & Supermarket</div>
            <p className="text-xs dark:text-slate-400 text-slate-500 mt-1">
              Optimized for grocery, fruits, vegetables, loose weight items, and scale barcodes (prefix 20–29).
            </p>
          </div>

          <div
            onClick={() => setFormData({ ...formData, pack: "electronics" })}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              formData.pack === "electronics"
                ? "border-emerald-500 bg-emerald-500/10"
                : "dark:border-slate-800 border-slate-200 dark:bg-slate-800/40 bg-slate-50 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div className="font-semibold text-sm dark:text-white text-slate-900">Electronics & Mobile Shop</div>
            <p className="text-xs dark:text-slate-400 text-slate-500 mt-1">
              Optimized for mobile shops, electronics, warranty tracking, and serial/IMEI scanning.
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Tax & Currency */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 mb-2">
            <Calculator className="w-4 h-4" />
            <span>Taxation & Inventory Policy</span>
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Tax Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, taxMode: "inclusive" })}
                className={`py-3 px-4 rounded-xl text-xs font-medium border text-center transition ${
                  formData.taxMode === "inclusive"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                    : "dark:bg-slate-800 bg-slate-100 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-600"
                }`}
              >
                Tax Inclusive (Retail Standard)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, taxMode: "exclusive" })}
                className={`py-3 px-4 rounded-xl text-xs font-medium border text-center transition ${
                  formData.taxMode === "exclusive"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                    : "dark:bg-slate-800 bg-slate-100 dark:border-slate-700 border-slate-300 dark:text-slate-400 text-slate-600"
                }`}
              >
                Tax Exclusive (+ Tax on Checkout)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Stock Protection Policy
            </label>
            <div className="p-3 dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 rounded-xl text-xs text-emerald-500 flex items-center justify-between">
              <span>Block Sale when Out of Stock (Strict Protection)</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                Enforced
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Admin Credentials */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 mb-2">
            <KeyRound className="w-4 h-4" />
            <span>Store Owner Credentials</span>
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Owner Username *
            </label>
            <input
              type="text"
              value={formData.adminUser}
              onChange={(e) => setFormData({ ...formData, adminUser: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Owner Master Password (min 8 chars) *
            </label>
            <input
              type="password"
              value={formData.adminPassword}
              onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium dark:text-slate-300 text-slate-700 mb-1">
              Cashier Quick 4-Digit Unlock PIN *
            </label>
            <input
              type="text"
              maxLength={4}
              value={formData.cashierPin}
              onChange={(e) => setFormData({ ...formData, cashierPin: e.target.value.replace(/\D/g, "") })}
              className="w-full px-3.5 py-2.5 rounded-xl dark:bg-slate-800 bg-slate-100 border dark:border-slate-700 border-slate-300 dark:text-white text-slate-900 text-sm tracking-widest text-center font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t dark:border-slate-800 border-slate-200">
        {step > 1 ? (
          <button
            type="button"
            onClick={prevStep}
            className="px-4 py-2 rounded-xl dark:bg-slate-800 bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 dark:text-slate-300 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            type="button"
            onClick={nextStep}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
          >
            <span>Next</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
          >
            <Check className="w-4 h-4" />
            <span>{loading ? "Configuring..." : "Complete Setup & Launch"}</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
