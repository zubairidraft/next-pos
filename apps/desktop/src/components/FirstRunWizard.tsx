import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Store, Layers, Calculator, KeyRound, ArrowRight, ArrowLeft, Check, AlertCircle, Sparkles, FolderPlus } from "lucide-react";
import { api } from "../lib/api";

interface FirstRunWizardProps {
  onComplete: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    accountType: "demo" | "fresh";
    shopNameEn: string;
    shopNameUr: string;
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
    shopNameUr: "الرحمٰن سپر اسٹور",
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
        shop_name_ur: formData.shopNameUr,
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
    <div className="max-w-2xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-8">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">{t("wizard.title")}</h2>
        <p className="text-xs text-slate-400">{t("wizard.subtitle")}</p>

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
                  : "w-4 bg-slate-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Account Type Selection (Demo vs Fresh) */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
            <Sparkles className="w-4 h-4" />
            <span>اکاؤنٹ کی قسم منتخب کریں / Select Account Mode</span>
          </div>

          <div
            onClick={() =>
              setFormData({
                ...formData,
                accountType: "demo",
                shopNameEn: formData.shopNameEn || "Al-Rehman Superstore",
                shopNameUr: formData.shopNameUr || "الرحمٰن سپر اسٹور",
              })
            }
            className={`p-5 rounded-2xl border cursor-pointer transition ${
              formData.accountType === "demo"
                ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-base">
                    1. Demo Account (ڈیمو اکاؤنٹ - آزمائشی موڈ)
                  </div>
                  <div className="text-xs text-emerald-400 mt-0.5">تجربہ اور تمام فیچرز چیک کرنے کے لیے</div>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
                تجرباتی
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-3 leading-relaxed">
              اس موڈ میں پہلے سے ریٹیل اشیاء (ٹپال چائے، ڈالڈا آئل، اولپرز دودھ، باسمتی چاول، لکس صابن)، اسٹاک بیلنس اور ادھار کھاتہ موجود ہوگا تاکہ آپ فوری طور پر بارکوڈ اسکین، بل پرنٹنگ، شفٹس اور رپورٹس ٹیسٹ کر سکیں۔
            </p>
          </div>

          <div
            onClick={() =>
              setFormData({
                ...formData,
                accountType: "fresh",
                shopNameEn: formData.shopNameEn === "Al-Rehman Superstore" ? "My Retail Store" : formData.shopNameEn,
                shopNameUr: formData.shopNameUr === "الرحمٰن سپر اسٹور" ? "میری دکان" : formData.shopNameUr,
              })
            }
            className={`p-5 rounded-2xl border cursor-pointer transition ${
              formData.accountType === "fresh"
                ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-base">
                    2. Fresh Account (فریش اکاؤنٹ - نئی دکان کا آغاز)
                  </div>
                  <div className="text-xs text-blue-400 mt-0.5">0 ٹرانزیکشنز، بالکل صاف ڈیٹا بیس</div>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300">
                100% کلین
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-3 leading-relaxed">
              بالکل نیا کھاتہ! کوئی ڈمی سیل یا ڈمی پروڈکٹ نہیں ہوگی۔ 0 سے اسٹور شروع ہوگا تاکہ دکاندار اپنی اصلی اشیاء اور اصل بارکوڈز خود درج کر کے حقیقی کاروبار شروع کر سکے۔
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Shop Profile */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
            <Store className="w-4 h-4" />
            <span>{t("wizard.step_profile")}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.shop_name_en")} *
            </label>
            <input
              type="text"
              value={formData.shopNameEn}
              onChange={(e) => setFormData({ ...formData, shopNameEn: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.shop_name_ur")}
            </label>
            <input
              type="text"
              dir="rtl"
              value={formData.shopNameUr}
              onChange={(e) => setFormData({ ...formData, shopNameUr: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none font-urdu"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t("wizard.phone")} *
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t("wizard.ntn")}
              </label>
              <input
                type="text"
                value={formData.ntn}
                onChange={(e) => setFormData({ ...formData, ntn: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="e.g. 1234567-8"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.address")}
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Step 3: Industry Pack */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
            <Layers className="w-4 h-4" />
            <span>{t("wizard.step_pack")}</span>
          </div>

          <div
            onClick={() => setFormData({ ...formData, pack: "grocery" })}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              formData.pack === "grocery"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
            }`}
          >
            <div className="font-semibold text-sm text-white">{t("wizard.pack_grocery")}</div>
            <p className="text-xs text-slate-400 mt-1">
              Optimized for grocery, fruits, vegetables, loose weight items, and scale barcodes (prefix 20–29).
            </p>
          </div>

          <div
            onClick={() => setFormData({ ...formData, pack: "electronics" })}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              formData.pack === "electronics"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
            }`}
          >
            <div className="font-semibold text-sm text-white">{t("wizard.pack_electronics")}</div>
            <p className="text-xs text-slate-400 mt-1">
              Optimized for mobile shops, electronics, warranty tracking, and serial/IMEI scanning.
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Tax & Currency */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
            <Calculator className="w-4 h-4" />
            <span>{t("wizard.step_tax")}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.tax_mode")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, taxMode: "inclusive" })}
                className={`py-3 px-4 rounded-xl text-xs font-medium border text-center transition ${
                  formData.taxMode === "inclusive"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {t("wizard.tax_inclusive")}
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, taxMode: "exclusive" })}
                className={`py-3 px-4 rounded-xl text-xs font-medium border text-center transition ${
                  formData.taxMode === "exclusive"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {t("wizard.tax_exclusive")}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.stock_policy")}
            </label>
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-emerald-400 flex items-center justify-between">
              <span>{t("wizard.policy_block")}</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                Enforced
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Admin Credentials */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
            <KeyRound className="w-4 h-4" />
            <span>{t("wizard.step_admin")}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.admin_username")} *
            </label>
            <input
              type="text"
              value={formData.adminUser}
              onChange={(e) => setFormData({ ...formData, adminUser: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.admin_password")} *
            </label>
            <input
              type="password"
              value={formData.adminPassword}
              onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t("wizard.cashier_pin")} *
            </label>
            <input
              type="text"
              maxLength={4}
              value={formData.cashierPin}
              onChange={(e) => setFormData({ ...formData, cashierPin: e.target.value.replace(/\D/g, "") })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm tracking-widest text-center font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
        {step > 1 ? (
          <button
            type="button"
            onClick={prevStep}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{t("wizard.back_btn")}</span>
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            type="button"
            onClick={nextStep}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
          >
            <span>{t("wizard.next_btn")}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
          >
            <Check className="w-4 h-4" />
            <span>{loading ? "Creating..." : t("wizard.finish_btn")}</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
