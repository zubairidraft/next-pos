import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Plus,
  FileSpreadsheet,
  Barcode,
  Layers,
  Edit2,
  Trash2,
  Package,
} from "lucide-react";
import { ProductFormModal, ProductFormData } from "./ProductFormModal";

interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  nameUr?: string;
  category: string;
  brand: string;
  unit: string;
  barcode?: string;
  retailPrice: number;
  wholesalePrice?: number;
  packagingUnit?: {
    name: string;
    factor: number;
    barcode?: string;
    price?: number;
  };
}

interface CatalogViewProps {
  onOpenBulkImport: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({ onOpenBulkImport }) => {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormData | null>(null);

  // Initial demo retail stock data representing typical Pakistani FMCG inventory
  const [products, setProducts] = useState<CatalogItem[]>([
    {
      id: "prod_1",
      sku: "SHAN-BIR-50G",
      name: "Shan Special Bombay Biryani Masala 50g",
      nameUr: "شان اسپیشل بمبئی بریانی مصالحہ 50 گرام",
      category: "Spices & Recipe Mixes",
      brand: "Shan Foods",
      unit: "pc",
      barcode: "8964000101112",
      retailPrice: 140.0,
      wholesalePrice: 125.0,
      packagingUnit: {
        name: "carton",
        factor: 24,
        barcode: "8964000101999",
        price: 3200.0,
      },
    },
    {
      id: "prod_2",
      sku: "DALDA-OIL-1L",
      name: "Dalda Fortified Cooking Oil Pouch 1L",
      nameUr: "ڈالڈا کوکنگ آئل پاؤچ 1 لیٹر",
      category: "Cooking Oil & Ghee",
      brand: "Dalda",
      unit: "ltr",
      barcode: "8964000200111",
      retailPrice: 540.0,
      wholesalePrice: 510.0,
      packagingUnit: {
        name: "carton",
        factor: 12,
        barcode: "8964000200888",
        price: 6300.0,
      },
    },
    {
      id: "prod_3",
      sku: "TAPAL-DAN-400G",
      name: "Tapal Danedar Black Tea Box 400g",
      nameUr: "ٹپال دانے دار چائے 400 گرام",
      category: "Tea & Beverages",
      brand: "Tapal",
      unit: "pc",
      barcode: "8964000300222",
      retailPrice: 680.0,
      wholesalePrice: 640.0,
    },
    {
      id: "prod_4",
      sku: "LU-RIO-STR-12",
      name: "LU Rio Strawberry Cream Biscuits Family Pack",
      nameUr: "ریو اسٹرابیری بسکٹ فیملی پیک",
      category: "Snacks & Confectionery",
      brand: "LU",
      unit: "pc",
      barcode: "8964000400333",
      retailPrice: 40.0,
      wholesalePrice: 35.0,
      packagingUnit: {
        name: "box",
        factor: 12,
        barcode: "8964000400999",
        price: 450.0,
      },
    },
    {
      id: "prod_5",
      sku: "NAT-SALT-800G",
      name: "National Iodized Table Salt 800g",
      nameUr: "نیشنل آئیوڈین ملا نمک 800 گرام",
      category: "Spices & Recipe Mixes",
      brand: "National Foods",
      unit: "pc",
      barcode: "8964000500444",
      retailPrice: 60.0,
      wholesalePrice: 52.0,
    },
    {
      id: "prod_6",
      sku: "KRN-BAS-5KG",
      name: "Super Basmati Kernel Rice 5KG Pack",
      nameUr: "سپر باسپتی کرنل چاول ۵ کلو",
      category: "Rice, Pulses & Flour",
      brand: "Al-Rehman Foods",
      unit: "kg",
      barcode: "8964000600555",
      retailPrice: 1850.0,
      wholesalePrice: 1720.0,
    },
  ]);

  const categories = useMemo(
    () => [
      { id: "cat_1", name: "Spices & Recipe Mixes" },
      { id: "cat_2", name: "Cooking Oil & Ghee" },
      { id: "cat_3", name: "Tea & Beverages" },
      { id: "cat_4", name: "Snacks & Confectionery" },
      { id: "cat_5", name: "Rice, Pulses & Flour" },
    ],
    []
  );

  const brands = useMemo(
    () => [
      { id: "b_1", name: "Shan Foods" },
      { id: "b_2", name: "National Foods" },
      { id: "b_3", name: "Dalda" },
      { id: "b_4", name: "Tapal" },
      { id: "b_5", name: "LU" },
      { id: "b_6", name: "Al-Rehman Foods" },
    ],
    []
  );

  const units = useMemo(
    () => [
      { id: "u_1", name: "Piece", code: "pc" },
      { id: "u_2", name: "Kilogram", code: "kg" },
      { id: "u_3", name: "Liter", code: "ltr" },
      { id: "u_4", name: "Meter", code: "m" },
      { id: "u_5", name: "Dozen", code: "dozen" },
      { id: "u_6", name: "Carton", code: "carton" },
    ],
    []
  );

  // Focus scanner search bar on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filtered product items
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCategory === "all" || p.category === selectedCategory;
      const matchBrand = selectedBrand === "all" || p.brand === selectedBrand;
      if (!matchCat || !matchBrand) return false;

      if (!q) return true;

      return (
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.nameUr && p.nameUr.includes(q)) ||
        (p.barcode && p.barcode.includes(q)) ||
        (p.packagingUnit?.barcode && p.packagingUnit.barcode.includes(q))
      );
    });
  }, [products, search, selectedCategory, selectedBrand]);

  const handleSaveProduct = (formData: ProductFormData) => {
    const catName = categories.find((c) => c.id === formData.categoryId)?.name || "General";
    const brandName = brands.find((b) => b.id === formData.brandId)?.name || "Generic";

    if (formData.id) {
      // Edit existing
      setProducts((prev) =>
        prev.map((item) =>
          item.id === formData.id
            ? {
                ...item,
                sku: formData.sku,
                name: formData.name,
                nameUr: formData.nameUr,
                category: catName,
                brand: brandName,
                unit: formData.baseUnit,
                barcode: formData.barcode,
                retailPrice: formData.retailPrice,
                wholesalePrice: formData.wholesalePrice,
                packagingUnit: formData.hasPackagingUnit
                  ? {
                      name: formData.packUnit || "carton",
                      factor: formData.packFactor || 24,
                      barcode: formData.packBarcode,
                      price: formData.packRetailPrice,
                    }
                  : undefined,
              }
            : item
        )
      );
    } else {
      // Add new
      const newItem: CatalogItem = {
        id: `prod_${Date.now()}`,
        sku: formData.sku,
        name: formData.name,
        nameUr: formData.nameUr,
        category: catName,
        brand: brandName,
        unit: formData.baseUnit,
        barcode: formData.barcode,
        retailPrice: formData.retailPrice,
        wholesalePrice: formData.wholesalePrice,
        packagingUnit: formData.hasPackagingUnit
          ? {
              name: formData.packUnit || "carton",
              factor: formData.packFactor || 24,
              barcode: formData.packBarcode,
              price: formData.packRetailPrice,
            }
          : undefined,
      };
      setProducts((prev) => [newItem, ...prev]);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleEdit = (item: CatalogItem) => {
    setEditingProduct({
      id: item.id,
      sku: item.sku,
      name: item.name,
      nameUr: item.nameUr || "",
      categoryId: categories.find((c) => c.name === item.category)?.id || categories[0]?.id,
      brandId: brands.find((b) => b.name === item.brand)?.id || brands[0]?.id,
      baseUnit: item.unit,
      barcode: item.barcode || "",
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice || 0,
      hasPackagingUnit: !!item.packagingUnit,
      packUnit: item.packagingUnit?.name || "carton",
      packFactor: item.packagingUnit?.factor || 24,
      packBarcode: item.packagingUnit?.barcode || "",
      packRetailPrice: item.packagingUnit?.price || 0,
    });
    setIsFormModalOpen(true);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 flex flex-col gap-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            {t("catalog.title")}
          </h2>
          <p className="text-xs text-slate-400">{t("catalog.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenBulkImport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            {t("catalog.bulk_import")}
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950 transition"
          >
            <Plus className="w-4 h-4" />
            {t("catalog.add_product")}
          </button>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("catalog.search_placeholder")}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
        </div>

        <div className="md:col-span-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">{t("catalog.filter_all_categories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">{t("catalog.filter_all_brands")}</option>
            {brands.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">{t("catalog.col_sku")}</th>
              <th className="py-3 px-4">{t("catalog.col_product")}</th>
              <th className="py-3 px-4">{t("catalog.col_category")}</th>
              <th className="py-3 px-4">{t("catalog.col_brand")}</th>
              <th className="py-3 px-4">{t("catalog.col_barcode")}</th>
              <th className="py-3 px-4 text-right">{t("catalog.col_retail_price")}</th>
              <th className="py-3 px-4 text-right">{t("catalog.col_wholesale_price")}</th>
              <th className="py-3 px-4">{t("catalog.col_packaging")}</th>
              <th className="py-3 px-4 text-right">{t("catalog.col_actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-slate-500">
                  {t("catalog.no_products")}
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono text-emerald-400 font-medium">{p.sku}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{p.name}</div>
                    {p.nameUr && (
                      <div className="text-[11px] text-emerald-400/90 font-nastaliq mt-0.5" dir="rtl">
                        {p.nameUr}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{p.category}</td>
                  <td className="py-3 px-4 text-slate-400">{p.brand}</td>
                  <td className="py-3 px-4 font-mono">
                    {p.barcode ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        <Barcode className="w-3 h-3 text-slate-400" />
                        {p.barcode}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                    PKR {p.retailPrice.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    {p.wholesalePrice ? `PKR ${p.wholesalePrice.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {p.packagingUnit ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Layers className="w-3 h-3" />
                        {p.packagingUnit.name} (x{p.packagingUnit.factor})
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">{p.unit}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                        title="Edit Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info / Row Count */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Showing {filteredProducts.length} of {products.length} catalog items</span>
        <span className="font-mono">Sub-100ms Index Active</span>
      </div>

      {/* Add / Edit Product Modal */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveProduct}
        initialData={editingProduct}
        categories={categories}
        brands={brands}
        units={units}
      />
    </div>
  );
};
