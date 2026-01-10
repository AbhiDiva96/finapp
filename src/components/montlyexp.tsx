import { useEffect, useState } from "react";
import Swal from "sweetalert2";

const sheetUrl = import.meta.env.VITE_FINANCE_SHEET_URL;

type Row = {
  date: string;
  name: string;
  description: string;
  type: string;
  amount: string;
  balance?: number;
};

const empty: Row = {
  date: "",
  name: "",
  description: "",
  type: "OUT",
  amount: "",
};

export default function FinanceTracker() {
  const [form, setForm] = useState<Row>(empty);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 📥 Fetch data (LATEST ON TOP)
  const fetchData = async () => {
    if (!sheetUrl) return;

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
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ➕ Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sheetUrl) {
      Swal.fire("Config Error", "Sheet URL missing", "warning");
      return;
    }

    if (!form.date || !form.amount) {
      Swal.fire("Required", "Date & amount are required", "warning");
      return;
    }

    setSubmitting(true);

    try {
      const lastBalance = rows.length ? rows[0].balance || 0 : 0;
      let newBalance = lastBalance;

      if (form.type === "IN") newBalance += Number(form.amount);
      else if (form.type === "OUT") newBalance -= Number(form.amount);

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

    } catch {
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // 📤 Download Excel (CSV)
  const downloadExcel = () => {
    const headers = ["Date", "Name", "Description", "Type", "Amount", "Balance"];
    const csvRows = [
      headers.join(","),
      ...rows.map(r =>
        [
          r.date,
          r.name,
          r.description,
          r.type,
          r.amount,
          r.balance,
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

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="max-w-6xl mx-auto bg-white rounded-3xl shadow p-5 sm:p-6 md:p-8">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold">💰 Finance Tracker</h1>

          <button
            onClick={downloadExcel}
            className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-green-700 transition"
          >
            ⬇ Download Excel
          </button>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-5 mb-8"
        >
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />

          <input
            className="input"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            className="input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option>IN</option>
            <option>OUT</option>
            <option>INOUT</option>
          </select>

          <input
            type="number"
            className="input"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: e.target.value })
            }
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
                {["Date", "Name", "Description", "Type", "Amount", "Balance"].map(
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
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3 font-semibold">{r.type}</td>
                  <td className="px-4 py-3">₹{r.amount}</td>
                  <td className="px-4 py-3 font-bold text-blue-600">
                    ₹{r.balance}
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
