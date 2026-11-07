import { formatPkr, formatQty, ReceiptData } from "../lib/api";

export function ReceiptView({
  receipt,
  id = "receipt-print",
  className = "",
}: {
  receipt: ReceiptData;
  id?: string;
  className?: string;
}) {
  const { sale, store } = receipt;
  const isEdited = (sale.revision ?? 0) > 0;

  return (
    <div
      id={id}
      className={`bg-white text-slate-900 rounded-xl border border-slate-200 p-4 font-mono text-xs ${className}`}
    >
      <div className="text-center mb-2">
        <div className="font-bold text-sm">{store?.name || "Next POS"}</div>
        {store?.name_ur && (
          <div dir="rtl" className="font-urdu">
            {store.name_ur}
          </div>
        )}
        {store?.address && <div>{store.address}</div>}
        {store?.phone && <div>Tel: {store.phone}</div>}
        {store?.ntn && <div>NTN: {store.ntn}</div>}
      </div>

      {isEdited && (
        <div className="text-center text-[11px] font-bold text-amber-800 bg-amber-100 rounded px-1 py-0.5 my-1">
          Edited rev {sale.revision}
          {sale.edited_at ? ` · ${new Date(sale.edited_at).toLocaleDateString()}` : ""}
        </div>
      )}

      <div className="flex justify-between border-t border-dashed border-slate-400 pt-1">
        <span>{sale.doc_no}</span>
        <span>{new Date(sale.created_at).toLocaleString()}</span>
      </div>
      {receipt.cashier && <div>Cashier: {receipt.cashier}</div>}
      {sale.customer_name && <div>Customer: {sale.customer_name}</div>}

      <div className="border-t border-dashed border-slate-400 my-1" />

      {sale.lines.map((l) => (
        <div key={l.id} className="mb-1">
          <div>{l.product_name}</div>
          <div className="flex justify-between">
            <span>
              {formatQty(l.qty_milli, l.unit_code)} × {formatPkr(l.unit_price_paisa)}
              {l.discount_paisa ? ` −${formatPkr(l.discount_paisa)}` : ""}
            </span>
            <span>{formatPkr(l.total_paisa)}</span>
          </div>
        </div>
      ))}

      <div className="border-t border-dashed border-slate-400 my-1" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatPkr(sale.subtotal_paisa)}</span>
      </div>
      {sale.discount_paisa > 0 && (
        <div className="flex justify-between">
          <span>Discount</span>
          <span>−{formatPkr(sale.discount_paisa)}</span>
        </div>
      )}
      {sale.tax_paisa > 0 && (
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatPkr(sale.tax_paisa)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL</span>
        <span>{formatPkr(sale.total_paisa)}</span>
      </div>

      {sale.tenders.map((t, i) => (
        <div key={i} className="flex justify-between capitalize">
          <span>{t.method === "credit" ? "Khata" : t.method}</span>
          <span>{formatPkr(t.amount_paisa)}</span>
        </div>
      ))}
      {sale.change_paisa > 0 && (
        <div className="flex justify-between font-bold">
          <span>Change</span>
          <span>{formatPkr(sale.change_paisa)}</span>
        </div>
      )}

      {receipt.trial_watermark && (
        <div className="text-center font-bold mt-2">*** TRIAL VERSION ***</div>
      )}
    </div>
  );
}
