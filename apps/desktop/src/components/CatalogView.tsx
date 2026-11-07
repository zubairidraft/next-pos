import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Search,
  Plus,
  FileSpreadsheet,
  Barcode,
  Layers,
  Edit2,
  DollarSign,
  Package,
} from "lucide-react";
import { ProductFormModal, ProductFormData } from "./ProductFormModal";
import { api, errorText, formatPkr, ProductRow } from "../lib/api";
import { BarcodeLabelsModal } from "./BarcodeLabelsModal";
import { useToast } from "../lib/toast";
import { useSession } from "../context/SessionContext";
import { PRODUCT_COLUMNS, productRows, productsXlsx, reportCsv, saveFile } from "../lib/exporter";

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
  variantId: string;
  stock: number;
  row: ProductRow;
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
  const toast = useToast();
  const { can } = useSession();
  const [labelsFor, setLabelsFor] = useState<ProductRow | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [products, setProducts] = useState<CatalogItem[]>([]);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  const [units, setUnits] = useState<{ id: string; name: string; code: string }[]>([]);

  const loadData = async () => {
    try {
      const [dbProds, dbCats, dbBrands, dbUnits] = await Promise.all([
        api.searchProducts("", 500),
        api.listCategories(),
        api.listBrands(),
        api.listUnits(),
      ]);

      setCategories(dbCats.map((c) => ({ id: c.id, name: c.name })));
      setBrands(dbBrands.map((b) => ({ id: b.id, name: b.name })));
      setUnits(dbUnits.map((u) => ({ id: u.id, name: u.name, code: u.code })));
      {
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
          variantId: p.variant_id,
          stock: p.on_hand_milli / 1000,
          row: p,
        }));
        setProducts(mapped);
      }
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  // Focus scanner search bar on mount & load SQLite data
  useEffect(() => {
    searchInputRef.current?.focus();
    loadData();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFormModalOpen || labelsFor) return;
      if (document.activeElement === searchInputRef.current && e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      if (e.key === "F3") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if ((e.key === "F4" || (e.key === "Enter" && document.activeElement !== searchInputRef.current)) && selectedId) {
        if (can("PriceEdit")) {
          e.preventDefault();
          editProduct(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFormModalOpen, labelsFor, selectedId, can]);

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

  /** Creates a product. Returns false (and keeps the form open) when the backend refuses. */
  const handleSaveProduct = async (formData: ProductFormData): Promise<boolean> => {
    try {
      const baseUnit = units.find((u) => u.code.toLowerCase() === (formData.baseUnit || "pc").toLowerCase());
      if (!baseUnit) throw new Error("Pick a unit for this product");
      const packUnit = formData.hasPackagingUnit ? units.find((u) => u.code.toLowerCase() === formData.packUnit?.toLowerCase()) : undefined;
      if (formData.hasPackagingUnit && !packUnit) throw new Error("Pick a unit for the pack (e.g. carton)");
      await api.createProduct({
        sku: formData.sku.trim(),
        name: formData.name.trim(),
        name_ur: formData.nameUr?.trim() || null,
        category_id: formData.categoryId || null,
        brand_id: formData.brandId || null,
        base_unit_id: baseUnit.id,
        barcode: formData.barcode?.trim() || null,
        retail_price_paisa: Math.round(formData.retailPrice * 100),
        wholesale_price_paisa: formData.wholesalePrice ? Math.round(formData.wholesalePrice * 100) : null,
        reorder_level_milli: !formData.isService && formData.lowStockAlert ? Math.round(formData.lowStockAlert * 1000) : null,
        packaging_units: packUnit
          ? [{
              unit_id: packUnit.id,
              factor_to_base: (formData.packFactor || 24) * 1000,
              barcode: formData.packBarcode?.trim() || null,
              retail_price_paisa: formData.packRetailPrice ? Math.round(formData.packRetailPrice * 100) : null,
            }]
          : [],
      }, !!formData.isService);
      toast.success(`${formData.isService ? "Service" : "Product"} ${formData.name.trim()} saved`);
      await loadData();
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    }
  };

  /** All products in the import layout, so the file can be edited and imported back. */
  const exportProducts = async (fmt: "xlsx" | "csv") => {
    try {
      const rows = await productRows();
      const data = fmt === "xlsx" ? await productsXlsx(rows) : reportCsv(PRODUCT_COLUMNS, rows);
      const name = `Products ${new Date().toISOString().slice(0, 10)}.${fmt}`;
      const where = await saveFile(name, data, fmt === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
      toast.success(where ? `Saved: ${where}` : `${name} downloaded`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const editProduct = (id: string) => {
    setEditingProductId(id);
    setIsFormModalOpen(true);
  };

  /** Only the price can be changed quickly without opening full edit modal. */
  const changePrice = async (item: CatalogItem) => {
    const retail = await toast.prompt(`Retail price for ${item.name}`, `Price per ${item.unit} (Rs)`, { type: "number", initial: String(item.retailPrice) });
    if (retail === null) return;
    const wholesale = await toast.prompt(`Wholesale price for ${item.name}`, "Leave empty to keep it as it is (Rs)", { type: "number", initial: item.wholesalePrice ? String(item.wholesalePrice) : "" });
    if (wholesale === null) return;
    try {
      await api.updatePrice(item.variantId, Math.round((parseFloat(retail) || 0) * 100), wholesale.trim() ? Math.round((parseFloat(wholesale) || 0) * 100) : null);
      toast.success("Price updated");
      loadData();
    } catch (e) {
      toast.error(errorText(e));
    }
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

        {can("PriceEdit") && <div className="flex items-center gap-3">
          <button
            onClick={() => exportProducts("xlsx")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
          >
            <Download className="w-4 h-4 text-emerald-500" /> Export Excel
          </button>
          <button
            onClick={() => exportProducts("csv")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
          >
            <Download className="w-4 h-4 text-emerald-500" /> Export CSV
          </button>
          <button
            onClick={onOpenBulkImport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            {t("catalog.bulk_import") || "Bulk Import"}
          </button>
          <button
            onClick={() => setIsFormModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            {t("catalog.add_product") || "+ Add Product"}
          </button>
        </div>}
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
              filteredProducts.map((p) => {
                const isSelected = p.id === selectedId;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    onDoubleClick={() => can("PriceEdit") && editProduct(p.id)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
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
                      {formatPkr(Math.round(p.retailPrice * 100))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                      {p.wholesalePrice ? formatPkr(Math.round(p.wholesalePrice * 100)) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {p.packagingUnit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          <Layers className="w-3 h-3" />
                          {p.packagingUnit.name} (x{p.packagingUnit.factor})
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px] font-medium">{p.row.is_service ? "Service (no stock)" : `${p.stock} ${p.unit} in stock`}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLabelsFor(p.row);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition flex items-center gap-1"
                          title={p.barcode ? "Print barcode labels" : "Generate a barcode and print labels"}
                        >
                          <Barcode className="w-3.5 h-3.5" /> {p.barcode ? "Labels" : "Barcode"}
                        </button>
                        {can("PriceEdit") && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                editProduct(p.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Edit product details (F4 / Enter)"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                changePrice(p);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Change price"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info / Row Count */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Showing {filteredProducts.length} of {products.length} catalog items</span>
        <span />
      </div>

      <BarcodeLabelsModal
        isOpen={!!labelsFor}
        initial={labelsFor}
        onClose={() => {
          setLabelsFor(null);
          loadData();
        }}
      />

      {/* Add / Edit Product Modal */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        productId={editingProductId}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingProductId(null);
        }}
        onSaved={() => {
          setIsFormModalOpen(false);
          setEditingProductId(null);
          loadData();
        }}
        onSave={handleSaveProduct}
        initialData={null}
        categories={categories}
        brands={brands}
        units={units}
      />
    </div>
  );
};
