import React, { useState, useEffect } from "react";
import { X, Sparkles, Box, DollarSign, Barcode as BarcodeIcon, Layers, Plus, Loader2 } from "lucide-react";
import { api, errorText, formatQty, ProductDetail } from "../lib/api";
import { useToast } from "../lib/toast";

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
  /** Warn when stock falls to this many (in the base unit). 0 = no warning. */
  lowStockAlert?: number;
  /** A service (repair, fitting, delivery): sold like a product, no stock. */
  isService?: boolean;
  active?: boolean;
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string | null;
  /** Resolves true when saved; the form stays open on false (for create mode). */
  onSave?: (product: ProductFormData) => Promise<boolean>;
  onSaved?: () => void;
  initialData?: ProductFormData | null;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  units: { id: string; name: string; code: string }[];
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  productId,
  onSave,
  onSaved,
  initialData,
  categories,
  brands,
  units,
}) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  const blank = (): ProductFormData => ({
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
    lowStockAlert: 0,
    isService: false,
    active: true,
  });

  const [formData, setFormData] = useState<ProductFormData>(() => initialData || blank());

  const editId = productId || initialData?.id;

  // Clean form state on modal open/close and load details if editing
  useEffect(() => {
    if (isOpen && editId) {
      setLoadingDetail(true);
      api
        .productDetail(editId)
        .then((d) => {
          setDetail(d);
          setFormData({
            id: d.id,
            sku: d.sku,
            name: d.name,
            nameUr: d.name_ur || "",
            categoryId: d.category_id || "",
            brandId: d.brand_id || "",
            baseUnit: d.base_unit_code,
            barcode: d.barcode || "",
            retailPrice: d.retail_price_paisa / 100,
            wholesalePrice: d.wholesale_price_paisa ? d.wholesale_price_paisa / 100 : 0,
            hasPackagingUnit: !!d.packaging_unit,
            packUnit: d.packaging_unit?.unit_code || "carton",
            packFactor: d.packaging_unit ? d.packaging_unit.factor_to_base / 1000 : 24,
            packBarcode: d.packaging_unit?.barcode || "",
            packRetailPrice: d.packaging_unit?.retail_price_paisa ? d.packaging_unit.retail_price_paisa / 100 : 0,
            lowStockAlert: d.reorder_level_milli / 1000,
            isService: d.is_service,
            active: d.active,
          });
        })
        .catch((e) => toast.error(errorText(e)))
        .finally(() => setLoadingDetail(false));
    } else if (isOpen) {
      setDetail(null);
      setFormData(blank());
    } else {
      setDetail(null);
      setFormData(blank());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editId]);

  // Keyboard shortcut listener: Alt+A toggles active, F9 saves, Esc closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setFormData((prev) => ({ ...prev, active: !prev.active }));
      } else if (e.key === "F9") {
        e.preventDefault();
        submitForm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!isOpen) return null;

  const isBaseUnitLocked = !!detail && (detail.has_movements || detail.has_sales || detail.has_purchases);
  const cannotBeService = !!detail && !detail.is_service && detail.on_hand_milli > 0;

  /** Unique in-store EAN-13 from the backend (prefix 29, checked against all barcodes). */
  const generateBarcode = async () => {
    try {
      const code = await api.generateBarcode();
      setFormData((prev) => ({ ...prev, barcode: code }));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const submitForm = async () => {
    if (!formData.sku.trim() || !formData.name.trim() || formData.retailPrice <= 0) {
      toast.error("Enter a SKU, a product name and a retail price.");
      return;
    }
    if (formData.wholesalePrice && formData.wholesalePrice > formData.retailPrice) {
      toast.error("Wholesale price cannot be more than the sale price.");
      return;
    }

    setSaving(true);
    try {
      if (detail) {
        // Edit mode: updateProduct
        const baseUnit = units.find((u) => u.code.toLowerCase() === (formData.baseUnit || "pc").toLowerCase());
        if (!baseUnit) {
          toast.error("Pick a unit for this product");
          setSaving(false);
          return;
        }
        const packUnit = formData.hasPackagingUnit
          ? units.find((u) => u.code.toLowerCase() === formData.packUnit?.toLowerCase())
          : undefined;

        await api.updateProduct({
          product_id: detail.id,
          sku: formData.sku.trim(),
          name: formData.name.trim(),
          name_ur: formData.nameUr?.trim() || null,
          category_id: formData.categoryId || null,
          brand_id: formData.brandId || null,
          base_unit_id: baseUnit.id,
          barcode: formData.barcode?.trim() || null,
          retail_price_paisa: Math.round(formData.retailPrice * 100),
          wholesale_price_paisa: formData.wholesalePrice ? Math.round(formData.wholesalePrice * 100) : null,
          tax_rate_id: detail.tax_rate_id,
          reorder_level_milli:
            !formData.isService && formData.lowStockAlert ? Math.round(formData.lowStockAlert * 1000) : 0,
          is_service: !!formData.isService,
          active: formData.active ?? true,
          packaging_unit:
            formData.hasPackagingUnit && packUnit
              ? {
                  unit_id: packUnit.id,
                  factor_to_base: (formData.packFactor || 24) * 1000,
                  barcode: formData.packBarcode?.trim() || null,
                  retail_price_paisa: formData.packRetailPrice ? Math.round(formData.packRetailPrice * 100) : null,
                }
              : null,
        });

        toast.success(`Product ${formData.name.trim()} updated`);
        onClose();
        onSaved?.();
      } else if (onSave) {
        // Create mode
        const ok = await onSave(formData);
        if (ok) {
          onClose();
          onSaved?.();
        }
      }
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitForm();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Box className="w-5 h-5 text-emerald-500" />
              {detail ? "Edit product" : "Add New Product"}
              {loadingDetail && <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />}
            </h3>
            {detail && (
              <span className="text-[11px] text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                Tracking: {detail.track_mode || "none"} (read-only)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={formData.active ?? true}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
              <span>Active</span>
              <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono">Alt+A</kbd>
            </label>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Product or service */}
          <div className="flex gap-2" role="radiogroup" aria-label="Item type">
            {([
              [false, "Product", "Has stock: bought and sold"],
              [true, "Service", "No stock: repair, fitting, delivery…"],
            ] as const).map(([svc, title, help]) => {
              const disabledSvc = svc && cannotBeService;
              return (
                <button
                  key={title}
                  type="button"
                  disabled={disabledSvc}
                  role="radio"
                  aria-checked={!!formData.isService === svc}
                  onClick={() => !disabledSvc && setFormData({ ...formData, isService: svc })}
                  className={`flex-1 text-left px-3 py-2 rounded-xl border text-xs transition ${
                    !!formData.isService === svc
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                      : "border-slate-300 dark:border-slate-700"
                  } ${disabledSvc ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900" : ""}`}
                >
                  <div className="font-bold">{title}</div>
                  <div className="text-[11px] text-slate-500">
                    {disabledSvc
                      ? `Stock is ${formatQty(detail!.on_hand_milli, detail!.base_unit_code)}. Adjust stock to 0 first.`
                      : help}
                  </div>
                </button>
              );
            })}
          </div>

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
                          toast.error(errorText(err));
                          return;
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
                          toast.error(errorText(err));
                          return;
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
                disabled={isBaseUnitLocked}
                value={formData.baseUnit}
                onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value })}
                className={`w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-xs ${
                  isBaseUnitLocked ? "opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-900" : ""
                }`}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.code}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
              {isBaseUnitLocked && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Unit cannot change after stock or sales exist.
                </p>
              )}
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
                  step="0.01"
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
                  step="0.01"
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

          {/* Low stock alert */}
          <div className={formData.isService ? "hidden" : ""}>
            <label htmlFor="low-stock-alert" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Low stock alert ({formData.baseUnit || "pc"})
            </label>
            <input
              id="low-stock-alert"
              type="number"
              step="any"
              min="0"
              value={formData.lowStockAlert || ""}
              onChange={(e) => setFormData({ ...formData, lowStockAlert: Math.max(0, parseFloat(e.target.value) || 0) })}
              placeholder="e.g. 5 (leave empty for no alert)"
              className="w-full sm:w-1/2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono shadow-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">When stock falls to this quantity or less, the product shows in Low stock (reports and dashboard).</p>
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
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 shadow-md transition"
            >
              {saving ? "Saving…" : detail ? "Save Changes (F9)" : "Save Product Record (F9)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
