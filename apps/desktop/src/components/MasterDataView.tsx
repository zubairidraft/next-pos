import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderTree, Tag, Scale, Plus, Search, Trash2 } from "lucide-react";

interface MasterItem {
  id: string;
  name: string;
  nameUr?: string;
  code?: string;
  decimals?: number;
}

export const MasterDataView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"categories" | "brands" | "units">("categories");
  const [search, setSearch] = useState("");

  const [categories, setCategories] = useState<MasterItem[]>([
    { id: "1", name: "Beverages & Drinks", nameUr: "مشروبات اور کولڈ ڈرنکس" },
    { id: "2", name: "Cooking Oil & Ghee", nameUr: "کوکنگ آئل اور گھی" },
    { id: "3", name: "Pulses, Rice & Flour", nameUr: "دالیں، چاول اور آٹا" },
    { id: "4", name: "Spices & Masalas", nameUr: "مصالحہ جات" },
    { id: "5", name: "Dairy & Bakery", nameUr: "دودھ، دہی اور بیکری" },
  ]);

  const [brands, setBrands] = useState<MasterItem[]>([
    { id: "1", name: "Shan Foods", nameUr: "شان فوڈز" },
    { id: "2", name: "National Foods", nameUr: "نیشنل فوڈز" },
    { id: "3", name: "Dalda", nameUr: "ڈالڈا" },
    { id: "4", name: "Olper's", nameUr: "اولپرز" },
    { id: "5", name: "Tapal Tea", nameUr: "ٹپال چائے" },
  ]);

  const [units, setUnits] = useState<MasterItem[]>([
    { id: "1", name: "Piece", code: "pc", decimals: 0 },
    { id: "2", name: "Kilogram", code: "kg", decimals: 3 },
    { id: "3", name: "Liter", code: "ltr", decimals: 3 },
    { id: "4", name: "Meter", code: "m", decimals: 2 },
    { id: "5", name: "Dozen", code: "dozen", decimals: 0 },
    { id: "6", name: "Carton", code: "carton", decimals: 0 },
  ]);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNameEn, setNewNameEn] = useState("");
  const [newNameUr, setNewNameUr] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDecimals, setNewDecimals] = useState(0);

  const handleAdd = () => {
    if (!newNameEn.trim()) return;
    const newItem: MasterItem = {
      id: Date.now().toString(),
      name: newNameEn.trim(),
      nameUr: newNameUr.trim() || undefined,
      code: newCode.trim() || undefined,
      decimals: newDecimals,
    };

    if (activeTab === "categories") setCategories([...categories, newItem]);
    if (activeTab === "brands") setBrands([...brands, newItem]);
    if (activeTab === "units") setUnits([...units, newItem]);

    setNewNameEn("");
    setNewNameUr("");
    setNewCode("");
    setNewDecimals(0);
    setShowAddForm(false);
  };

  const getFilteredItems = () => {
    const list =
      activeTab === "categories" ? categories : activeTab === "brands" ? brands : units;
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.nameUr && item.nameUr.includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q))
    );
  };

  return (
    <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-6 gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">{t("master.title")}</h2>
          <p className="text-xs text-slate-400">{t("master.subtitle")}</p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow transition"
        >
          <Plus className="w-4 h-4" />
          <span>
            {activeTab === "categories"
              ? t("master.add_category")
              : activeTab === "brands"
              ? t("master.add_brand")
              : t("master.add_unit")}
          </span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          onClick={() => {
            setActiveTab("categories");
            setShowAddForm(false);
          }}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "categories"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>{t("master.categories")}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400">
            {categories.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("brands");
            setShowAddForm(false);
          }}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "brands"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>{t("master.brands")}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400">
            {brands.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("units");
            setShowAddForm(false);
          }}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "units"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>{t("master.units")}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400">
            {units.length}
          </span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute top-3 left-3 rtl:left-auto rtl:right-3 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("master.search_placeholder")}
          className="w-full pl-9 pr-4 rtl:pr-9 rtl:pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {/* Add Form Modal/Card */}
      {showAddForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-white">
            {activeTab === "categories"
              ? t("master.add_category")
              : activeTab === "brands"
              ? t("master.add_brand")
              : t("master.add_unit")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t("master.name_en")} *
              </label>
              <input
                type="text"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {activeTab !== "units" ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t("master.name_ur")}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={newNameUr}
                  onChange={(e) => setNewNameUr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t("master.unit_code")} *
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g. g, pack"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t("master.decimals")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="3"
                    value={newDecimals}
                    onChange={(e) => setNewDecimals(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
            >
              {t("master.cancel")}
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
            >
              {t("master.save")}
            </button>
          </div>
        </div>
      )}

      {/* Table Data */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left rtl:text-right text-xs">
          <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
            <tr>
              <th className="px-5 py-3">#</th>
              <th className="px-5 py-3">{t("master.name_en")}</th>
              {activeTab !== "units" ? (
                <th className="px-5 py-3">{t("master.name_ur")}</th>
              ) : (
                <>
                  <th className="px-5 py-3">{t("master.unit_code")}</th>
                  <th className="px-5 py-3">{t("master.decimals")}</th>
                </>
              )}
              <th className="px-5 py-3 text-right rtl:text-left">{t("master.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {getFilteredItems().map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-800/40 transition">
                <td className="px-5 py-3 font-mono text-slate-500">{idx + 1}</td>
                <td className="px-5 py-3 font-medium text-white">{item.name}</td>
                {activeTab !== "units" ? (
                  <td className="px-5 py-3 text-emerald-400 font-urdu">{item.nameUr || "—"}</td>
                ) : (
                  <>
                    <td className="px-5 py-3 font-mono text-amber-400">{item.code}</td>
                    <td className="px-5 py-3 text-slate-300">{item.decimals}</td>
                  </>
                )}
                <td className="px-5 py-3 text-right rtl:text-left">
                  <button
                    onClick={() => {
                      if (activeTab === "categories")
                        setCategories(categories.filter((c) => c.id !== item.id));
                      if (activeTab === "brands")
                        setBrands(brands.filter((b) => b.id !== item.id));
                      if (activeTab === "units")
                        setUnits(units.filter((u) => u.id !== item.id));
                    }}
                    className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {getFilteredItems().length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                  {t("master.no_records")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
