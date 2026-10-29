import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Store, Layers, Calculator, KeyRound, ArrowRight, ArrowLeft, Check } from "lucide-react";

interface FirstRunWizardProps {
  onComplete: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    shopNameEn: "Al-Rehman Superstore",
    shopNameUr: "الرحمٰن سپر اسٹور",
    phone: "03001234567",
    address: "Shop 12, Main Commercial Market, Lahore",
    ntn: "",
    pack: "grocery",
    taxMode: "inclusive",
    policy: "Block",
    adminUser: "admin",
    adminPassword: "",
    cashierPin: "1234",
  });

  const nextStep = () => setStep((s) => Math.min(s + 1, 4));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="max-w-2xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-8">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">{t("wizard.title")}</h2>
        <p className="text-xs text-slate-400">{t("wizard.subtitle")}</p>

        {/* Stepper indicators */}
        <div className="flex justify-center items-center gap-2 mt-6">
          {[1, 2, 3, 4].map((i) => (
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

      {/* Step 1: Shop Profile */}
      {step === 1 && (
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

      {/* Step 2: Industry Pack */}
      {step === 2 && (
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

      {/* Step 3: Tax & Currency */}
      {step === 3 && (
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

      {/* Step 4: Admin Credentials */}
      {step === 4 && (
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

        {step < 4 ? (
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
            onClick={onComplete}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
          >
            <Check className="w-4 h-4" />
            <span>{t("wizard.finish_btn")}</span>
          </button>
        )}
      </div>
    </div>
  );
};
