import React, { useState, useEffect } from "react";
import { FolderTree, Tag, Scale, Plus, Search } from "lucide-react";
import { api, errorText } from "../lib/api";
import { useToast } from "../lib/toast";

interface MasterItem {
  id: string;
  name: string;
  description?: string;
  code?: string;
  decimals?: number;
}

interface MasterDataViewProps {
  initialTab?: "categories" | "brands" | "units";
}

export const MasterDataView: React.FC<MasterDataViewProps> = ({ initialTab = "categories" }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"categories" | "brands" | "units">(initialTab);
  const [search, setSearch] = useState("");

  const [categories, setCategories] = useState<MasterItem[]>([]);

  const [brands, setBrands] = useState<MasterItem[]>([]);

  const [units, setUnits] = useState<MasterItem[]>([]);

  const loadData = async () => {
    try {
      const [cats, brs, unts] = await Promise.all([
        api.listCategories(),
        api.listBrands(),
        api.listUnits(),
      ]);
      setCategories(cats.map(c => ({ id: c.id, name: c.name, description: c.name_ur || undefined })));
      setBrands(brs.map(b => ({ id: b.id, name: b.name, description: b.name_ur || undefined })));
      setUnits(unts.map(u => ({ id: u.id, name: u.name, code: u.code, decimals: u.decimals_allowed })));
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    loadData();
  }, []);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNameEn, setNewNameEn] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDecimals, setNewDecimals] = useState(0);

  const handleAdd = async () => {
    if (!newNameEn.trim()) return;
    try {
      if (activeTab === "categories") {
        const created = await api.createCategory(newNameEn.trim(), newDescription.trim() || null);
        setCategories(prev => [...prev, { id: created.id, name: created.name, description: created.name_ur || undefined }]);
      } else if (activeTab === "brands") {
        const created = await api.createBrand(newNameEn.trim(), newDescription.trim() || null);
        setBrands(prev => [...prev, { id: created.id, name: created.name, description: created.name_ur || undefined }]);
      } else if (activeTab === "units") {
        const unitCode = newCode.trim().toLowerCase() || newNameEn.trim().slice(0, 3).toLowerCase();
        const created = await api.createUnit(unitCode, newNameEn.trim(), newDecimals);
        setUnits(prev => [...prev, { id: created.id, name: created.name, code: created.code, decimals: created.decimals_allowed }]);
      }
    } catch (err) {
      toast.error(errorText(err));
      return;
    }

    setNewNameEn("");
    setNewDescription("");
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
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q))
    );
  };

  return (
    <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-4 sm:p-6 gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {activeTab === "categories" ? (
              <FolderTree className="w-5 h-5 text-emerald-500" />
            ) : activeTab === "brands" ? (
              <Tag className="w-5 h-5 text-emerald-500" />
            ) : (
              <Scale className="w-5 h-5 text-emerald-500" />
            )}
            {activeTab === "categories"
              ? "Product Categories Manager"
              : activeTab === "brands"
              ? "Brand & Manufacturer Directory"
              : "Units of Measurement (UOM)"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Organize catalog taxonomy, product brand linkages, and measurement scales for fast POS lookup.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>
            {activeTab === "categories"
              ? "+ Add Category"
              : activeTab === "brands"
              ? "+ Add Brand"
              : "+ Add Unit"}
          </span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => {
            setActiveTab("categories");
            setShowAddForm(false);
          }}
          className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "categories"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>Categories</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">
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
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Brands</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">
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
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Units of Measure</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">
            {units.length}
          </span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute top-3 left-3 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeTab}...`}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition shadow-sm"
        />
      </div>

      {/* Add Form Card */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {activeTab === "categories"
              ? "Create New Category"
              : activeTab === "brands"
              ? "Create New Brand"
              : "Create New Measurement Unit"}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
                placeholder="e.g. Cooking Oil, Shan Foods, Piece"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {activeTab !== "units" ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name in Urdu
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="اختیاری"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Unit Code *
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g. pc, kg, ltr"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Decimal Precision
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="3"
                    value={newDecimals}
                    onChange={(e) => setNewDecimals(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition"
            >
              Save Record
            </button>
          </div>
        </div>
      )}

      {/* Table Data */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
            <tr>
              <th className="px-5 py-3 w-12 text-center">#</th>
              <th className="px-5 py-3">Name</th>
              {activeTab !== "units" ? (
                <th className="px-5 py-3">Urdu name</th>
              ) : (
                <>
                  <th className="px-5 py-3">Symbol / Code</th>
                  <th className="px-5 py-3">Decimal Places</th>
                </>
              )}
              <th className="px-5 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
            {getFilteredItems().map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                <td className="px-5 py-3 font-mono text-slate-400 dark:text-slate-500 text-center">{idx + 1}</td>
                <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{item.name}</td>
                {activeTab !== "units" ? (
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400" dir="rtl">{item.description || "—"}</td>
                ) : (
                  <>
                    <td className="px-5 py-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{item.code}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300 font-mono">{item.decimals}</td>
                  </>
                )}
                <td className="px-5 py-3 text-right" />
              </tr>
            ))}
            {getFilteredItems().length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  No records match the search query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
