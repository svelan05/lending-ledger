const KEY = "ledger-lending-v1";

const defaultState = () => ({
  businessName: "My Lending",
  borrowers: [],
  loans: [],
  payments: [],
  expenses: [],
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function inr(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}
function inrExact(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function monthsBetween(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}
function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function borrowerName(id) {
  return state.borrowers.find((b) => b.id === id)?.name || "Unknown";
}

function loanMath(loan) {
  const principal = Number(loan.principal) || 0;
  const rate = Number(loan.rate) || 0;
  const tenure = Number(loan.tenure) || 1;
  const paid = state.payments.filter((p) => p.loanId === loan.id);
  const principalPaid = paid.reduce((s, p) => s + (Number(p.principal) || 0), 0);
  const interestPaid = paid.reduce((s, p) => s + (Number(p.interest) || 0), 0);
  const outstanding = Math.max(0, principal - principalPaid);
  const monthlyRate = rate / 100;

  let installment = 0;
  let totalInterest = 0;
  let interestDue = 0;

  if (loan.product === "emi") {
    const r = monthlyRate;
    if (r === 0) installment = principal / tenure;
    else installment = (principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
    totalInterest = installment * tenure - principal;
    const elapsed = Math.min(tenure, monthsBetween(loan.startDate, today()) + (loan.status === "closed" ? 0 : 1));
    interestDue = Math.max(0, installment * Math.min(elapsed, tenure) - principalPaid - interestPaid);
  } else if (loan.product === "flat") {
    totalInterest = principal * monthlyRate * tenure;
    installment = (principal + totalInterest) / tenure;
    const elapsed = Math.min(tenure, monthsBetween(loan.startDate, today()) + 1);
    const expected = installment * elapsed;
    interestDue = Math.max(0, expected - principalPaid - interestPaid);
  } else {
    // interest-only monthly, principal at end
    installment = principal * monthlyRate;
    const elapsed = monthsBetween(loan.startDate, today());
    const dueMonths = loan.status === "closed" ? 0 : elapsed;
    interestDue = Math.max(0, installment * dueMonths - interestPaid);
    totalInterest = installment * tenure;
  }

  const nextDue = loan.status === "closed" ? null : addMonths(loan.startDate, monthsBetween(loan.startDate, today()) + 1);
  const overdue = loan.status !== "closed" && nextDue && nextDue < today() && (outstanding > 1 || interestDue > 1);
  return { principal, principalPaid, interestPaid, outstanding, installment, totalInterest, interestDue, nextDue, overdue };
}

function totals() {
  let outstanding = 0, interestEarned = 0, principalOut = 0, overdueCount = 0;
  state.loans.forEach((l) => {
    const m = loanMath(l);
    if (l.status !== "closed") {
      outstanding += m.outstanding;
      if (m.overdue || m.interestDue > 1) overdueCount += 1;
    }
    interestEarned += m.interestPaid;
    principalOut += l.status === "closed" ? 0 : m.outstanding;
  });
  const expenseTotal = state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const month = today().slice(0, 7);
  const interestMonth = state.payments
    .filter((p) => (p.date || "").startsWith(month))
    .reduce((s, p) => s + (Number(p.interest) || 0), 0);
  const expenseMonth = state.expenses
    .filter((e) => (e.date || "").startsWith(month))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { outstanding, interestEarned, expenseTotal, net: interestEarned - expenseTotal, overdueCount, interestMonth, expenseMonth };
}

const titles = {
  dashboard: ["Dashboard", "Portfolio, collections, and costs"],
  borrowers: ["Borrowers", "People you lend to"],
  loans: ["Loans", "Disbursed money and balances"],
  collect: ["Collect", "Record a repayment"],
  expenses: ["Expenses", "Costs of running the business"],
  reports: ["Reports", "Income versus expenses"],
};

function setView(name) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.getElementById("viewTitle").textContent = titles[name][0];
  document.getElementById("viewSub").textContent = titles[name][1];
  const root = document.getElementById("view");
  root.innerHTML = views[name]();
  bindView(name);
}

const views = {
  dashboard() {
    const t = totals();
    const open = state.loans.filter((l) => l.status !== "closed");
    const due = open
      .map((l) => ({ l, m: loanMath(l) }))
      .filter((x) => x.m.interestDue > 1 || x.m.overdue)
      .sort((a, b) => (a.m.nextDue || "").localeCompare(b.m.nextDue || ""));
    return `
      <div class="cards">
        <div class="card"><div class="label">Outstanding principal</div><div class="value">${inr(t.outstanding)}</div><div class="sub">${open.length} open loans</div></div>
        <div class="card"><div class="label">Interest collected</div><div class="value">${inr(t.interestEarned)}</div><div class="sub">This month ${inr(t.interestMonth)}</div></div>
        <div class="card"><div class="label">Expenses</div><div class="value">${inr(t.expenseTotal)}</div><div class="sub">This month ${inr(t.expenseMonth)}</div></div>
        <div class="card"><div class="label">Net (interest − expenses)</div><div class="value">${inr(t.net)}</div><div class="sub">${t.overdueCount} accounts need follow-up</div></div>
      </div>
      <div class="panel">
        <div class="toolbar"><strong>Follow-up</strong><button class="primary" data-go="collect">Record collection</button></div>
        ${due.length ? `<table><thead><tr><th>Borrower</th><th>Due interest</th><th>Outstanding</th><th>Next date</th></tr></thead><tbody>
          ${due.slice(0, 8).map(({ l, m }) => `<tr><td>${esc(borrowerName(l.borrowerId))}</td><td>${inrExact(m.interestDue)}</td><td>${inr(m.outstanding)}</td><td>${fmtDate(m.nextDue)}</td></tr>`).join("")}
        </tbody></table>` : `<div class="empty">No overdue interest right now.</div>`}
      </div>`;
  },
  borrowers() {
    return `
      <div class="toolbar">
        <input class="search" id="q" placeholder="Search name or phone" />
        <button class="primary" id="addBorrower">Add borrower</button>
      </div>
      <div class="panel" id="borrowerTable"></div>`;
  },
  loans() {
    const opts = state.borrowers.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("");
    return `
      <div class="toolbar">
        <select id="loanFilter"><option value="open">Open</option><option value="closed">Closed</option><option value="all">All</option></select>
        <button class="primary" id="addLoan" ${state.borrowers.length ? "" : "disabled"}>New loan</button>
      </div>
      ${state.borrowers.length ? "" : `<div class="empty">Add a borrower before creating a loan.</div>`}
      <div class="panel" id="loanTable"></div>`;
  },
  collect() {
    const open = state.loans.filter((l) => l.status !== "closed");
    if (!open.length) return `<div class="panel empty">No open loans. Disburse a loan first.</div>`;
    return `
      <div class="split">
        <div class="panel">
          <div class="field"><label>Loan</label>
            <select id="collectLoan">${open.map((l) => `<option value="${l.id}">${esc(borrowerName(l.borrowerId))} · ${inr(l.principal)} · ${fmtDate(l.startDate)}</option>`).join("")}</select>
          </div>
          <div id="collectInfo"></div>
          <div class="grid2">
            <div class="field"><label>Date</label><input type="date" id="payDate" value="${today()}" /></div>
            <div class="field"><label>Amount received</label><input type="number" id="payAmount" min="0" step="0.01" placeholder="0" /></div>
          </div>
          <div class="field"><label>Apply to</label>
            <select id="payApply">
              <option value="interest-first">Interest first, then principal</option>
              <option value="principal">Principal only</option>
              <option value="interest">Interest only</option>
            </select>
          </div>
          <div class="field"><label>Note</label><input id="payNote" placeholder="Cash / UPI / receipt no." /></div>
          <button class="primary" id="savePay">Save collection</button>
        </div>
        <div class="panel" id="recentPays"></div>
      </div>`;
  },
  expenses() {
    return `
      <div class="toolbar"><strong>All expenses</strong><button class="primary" id="addExpense">Add expense</button></div>
      <div class="panel" id="expenseTable"></div>`;
  },
  reports() {
    const t = totals();
    const byCat = {};
    state.expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    return `
      <div class="cards">
        <div class="card"><div class="label">Interest income</div><div class="value">${inr(t.interestEarned)}</div></div>
        <div class="card"><div class="label">Expenses</div><div class="value">${inr(t.expenseTotal)}</div></div>
        <div class="card"><div class="label">Net</div><div class="value">${inr(t.net)}</div></div>
        <div class="card"><div class="label">Capital still out</div><div class="value">${inr(t.outstanding)}</div></div>
      </div>
      <div class="panel">
        <div class="toolbar"><strong>Expenses by category</strong><button class="ghost" onclick="window.print()" style="background:#efe8d8;color:#1c1915">Print</button></div>
        ${cats.length ? `<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>
          ${cats.map(([c, a]) => `<tr><td>${esc(c)}</td><td>${inrExact(a)}</td></tr>`).join("")}
        </tbody></table>` : `<div class="empty">No expenses yet.</div>`}
      </div>
      <div class="panel">
        <strong>Loan book</strong>
        <table><thead><tr><th>Borrower</th><th>Product</th><th>Principal</th><th>Outstanding</th><th>Interest collected</th><th>Status</th></tr></thead><tbody>
          ${state.loans.map((l) => {
            const m = loanMath(l);
            return `<tr><td>${esc(borrowerName(l.borrowerId))}</td><td>${productLabel(l.product)}</td><td>${inr(l.principal)}</td><td>${inr(m.outstanding)}</td><td>${inr(m.interestPaid)}</td><td>${l.status}</td></tr>`;
          }).join("") || `<tr><td colspan="6">No loans</td></tr>`}
        </tbody></table>
      </div>`;
  },
};

function productLabel(p) {
  return { emi: "Reducing EMI", flat: "Flat installment", interest: "Monthly interest" }[p] || p;
}

function bindView(name) {
  if (name === "borrowers") {
    const draw = () => {
      const q = (document.getElementById("q").value || "").toLowerCase();
      const rows = state.borrowers.filter((b) => `${b.name} ${b.phone}`.toLowerCase().includes(q));
      document.getElementById("borrowerTable").innerHTML = rows.length
        ? `<table><thead><tr><th>Name</th><th>Phone</th><th>Place</th><th>Open loans</th><th></th></tr></thead><tbody>
          ${rows.map((b) => {
            const n = state.loans.filter((l) => l.borrowerId === b.id && l.status !== "closed").length;
            return `<tr><td>${esc(b.name)}</td><td>${esc(b.phone || "—")}</td><td>${esc(b.place || "—")}</td><td>${n}</td>
              <td><button class="linkish" data-edit-b="${b.id}">Edit</button><button class="linkish danger" data-del-b="${b.id}">Delete</button></td></tr>`;
          }).join("")}
        </tbody></table>`
        : `<div class="empty">No borrowers yet.</div>`;
    };
    document.getElementById("q").oninput = draw;
    document.getElementById("addBorrower").onclick = () => borrowerForm();
    document.getElementById("borrowerTable").onclick = (e) => {
      const id = e.target.dataset.editB || e.target.dataset.delB;
      if (e.target.dataset.editB) borrowerForm(state.borrowers.find((b) => b.id === id));
      if (e.target.dataset.delB) {
        if (state.loans.some((l) => l.borrowerId === id)) return alert("This borrower has loans. Close or delete those first.");
        if (confirm("Delete borrower?")) {
          state.borrowers = state.borrowers.filter((b) => b.id !== id);
          save(); draw();
        }
      }
    };
    draw();
  }
  if (name === "loans") {
    const draw = () => {
      const f = document.getElementById("loanFilter").value;
      const rows = state.loans.filter((l) => f === "all" || (f === "open" ? l.status !== "closed" : l.status === "closed"));
      document.getElementById("loanTable").innerHTML = rows.length
        ? `<table><thead><tr><th>Borrower</th><th>Product</th><th>Rate</th><th>Principal</th><th>Installment</th><th>Outstanding</th><th>Status</th><th></th></tr></thead><tbody>
          ${rows.map((l) => {
            const m = loanMath(l);
            return `<tr>
              <td>${esc(borrowerName(l.borrowerId))}<div class="sub" style="color:#6f675c">${fmtDate(l.startDate)} · ${l.tenure} mo</div></td>
              <td>${productLabel(l.product)}</td>
              <td>${l.rate}% / mo</td>
              <td>${inr(l.principal)}</td>
              <td>${inrExact(m.installment)}</td>
              <td>${inr(m.outstanding)}</td>
              <td><span class="pill ${l.status === "closed" ? "ok" : m.overdue ? "bad" : "warn"}">${l.status}</span></td>
              <td><button class="linkish" data-close="${l.id}">${l.status === "closed" ? "Reopen" : "Close"}</button>
                  <button class="linkish danger" data-del-l="${l.id}">Delete</button></td>
            </tr>`;
          }).join("")}
        </tbody></table>`
        : `<div class="empty">No loans in this filter.</div>`;
    };
    document.getElementById("loanFilter").onchange = draw;
    const add = document.getElementById("addLoan");
    if (add) add.onclick = () => loanForm();
    document.getElementById("loanTable").onclick = (e) => {
      if (e.target.dataset.close) {
        const l = state.loans.find((x) => x.id === e.target.dataset.close);
        l.status = l.status === "closed" ? "open" : "closed";
        save(); draw();
      }
      if (e.target.dataset.delL) {
        const id = e.target.dataset.delL;
        if (!confirm("Delete this loan and its collections?")) return;
        state.loans = state.loans.filter((l) => l.id !== id);
        state.payments = state.payments.filter((p) => p.loanId !== id);
        save(); draw();
      }
    };
    draw();
  }
  if (name === "collect") {
    const info = () => {
      const l = state.loans.find((x) => x.id === document.getElementById("collectLoan").value);
      if (!l) return;
      const m = loanMath(l);
      document.getElementById("collectInfo").innerHTML = `
        <p>Installment about <strong>${inrExact(m.installment)}</strong> · Outstanding <strong>${inr(m.outstanding)}</strong> · Interest still due <strong>${inrExact(m.interestDue)}</strong></p>`;
      document.getElementById("recentPays").innerHTML = `<strong>Recent on this loan</strong>` + recentFor(l.id);
    };
    document.getElementById("collectLoan").onchange = info;
    document.getElementById("savePay").onclick = () => {
      const loanId = document.getElementById("collectLoan").value;
      const amount = Number(document.getElementById("payAmount").value);
      if (!amount || amount <= 0) return alert("Enter an amount.");
      const apply = document.getElementById("payApply").value;
      const l = state.loans.find((x) => x.id === loanId);
      const m = loanMath(l);
      let interest = 0, principal = 0;
      if (apply === "interest") interest = amount;
      else if (apply === "principal") principal = amount;
      else {
        interest = Math.min(amount, Math.max(m.interestDue, 0));
        principal = amount - interest;
      }
      principal = Math.min(principal, m.outstanding);
      const leftover = amount - interest - principal;
      interest += leftover;
      state.payments.push({
        id: uid(), loanId, date: document.getElementById("payDate").value || today(),
        amount, interest, principal, note: document.getElementById("payNote").value.trim(),
      });
      const after = loanMath(l);
      if (after.outstanding <= 1 && l.product !== "interest") l.status = "closed";
      save();
      document.getElementById("payAmount").value = "";
      document.getElementById("payNote").value = "";
      info();
    };
    info();
  }
  if (name === "expenses") {
    const draw = () => {
      const rows = [...state.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      document.getElementById("expenseTable").innerHTML = rows.length
        ? `<table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th><th></th></tr></thead><tbody>
          ${rows.map((e) => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.note || "")}</td><td>${inrExact(e.amount)}</td>
            <td><button class="linkish danger" data-del-e="${e.id}">Delete</button></td></tr>`).join("")}
        </tbody></table>`
        : `<div class="empty">No expenses yet.</div>`;
    };
    document.getElementById("addExpense").onclick = () => expenseForm();
    document.getElementById("expenseTable").onclick = (e) => {
      if (!e.target.dataset.delE) return;
      state.expenses = state.expenses.filter((x) => x.id !== e.target.dataset.delE);
      save(); draw();
    };
    draw();
  }
  document.querySelectorAll("[data-go]").forEach((b) => { b.onclick = () => setView(b.dataset.go); });
}

function recentFor(loanId) {
  const rows = state.payments.filter((p) => p.loanId === loanId).slice(-6).reverse();
  if (!rows.length) return `<div class="empty">No collections yet.</div>`;
  return `<table><tbody>${rows.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${inrExact(p.amount)}</td><td>${esc(p.note || "")}</td></tr>`).join("")}</tbody></table>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[c]));
}

const modal = document.getElementById("modal");
function openModal(title, html, onSave) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = html;
  modal.showModal();
  document.getElementById("modalForm").onsubmit = (e) => {
    e.preventDefault();
    onSave();
    modal.close();
  };
}
document.getElementById("modalCancel").onclick = () => modal.close();

function borrowerForm(existing) {
  openModal(existing ? "Edit borrower" : "Add borrower", `
    <div class="field"><label>Name</label><input id="fName" required value="${esc(existing?.name || "")}" /></div>
    <div class="grid2">
      <div class="field"><label>Phone</label><input id="fPhone" value="${esc(existing?.phone || "")}" /></div>
      <div class="field"><label>Place</label><input id="fPlace" value="${esc(existing?.place || "")}" /></div>
    </div>
    <div class="field"><label>Notes</label><textarea id="fNotes">${esc(existing?.notes || "")}</textarea></div>
  `, () => {
    const rec = {
      id: existing?.id || uid(),
      name: document.getElementById("fName").value.trim(),
      phone: document.getElementById("fPhone").value.trim(),
      place: document.getElementById("fPlace").value.trim(),
      notes: document.getElementById("fNotes").value.trim(),
    };
    if (!rec.name) return;
    if (existing) state.borrowers = state.borrowers.map((b) => b.id === rec.id ? rec : b);
    else state.borrowers.push(rec);
    save(); setView("borrowers");
  });
}

function loanForm() {
  openModal("New loan", `
    <div class="field"><label>Borrower</label>
      <select id="fBorrower">${state.borrowers.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select>
    </div>
    <div class="grid2">
      <div class="field"><label>Principal (₹)</label><input id="fPrincipal" type="number" min="1" required /></div>
      <div class="field"><label>Interest % per month</label><input id="fRate" type="number" min="0" step="0.01" value="2" required /></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Start date</label><input id="fStart" type="date" value="${today()}" required /></div>
      <div class="field"><label>Tenure (months)</label><input id="fTenure" type="number" min="1" value="12" required /></div>
    </div>
    <div class="field"><label>Product</label>
      <select id="fProduct">
        <option value="flat">Flat installment — interest on full principal, equal payments</option>
        <option value="emi">Reducing EMI — interest on remaining principal</option>
        <option value="interest">Monthly interest only — principal repaid at the end</option>
      </select>
    </div>
    <div class="field"><label>Note</label><input id="fNote" placeholder="Cheque no., purpose" /></div>
  `, () => {
    const rec = {
      id: uid(),
      borrowerId: document.getElementById("fBorrower").value,
      principal: Number(document.getElementById("fPrincipal").value),
      rate: Number(document.getElementById("fRate").value),
      startDate: document.getElementById("fStart").value,
      tenure: Number(document.getElementById("fTenure").value),
      product: document.getElementById("fProduct").value,
      note: document.getElementById("fNote").value.trim(),
      status: "open",
    };
    if (!rec.principal) return;
    state.loans.push(rec);
    save(); setView("loans");
  });
}

function expenseForm() {
  openModal("Add expense", `
    <div class="grid2">
      <div class="field"><label>Date</label><input id="fDate" type="date" value="${today()}" required /></div>
      <div class="field"><label>Amount (₹)</label><input id="fAmount" type="number" min="0" step="0.01" required /></div>
    </div>
    <div class="field"><label>Category</label>
      <select id="fCat">
        <option>Travel</option><option>Office</option><option>Salary</option><option>Phone / data</option>
        <option>Rent</option><option>Bank charges</option><option>Other</option>
      </select>
    </div>
    <div class="field"><label>Note</label><input id="fNote" /></div>
  `, () => {
    const amount = Number(document.getElementById("fAmount").value);
    if (!amount) return;
    state.expenses.push({
      id: uid(),
      date: document.getElementById("fDate").value,
      amount,
      category: document.getElementById("fCat").value,
      note: document.getElementById("fNote").value.trim(),
    });
    save(); setView("expenses");
  });
}

document.querySelectorAll("nav button").forEach((b) => { b.onclick = () => setView(b.dataset.view); });
document.getElementById("bizName").value = state.businessName || "";
document.getElementById("bizName").onchange = (e) => { state.businessName = e.target.value.trim(); save(); };

document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ledger-backup-${today()}.json`;
  a.click();
};
document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();
document.getElementById("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.borrowers || !data.loans) return alert("This file is not a Ledger backup.");
  if (!confirm("Replace all data in this browser with the backup?")) return;
  state = { ...defaultState(), ...data };
  save();
  document.getElementById("bizName").value = state.businessName || "";
  setView("dashboard");
};

setView("dashboard");
