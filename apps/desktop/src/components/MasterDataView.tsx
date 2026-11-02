import React, { useState, useEffect } from "react";
import { FolderTree, Tag, Scale, Plus, Search, Trash2 } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"categories" | "brands" | "units">(initialTab);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [categories, setCategories] = useState<MasterItem[]>([
    { id: "1", name: "Beverages & Drinks", description: "Soft drinks, juices, mineral water" },
    { id: "2", name: "Cooking Oil & Ghee", description: "Vegetable oil, banaspati ghee, mustard oil" },
    { id: "3", name: "Pulses, Rice & Flour", description: "Basmati rice, chakki atta, daal chana" },
    { id: "4", name: "Spices & Recipe Mixes", description: "Biryani masala, salt, red chilli, haldi" },
    { id: "5", name: "Dairy & Bakery", description: "Milk packs, yogurt, bread, eggs, rusks" },
    { id: "6", name: "Snacks & Confectionery", description: "Biscuits, chips, chocolates, sweets" },
    { id: "7", name: "Household & Cleaning", description: "Soaps, detergents, dishwash, surface cleaners" },
  ]);

  const [brands, setBrands] = useState<MasterItem[]>([
    { id: "1", name: "Shan Foods", description: "Recipe mixes, spices & pickles" },
    { id: "2", name: "National Foods", description: "Spices, ketchups, desserts & jams" },
    { id: "3", name: "Dalda", description: "Cooking oil & banaspati ghee" },
    { id: "4", name: "Olper's", description: "Tetra milk, cream & dairy" },
    { id: "5", name: "Tapal Tea", description: "Danedar, family mixture & green tea" },
    { id: "6", name: "LU Biscuits", description: "Prince, Oreo, Candi, Zeera Plus" },
    { id: "7", name: "English Biscuit Manufacturers", description: "Sooper, Gluco, Rio" },
    { id: "8", name: "Unilever", description: "Knorr, Lifebuoy, Surf Excel, Lipton" },
  ]);

  const [units, setUnits] = useState<MasterItem[]>([
    { id: "1", name: "Piece", code: "pc", decimals: 0, description: "Individual retail units" },
    { id: "2", name: "Kilogram", code: "kg", decimals: 3, description: "Weight measurement in kg" },
    { id: "3", name: "Liter", code: "ltr", decimals: 3, description: "Liquid volume measurement" },
    { id: "4", name: "Pack", code: "pkt", decimals: 0, description: "Packets and sachets" },
    { id: "5", name: "Box / Carton", code: "ctn", decimals: 0, description: "Wholesale outer cartons" },
    { id: "6", name: "Dozen", code: "dzn", decimals: 0, description: "12 individual units" },
  ]);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNameEn, setNewNameEn] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDecimals, setNewDecimals] = useState(0);

  const handleAdd = () => {
    if (!newNameEn.trim()) return;
    const newItem: MasterItem = {
      id: Date.now().toString(),
      name: newNameEn.trim(),
      description: newDescription.trim() || undefined,
      code: newCode.trim() || undefined,
      decimals: newDecimals,
    };

    if (activeTab === "categories") setCategories([...categories, newItem]);
    if (activeTab === "brands") setBrands([...brands, newItem]);
    if (activeTab === "units") setUnits([...units, newItem]);

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
                  Description / Remarks
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional brief details"
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
                <th className="px-5 py-3">Description / Remarks</th>
              ) : (
                <>
                  <th className="px-5 py-3">Symbol / Code</th>
                  <th className="px-5 py-3">Decimal Places</th>
                </>
              )}
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
            {getFilteredItems().map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                <td className="px-5 py-3 font-mono text-slate-400 dark:text-slate-500 text-center">{idx + 1}</td>
                <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{item.name}</td>
                {activeTab !== "units" ? (
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{item.description || "—"}</td>
                ) : (
                  <>
                    <td className="px-5 py-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{item.code}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300 font-mono">{item.decimals}</td>
                  </>
                )}
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => {
                      if (activeTab === "categories")
                        setCategories(categories.filter((c) => c.id !== item.id));
                      if (activeTab === "brands")
                        setBrands(brands.filter((b) => b.id !== item.id));
                      if (activeTab === "units")
                        setUnits(units.filter((u) => u.id !== item.id));
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
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
