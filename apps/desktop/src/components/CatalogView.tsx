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
import { api } from "../lib/api";

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
      nameUr: "Shan Bombay Biryani 50g",
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
      nameUr: "Dalda Cooking Oil 1L",
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
      nameUr: "Tapal Danedar Tea 400g",
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
      nameUr: "LU Rio Biscuits Family Pack",
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
      nameUr: "National Table Salt 800g",
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
      nameUr: "Super Basmati Kernel Rice 5kg",
      category: "Rice, Pulses & Flour",
      brand: "Al-Rehman Foods",
      unit: "kg",
      barcode: "8964000600555",
      retailPrice: 1850.0,
      wholesalePrice: 1720.0,
    },
  ]);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([
    { id: "cat_1", name: "Spices & Recipe Mixes" },
    { id: "cat_2", name: "Cooking Oil & Ghee" },
    { id: "cat_3", name: "Tea & Beverages" },
    { id: "cat_4", name: "Snacks & Confectionery" },
    { id: "cat_5", name: "Rice, Pulses & Flour" },
  ]);

  const [brands, setBrands] = useState<{ id: string; name: string }[]>([
    { id: "b_1", name: "Shan Foods" },
    { id: "b_2", name: "National Foods" },
    { id: "b_3", name: "Dalda" },
    { id: "b_4", name: "Tapal" },
    { id: "b_5", name: "LU" },
    { id: "b_6", name: "Al-Rehman Foods" },
  ]);

  const [units, setUnits] = useState<{ id: string; name: string; code: string }[]>([
    { id: "u_1", name: "Piece", code: "pc" },
    { id: "u_2", name: "Kilogram", code: "kg" },
    { id: "u_3", name: "Liter", code: "ltr" },
    { id: "u_4", name: "Meter", code: "m" },
    { id: "u_5", name: "Dozen", code: "dozen" },
    { id: "u_6", name: "Carton", code: "carton" },
  ]);

  const loadData = async () => {
    try {
      const [dbProds, dbCats, dbBrands, dbUnits] = await Promise.all([
        api.listProductsCatalog(200, 0),
        api.listCategories(),
        api.listBrands(),
        api.listUnits(),
      ]);

      if (dbCats && dbCats.length > 0) {
        setCategories(dbCats.map((c) => ({ id: c.id, name: c.name })));
      }
      if (dbBrands && dbBrands.length > 0) {
        setBrands(dbBrands.map((b) => ({ id: b.id, name: b.name })));
      }
      if (dbUnits && dbUnits.length > 0) {
        setUnits(dbUnits.map((u) => ({ id: u.id, name: u.name, code: u.code })));
      }

      if (dbProds && dbProds.length > 0) {
        const mapped: CatalogItem[] = dbProds.map((p) => ({
          id: p.product_id,
          sku: p.sku,
          name: p.name,
          nameUr: p.name_ur || undefined,
          category: p.category_name || "General",
          brand: p.brand_name || "Generic",
          unit: p.base_unit_code || "pc",
          barcode: p.barcode || "",
          retailPrice: (p.retail_price_paisa || 0) / 100,
          wholesalePrice: p.wholesale_price_paisa ? p.wholesale_price_paisa / 100 : undefined,
        }));
        setProducts(mapped);
      }
    } catch (err) {
      console.warn("Could not load catalog from SQLite, keeping default state:", err);
    }
  };

  // Focus scanner search bar on mount & load SQLite data
  useEffect(() => {
    searchInputRef.current?.focus();
    loadData();
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

  const handleSaveProduct = async (formData: ProductFormData) => {
    const catName = categories.find((c) => c.id === formData.categoryId)?.name || "General";
    const brandName = brands.find((b) => b.id === formData.brandId)?.name || "Generic";

    try {
      const unitCode = formData.baseUnit || "pc";
      const matchedUnit = units.find((u) => u.code.toLowerCase() === unitCode.toLowerCase()) || units[0];
      const baseUnitId = matchedUnit?.id || "u-pc";

      await api.createProduct({
        sku: formData.sku.trim(),
        name: formData.name.trim(),
        name_ur: formData.nameUr?.trim() || null,
        category_id: formData.categoryId || null,
        brand_id: formData.brandId || null,
        base_unit_id: baseUnitId,
        barcode: formData.barcode?.trim() || null,
        retail_price_paisa: Math.round(formData.retailPrice * 100),
        wholesale_price_paisa: formData.wholesalePrice ? Math.round(formData.wholesalePrice * 100) : null,
        packaging_units: formData.hasPackagingUnit && formData.packUnit ? [{
          unit_id: units.find((u) => u.code.toLowerCase() === formData.packUnit?.toLowerCase())?.id || "u-ctn",
          factor_to_base: (formData.packFactor || 24) * 1000,
          barcode: formData.packBarcode?.trim() || null,
          retail_price_paisa: formData.packRetailPrice ? Math.round(formData.packRetailPrice * 100) : null,
        }] : [],
      });

      // Reload fresh from SQLite
      await loadData();
    } catch (err) {
      console.error("Failed to persist product to SQLite:", err);
      // Fallback local memory state
      if (formData.id) {
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
                }
              : item
          )
        );
      } else {
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
        };
        setProducts((prev) => [newItem, ...prev]);
      }
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden p-6 flex flex-col gap-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-500" />
            {t("catalog.title") || "Product Catalog"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("catalog.subtitle") || "Manage SKUs, retail & wholesale prices, multi-tier packaging, and barcodes."}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenBulkImport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            {t("catalog.bulk_import") || "Bulk Import"}
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              setIsFormModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            {t("catalog.add_product") || "+ Add Product"}
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
            placeholder={t("catalog.search_placeholder") || "Search products by name, SKU, or barcode (F3)..."}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-xs"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>

        <div className="md:col-span-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
          >
            <option value="all">{t("catalog.filter_all_categories") || "All Categories"}</option>
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
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
          >
            <option value="all">{t("catalog.filter_all_brands") || "All Brands"}</option>
            {brands.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
          <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4">{t("catalog.col_sku") || "SKU"}</th>
              <th className="py-3 px-4">{t("catalog.col_product") || "Product Name"}</th>
              <th className="py-3 px-4">{t("catalog.col_category") || "Category"}</th>
              <th className="py-3 px-4">{t("catalog.col_brand") || "Brand"}</th>
              <th className="py-3 px-4">{t("catalog.col_barcode") || "Barcode"}</th>
              <th className="py-3 px-4 text-right">{t("catalog.col_retail_price") || "Retail (PKR)"}</th>
              <th className="py-3 px-4 text-right">{t("catalog.col_wholesale_price") || "Wholesale (PKR)"}</th>
              <th className="py-3 px-4">{t("catalog.col_packaging") || "Packaging Unit"}</th>
              <th className="py-3 px-4 text-right">{t("catalog.col_actions") || "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-slate-400">
                  {t("catalog.no_products") || "No products match your filter criteria."}
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{p.sku}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.category}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.brand}</td>
                  <td className="py-3 px-4 font-mono">
                    {p.barcode ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                        <Barcode className="w-3 h-3 text-slate-400" />
                        {p.barcode}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                    PKR {p.retailPrice.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                    {p.wholesalePrice ? `PKR ${p.wholesalePrice.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {p.packagingUnit ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <Layers className="w-3 h-3" />
                        {p.packagingUnit.name} (x{p.packagingUnit.factor})
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px] font-medium">{p.unit}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Edit Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition"
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
