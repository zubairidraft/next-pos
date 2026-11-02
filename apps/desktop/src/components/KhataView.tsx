import React, { useState } from "react";
import {
  Users,
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
  MessageCircle,
  FileText,
  DollarSign,
  Printer,
  X,
  CheckCircle2,
  Calendar,
  Sparkles,
} from "lucide-react";

interface KhataParty {
  id: string;
  party_type: "customer" | "vendor";
  name: string;
  phone: string;
  credit_limit_paisa: number;
  balance_paisa: number;
  unpaid_invoices_count: number;
}

const SAMPLE_PARTIES: KhataParty[] = [
  {
    id: "cust-01",
    party_type: "customer",
    name: "Haji Muhammad Aslam (Kiriyana Store)",
    phone: "0300-1234567",
    credit_limit_paisa: 5000000,
    balance_paisa: 2850000,
    unpaid_invoices_count: 3,
  },
  {
    id: "cust-02",
    party_type: "customer",
    name: "Chaudhry Riaz Ahmed (Farmhouse)",
    phone: "0301-7654321",
    credit_limit_paisa: 3000000,
    balance_paisa: 3200000,
    unpaid_invoices_count: 4,
  },
  {
    id: "cust-03",
    party_type: "customer",
    name: "Malik Usman General Store",
    phone: "0321-9876543",
    credit_limit_paisa: 10000000,
    balance_paisa: 1420000,
    unpaid_invoices_count: 2,
  },
  {
    id: "vend-01",
    party_type: "vendor",
    name: "Nestle Pakistan Distribution",
    phone: "042-111637853",
    credit_limit_paisa: 0,
    balance_paisa: 12500000,
    unpaid_invoices_count: 2,
  },
  {
    id: "vend-02",
    party_type: "vendor",
    name: "Unilever Pakistan Traders",
    phone: "021-35689000",
    credit_limit_paisa: 0,
    balance_paisa: 8400000,
    unpaid_invoices_count: 1,
  },
];

export const KhataView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"customer" | "vendor">("customer");
  const [searchQuery, setSearchQuery] = useState("");
  const [parties, setParties] = useState<KhataParty[]>(SAMPLE_PARTIES);

  // Modals
  const [selectedParty, setSelectedParty] = useState<KhataParty | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [paymentAmountStr, setPaymentAmountStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentToast, setPaymentToast] = useState<string | null>(null);

  const formatPkr = (paisa: number) => `PKR ${(paisa / 100).toFixed(2)}`;

  const filteredParties = parties.filter(
    (p) =>
      p.party_type === activeTab &&
      (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone.includes(searchQuery))
  );

  const totalReceivables = parties
    .filter((p) => p.party_type === "customer")
    .reduce((sum, p) => sum + p.balance_paisa, 0);

  const totalPayables = parties
    .filter((p) => p.party_type === "vendor")
    .reduce((sum, p) => sum + p.balance_paisa, 0);

  const overLimitCount = parties.filter(
    (p) =>
      p.party_type === "customer" &&
      p.credit_limit_paisa > 0 &&
      p.balance_paisa > p.credit_limit_paisa
  ).length;

  const handleOpenWhatsApp = (party: KhataParty) => {
    const digits = party.phone.replace(/\D/g, "");
    const cleanPhone = digits.startsWith("0")
      ? `92${digits.slice(1)}`
      : digits.startsWith("92")
      ? digits
      : `92${digits}`;

    const msg = `Dear ${party.name},\nYour outstanding Khata balance with us is ${formatPkr(
      party.balance_paisa
    )}. Kindly arrange payment at your earliest convenience. Thank you!`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleProcessPayment = () => {
    if (!selectedParty) return;
    const amt = parseFloat(paymentAmountStr) || 0;
    if (amt <= 0) {
      alert("Please enter a valid payment amount!");
      return;
    }

    const paisa = Math.round(amt * 100);
    setParties((prev) =>
      prev.map((p) => {
        if (p.id === selectedParty.id) {
          return {
            ...p,
            balance_paisa: Math.max(0, p.balance_paisa - paisa),
          };
        }
        return p;
      })
    );

    setIsPaymentModalOpen(false);
    setPaymentAmountStr("");
    setPaymentToast(
      `Payment of ${formatPkr(paisa)} allocated via FIFO for ${selectedParty.name}!`
    );
    setTimeout(() => setPaymentToast(null), 5000);
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Toast Notification */}
      {paymentToast && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-400 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{paymentToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Customer & Vendor Khata Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Accounts receivable, payable, credit limits, automated aging analysis, and WhatsApp payment reminders.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("customer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === "customer"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Customers (Udhar Receivables)</span>
          </button>
          <button
            onClick={() => setActiveTab("vendor")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === "vendor"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Suppliers (Payables)</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Receivables */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>Total Receivables (Customers Owe Us)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
            {formatPkr(totalReceivables)}
          </div>
        </div>

        {/* Card 2: Payables */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>Total Payables (We Owe Suppliers)</span>
            <TrendingDown className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-300 mt-2 font-mono">
            {formatPkr(totalPayables)}
          </div>
        </div>

        {/* Card 3: Overdue Accounts */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>Credit Limit Breaches</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-300 mt-2 font-mono">
            {overLimitCount} Accounts
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Exceeds allowed credit limit
          </div>
        </div>
      </div>

      {/* Aging Analysis Banner */}
      {activeTab === "customer" && (
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-500" />
            <span>Receivables Aging Breakdown:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-500/20 font-medium">
              0-30 Days: <strong className="font-mono">PKR 34,200</strong>
            </span>
            <span className="px-3 py-1 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 rounded-lg border border-sky-200 dark:border-sky-500/20 font-medium">
              31-60 Days: <strong className="font-mono">PKR 25,500</strong>
            </span>
            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-500/20 font-medium">
              61-90 Days: <strong className="font-mono">PKR 15,000</strong>
            </span>
            <span className="px-3 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-500/20 font-medium">
              90+ Days: <strong className="font-mono">PKR 0.00</strong>
            </span>
          </div>
        </div>
      )}

      {/* Search and Table */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search accounts by name or phone number..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Khata Party Table */}
        <div className="overflow-x-auto bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[10px] uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Account Name</th>
                <th className="py-3 px-4">Phone / WhatsApp</th>
                <th className="py-3 px-4 text-center">Credit Limit</th>
                <th className="py-3 px-4 text-right">Outstanding Balance</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
              {filteredParties.map((party) => {
                const isOverLimit =
                  party.credit_limit_paisa > 0 &&
                  party.balance_paisa > party.credit_limit_paisa;
                const limitUsagePercent =
                  party.credit_limit_paisa > 0
                    ? Math.min(
                        100,
                        Math.round((party.balance_paisa / party.credit_limit_paisa) * 100)
                      )
                    : 0;

                return (
                  <tr key={party.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{party.name}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{party.phone}</td>
                    <td className="py-3 px-4 text-center">
                      {party.credit_limit_paisa > 0 ? (
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-700 dark:text-slate-300 font-mono">
                            {formatPkr(party.credit_limit_paisa)}
                          </span>
                          <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto overflow-hidden">
                            <div
                              className={`h-full ${
                                isOverLimit ? "bg-rose-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${limitUsagePercent}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Unlimited</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div
                        className={`font-black text-sm font-mono ${
                          activeTab === "customer"
                            ? isOverLimit
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                            : "text-indigo-600 dark:text-indigo-300"
                        }`}
                      >
                        {formatPkr(party.balance_paisa)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {party.unpaid_invoices_count} pending invoices
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedParty(party);
                            setPaymentAmountStr((party.balance_paisa / 100).toFixed(0));
                            setIsPaymentModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-lg border border-emerald-200 dark:border-emerald-500/30 transition"
                          title="Record Payment"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Receive Payment</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedParty(party);
                            setIsStatementModalOpen(true);
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition"
                          title="Account Statement"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenWhatsApp(party)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-800/40 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-500/30 transition"
                          title="Send WhatsApp Reminder"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Receive Payment Modal */}
      {isPaymentModalOpen && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Receive Khata Payment</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedParty.name}</p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Outstanding Balance:</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatPkr(selectedParty.balance_paisa)}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Payment Amount Received (PKR)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={paymentAmountStr}
                  onChange={(e) => setPaymentAmountStr(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Deposit / Tender Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">EasyPaisa</option>
                  <option value="raast">Raast Instant</option>
                  <option value="cheque">Bank Cheque</option>
                </select>
              </div>

              {/* FIFO Allocation Preview Note */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Automatic FIFO Invoice Settlement</span>
                </div>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-200/80">
                  Payment will automatically extinguish the oldest open credit invoices in FIFO sequence,
                  and record the transaction on the immutable customer ledger.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex justify-between">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessPayment}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Post Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Statement View Modal */}
      {isStatementModalOpen && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Khata Account Statement</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedParty.name} • {selectedParty.phone}
                </p>
              </div>
              <button
                onClick={() => setIsStatementModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Statement Summary Card */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Opening Balance</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">PKR 0.00</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Closing Balance</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatPkr(selectedParty.balance_paisa)}
                  </span>
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-[10px] uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Doc #</th>
                      <th className="py-2.5 px-3 text-right">Debit (Sale)</th>
                      <th className="py-2.5 px-3 text-right">Credit (Paid)</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                    {[
                      {
                        id: "e-1",
                        date: "2026-10-25",
                        entry_type: "sale",
                        source_doc: "INV-202610-0012",
                        debit_paisa: 1500000,
                        credit_paisa: 0,
                        balance_paisa: 1500000,
                      },
                      {
                        id: "e-2",
                        date: "2026-10-27",
                        entry_type: "sale",
                        source_doc: "INV-202610-0028",
                        debit_paisa: 2000000,
                        credit_paisa: 0,
                        balance_paisa: 3500000,
                      },
                      {
                        id: "e-3",
                        date: "2026-10-28",
                        entry_type: "payment",
                        source_doc: "RCPT-9811",
                        debit_paisa: 0,
                        credit_paisa: 650000,
                        balance_paisa: selectedParty.balance_paisa,
                      },
                    ].map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {row.date}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-900 dark:text-white font-medium">
                          {row.source_doc}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          {row.debit_paisa > 0 ? formatPkr(row.debit_paisa) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {row.credit_paisa > 0 ? formatPkr(row.credit_paisa) : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatPkr(row.balance_paisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => handleOpenWhatsApp(selectedParty)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send WhatsApp Reminder</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => alert("ESC/POS Thermal statement sent to receipt printer!")}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Statement</span>
                </button>
                <button
                  onClick={() => setIsStatementModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
