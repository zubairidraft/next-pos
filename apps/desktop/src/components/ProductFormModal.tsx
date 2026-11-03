import React, { useState, useEffect } from "react";
import { X, Sparkles, Box, DollarSign, Barcode as BarcodeIcon, Layers, Plus } from "lucide-react";
import { api } from "../lib/api";

export interface ProductFormData {
  id?: string;
  sku: string;
  name: string;
  nameUr?: string;
  categoryId?: string;
  brandId?: string;
  baseUnit: string;
  barcode?: string;
  retailPrice: number;
  wholesalePrice?: number;
  hasPackagingUnit: boolean;
  packUnit?: string;
  packFactor?: number;
  packBarcode?: string;
  packRetailPrice?: number;
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: ProductFormData) => void;
  initialData?: ProductFormData | null;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  units: { id: string; name: string; code: string }[];
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  categories,
  brands,
  units,
}) => {
  const [localCategories, setLocalCategories] = useState(categories);
  const [localBrands, setLocalBrands] = useState(brands);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  useEffect(() => {
    setLocalBrands(brands);
  }, [brands]);

  const [formData, setFormData] = useState<ProductFormData>(() => {
    if (initialData) return initialData;
    return {
      sku: "",
      name: "",
      nameUr: "",
      categoryId: categories[0]?.id || "",
      brandId: brands[0]?.id || "",
      baseUnit: units[0]?.code || "pc",
      barcode: "",
      retailPrice: 0,
      wholesalePrice: 0,
      hasPackagingUnit: false,
      packUnit: "carton",
      packFactor: 24,
      packBarcode: "",
      packRetailPrice: 0,
    };
  });

  if (!isOpen) return null;

  const generateBarcode = () => {
    const randomSuffix = Math.floor(100000000 + Math.random() * 900000000);
    setFormData((prev) => ({
      ...prev,
      barcode: `8964${randomSuffix}`,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sku.trim() || !formData.name.trim() || formData.retailPrice <= 0) {
      alert("Please enter a valid SKU, product name, and retail price.");
      return;
    }
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Box className="w-5 h-5 text-emerald-500" />
            {initialData ? "Edit Product Details" : "Add New Product"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Row 1: SKU & Barcode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Item SKU / Product Code *
              </label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="e.g. SHAN-BIR-50G"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono shadow-xs"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Barcode (EAN-13 / UPC)
                </label>
                <button
                  type="button"
                  onClick={generateBarcode}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 flex items-center gap-1 font-semibold"
                >
                  <Sparkles className="w-3 h-3" />
                  Auto Generate
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={formData.barcode || ""}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="e.g. 8964000101112"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono pl-9 shadow-xs"
                />
                <BarcodeIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {/* Row 2: Product Name & Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Product Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Shan Bombay Biryani Masala 50g"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 shadow-xs"
            />
          </div>

          {/* Row 3: Category, Brand & Base Unit */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category Select or Create New */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 flex items-center gap-0.5 font-semibold transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isCreatingCategory ? "Select" : "+ New"}</span>
                </button>
              </div>

              {isCreatingCategory ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category..."
                    className="flex-1 bg-white dark:bg-slate-950 border border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const name = newCategoryName.trim();
                      if (name) {
                        try {
                          const created = await api.createCategory(name);
                          const newCat = { id: created.id, name: created.name };
                          setLocalCategories((prev) => [...prev, newCat]);
                          setFormData((prev) => ({ ...prev, categoryId: newCat.id }));
                        } catch (err) {
                          console.warn("Failed to create category in SQLite, using local fallback", err);
                          const newCat = { id: `cat-${Date.now()}`, name };
                          setLocalCategories((prev) => [...prev, newCat]);
                          setFormData((prev) => ({ ...prev, categoryId: newCat.id }));
                        }
                        setNewCategoryName("");
                        setIsCreatingCategory(false);
                      }
                    }}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-xs"
                >
                  {localCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Brand Select or Create New */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Brand
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingBrand(!isCreatingBrand)}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 flex items-center gap-0.5 font-semibold transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isCreatingBrand ? "Select" : "+ New"}</span>
                </button>
              </div>

              {isCreatingBrand ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="New brand..."
                    className="flex-1 bg-white dark:bg-slate-950 border border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const name = newBrandName.trim();
                      if (name) {
                        try {
                          const created = await api.createBrand(name);
                          const newB = { id: created.id, name: created.name };
                          setLocalBrands((prev) => [...prev, newB]);
                          setFormData((prev) => ({ ...prev, brandId: newB.id }));
                        } catch (err) {
                          console.warn("Failed to create brand in SQLite, using local fallback", err);
                          const newB = { id: `brand-${Date.now()}`, name };
                          setLocalBrands((prev) => [...prev, newB]);
                          setFormData((prev) => ({ ...prev, brandId: newB.id }));
                        }
                        setNewBrandName("");
                        setIsCreatingBrand(false);
                      }
                    }}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <select
                  value={formData.brandId}
                  onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-xs"
                >
                  {localBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Base Unit */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Base Unit
              </label>
              <select
                value={formData.baseUnit}
                onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-xs"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.code}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Multi-tier Prices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Retail Selling Price (PKR) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  required
                  min="0.01"
                  value={formData.retailPrice || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, retailPrice: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="140.00"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 pl-8 font-mono shadow-xs"
                />
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Wholesale Price (PKR)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={formData.wholesalePrice || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, wholesalePrice: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="125.00"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 pl-8 font-mono shadow-xs"
                />
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
          </div>

          {/* Row 5: Packaging Unit Option */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={formData.hasPackagingUnit}
                onChange={(e) =>
                  setFormData({ ...formData, hasPackagingUnit: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-0 focus:ring-offset-0 bg-white dark:bg-slate-950"
              />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                Enable Secondary Packaging / Bulk Pack Unit
              </span>
            </label>

            {formData.hasPackagingUnit && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Pack Unit
                  </label>
                  <select
                    value={formData.packUnit}
                    onChange={(e) => setFormData({ ...formData, packUnit: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="carton">Carton</option>
                    <option value="box">Box</option>
                    <option value="pack">Pack</option>
                    <option value="dozen">Dozen</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Pack Factor (Units/Pack)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.packFactor || 24}
                    onChange={(e) =>
                      setFormData({ ...formData, packFactor: parseInt(e.target.value) || 1 })
                    }
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Pack Barcode
                  </label>
                  <input
                    type="text"
                    value={formData.packBarcode || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, packBarcode: e.target.value })
                    }
                    placeholder="Outer Barcode"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Pack Price (PKR)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.packRetailPrice || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        packRetailPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="e.g. 3200"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md transition"
            >
              Save Product Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
