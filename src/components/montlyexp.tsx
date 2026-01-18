import { useEffect, useState } from "react";
import Swal from "sweetalert2";

const sheetUrl = import.meta.env.VITE_FINANCE_SHEET_URL;

type Row = {
  date: string;
  name: string;
  description: string;
  type: string;
  amount: number | string;
  balance?: number;
};

const empty: Row = {
  date: "",
  name: "",
  description: "",
  type: "OUT",
  amount: "",
};

const LS_KEY = "milkdiary_finance_rows_v1";

// format date for display: 18 Jan 2026
const formatDate = (d: any) => {
  if (!d && d !== 0) return "";
  const s = String(d);
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function MontlyExp() {
  const [form, setForm] = useState<Row>(empty);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // helper to persist to localStorage when sheetUrl is not configured
  const persistLocal = (data: Row[]) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore
    }
  };

  const loadLocal = (): Row[] => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  };

  // 📥 Fetch data (LATEST ON TOP)
  const fetchData = async () => {
    if (!sheetUrl) {
      const local = loadLocal();
      // calculate balances
      let bal = 0;
      const normalized = local.map((r: any) => {
        const amt = Number(r.amount) || 0;
        const type = (r.type || "").toUpperCase();
        if (type === "IN") bal += amt;
        else if (type === "OUT") bal -= amt;
        return { ...r, amount: amt, balance: bal };
      });
      setRows(normalized.reverse());
      return;
    }

    try {
      const res = await fetch(sheetUrl);
      const data = await res.json();

      let bal = 0;

      const normalized = data.map((r: any) => {
        const amt = Number(r.amount) || 0;
        const type = (r.type || "").toUpperCase();

        if (type === "IN") bal += amt;
        else if (type === "OUT") bal -= amt;

        return { ...r, amount: amt, balance: bal };
      });

      // 🔁 Latest first
      setRows(normalized.reverse());
    } catch (e) {
      // fallback to local
      const local = loadLocal();
      let bal = 0;
      const normalized = local.map((r: any) => {
        const amt = Number(r.amount) || 0;
        const type = (r.type || "").toUpperCase();
        if (type === "IN") bal += amt;
        else if (type === "OUT") bal -= amt;
        return { ...r, amount: amt, balance: bal };
      });
      setRows(normalized.reverse());
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ➕ Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.date || form.amount === "" || form.amount === 0) {
      Swal.fire("Required", "Date & amount are required", "warning");
      return;
    }

    setSubmitting(true);

    try {
      const lastBalance = rows.length ? rows[0].balance || 0 : 0;
      let newBalance = lastBalance;

      if (form.type === "IN") newBalance += Number(form.amount);
      else if (form.type === "OUT") newBalance -= Number(form.amount);

      const newRow: Row = {
        ...form,
        amount: Number(form.amount),
        balance: newBalance,
      };

      if (!sheetUrl) {
        // save locally
        const updated = [newRow, ...rows];
        // store in original chronological order for simpler calculation
        persistLocal(updated.slice().reverse());
        setRows(updated);
        Swal.fire("Saved", "Transaction added (local)", "success");
        setForm(empty);
        return;
      }

      const fd = new FormData();
      fd.append("date", form.date);
      fd.append("name", form.name);
      fd.append("description", form.description);
      fd.append("type", form.type);
      fd.append("amount", String(form.amount));
      fd.append("balance", String(newBalance));

      const resp = await fetch(sheetUrl, {
        method: "POST",
        body: fd,
      });

      if (!resp.ok) {
        Swal.fire("Error", "Failed to save data", "error");
        return;
      }

      Swal.fire("Saved", "Transaction added", "success");
      setForm(empty);
      fetchData();

    } catch (err) {
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // delete local row (only local storage delete)
  const handleDelete = (index: number) => {
    const r = rows[index];
    Swal.fire({
      title: 'Delete entry?',
      text: `${formatDate(r.date)} · ${r.description} · ₹${r.amount}`,
      icon: 'warning',
      showCancelButton: true,
    }).then((res) => {
      if (!res.isConfirmed) return;
      const updated = rows.slice(0, index).concat(rows.slice(index + 1));
      setRows(updated);
      persistLocal(updated.slice().reverse());
      Swal.fire('Deleted', 'Entry removed (local)', 'success');
    });
  };

  // 📤 Download CSV
  const downloadExcel = () => {
    const headers = ["Date", "Name", "Description", "Type", "Amount", "Balance"];
    const csvRows = [
      headers.join(","),
      ...rows.map(r =>
        [
          `"${String(formatDate(r.date)).replace(/"/g, '""')}",`.replace(/,$/, ''),
          `"${String(r.name || "").replace(/"/g, '""')}",`.replace(/,$/, ''),
          `"${String(r.description || "").replace(/"/g, '""')}",`.replace(/,$/, ''),
          `"${String(r.type).replace(/"/g, '""')}",`.replace(/,$/, ''),
          `${Number(r.amount)}`,
          `${Number(r.balance)}`,
        ].join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "finance-tracker.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // summaries
  const totalIn = rows.reduce((s, r) => s + (r.type === "IN" ? Number(r.amount) : 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.type === "OUT" ? Number(r.amount) : 0), 0);
  const currentBalance = rows.length ? rows[0].balance || 0 : 0;

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-6xl mx-auto bg-white rounded-3xl shadow p-5 sm:p-6 md:p-8">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold">💰 Monthly Expenses</h1>

          <div className="flex gap-3">
            <button
              onClick={downloadExcel}
              className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-green-700 transition"
            >
              ⬇ Download CSV
            </button>
          </div>
        </div>

        {/* SUMMARY - Polished ATM glass card */}
        <div className="mb-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/30 to-sky-900/22 backdrop-blur-2xl border border-white/12 p-4 sm:p-6 shadow-[0_10px_30px_rgba(2,6,23,0.6)] hover:shadow-[0_18px_50px_rgba(2,6,23,0.7)] transition-shadow">

            {/* soft decorative glow */}
            <div className="absolute -top-10 -right-16 w-56 h-56 bg-gradient-to-tr from-indigo-400/12 to-transparent rounded-full blur-3xl mix-blend-screen pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Left: branding + large balance */}
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">FinShop</div>
                    <div className="text-xs text-white/60 mt-1">Account Overview</div>
                  </div>
                  <div className="ml-3 p-2 bg-white/8 rounded-md flex items-center justify-center">
                    <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="4" width="26" height="12" rx="2" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.06)"/>
                      <rect x="5" y="7" width="6" height="6" rx="1" fill="rgba(255,255,255,0.18)"/>
                    </svg>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-white/70">Available Balance</div>
                  <div className="mt-1 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">₹{currentBalance}</div>
                </div>
              </div>

              {/* Right: three stat chips (horizontal scroll on mobile) */}
              <div className="flex-1 w-full">
                <div className="flex gap-3 sm:grid sm:grid-cols-3 sm:gap-4 overflow-x-auto py-2 sm:py-0">

                  <div className="min-w-[160px] sm:min-w-0 bg-white/6 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-green-400/10 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v20" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 12h14" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-xs text-white/80">Total Income</div>
                      <div className="text-lg font-semibold text-green-300">₹{totalIn}</div>
                    </div>
                  </div>

                  <div className="min-w-[160px] sm:min-w-0 bg-white/6 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-red-400/10 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22V2" stroke="#FB7185" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 12H5" stroke="#FB7185" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-xs text-white/80">Total Expense</div>
                      <div className="text-lg font-semibold text-red-300">₹{totalOut}</div>
                    </div>
                  </div>

                  <div className="min-w-[160px] sm:min-w-0 bg-white/6 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-blue-400/10 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 6v12" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10h12" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-xs text-white/80">Net</div>
                      <div className="text-lg font-semibold text-blue-200">₹{currentBalance}</div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* overlay */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-black/6 mix-blend-overlay" />
          </div>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-5 mb-8"
        >
          <input
            type="date"
            className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 sm:px-4 sm:py-3 text-sm sm:text-base text-black placeholder-gray-400 shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />

          <input
            className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 sm:px-4 sm:py-3 text-sm sm:text-base text-black placeholder-gray-400 shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 sm:px-4 sm:py-3 text-sm sm:text-base text-black placeholder-gray-400 shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <select
            className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 sm:px-4 sm:py-3 text-sm sm:text-base text-black placeholder-gray-400 shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option>IN</option>
            <option>OUT</option>
            <option>INOUT</option>
          </select>

          <input
            type="number"
            className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 sm:px-4 sm:py-3 text-sm sm:text-base text-black placeholder-gray-400 shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            placeholder="Amount"
            value={String(form.amount)}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />

          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white rounded-xl font-semibold
                       px-6 py-3 min-h-[48px]
                       hover:bg-blue-700 transition disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Add"}
          </button>
        </form>

        {/* TABLE */}
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-white">
              <tr>
                {["Date", "Name", "Description", "Type", "Amount", "Balance", "Actions"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3 font-semibold">{r.type}</td>
                  <td className="px-4 py-3">₹{r.amount}</td>
                  <td className="px-4 py-3 font-bold text-blue-600">₹{r.balance}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(i)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
