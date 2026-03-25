import { useState, useCallback } from "react";

function daysInYearForDate(dt) {
  const y = dt.getFullYear();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return leap && dt.getMonth() > 1 ? 366 : 365;
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function fmtDate(d) {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mmm = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  return dd + "-" + mmm + "-" + d.getFullYear();
}

function fmtNum(n, dec) {
  if (dec === undefined) dec = 2;
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function parseDate(s) {
  if (!s) return null;
  var d = new Date(s + "T00:00:00");
  return isNaN(d) ? null : d;
}

function xnpv(rate, values, dates) {
  var d0 = dates[0].getTime();
  var sum = 0;
  for (var i = 0; i < values.length; i++) {
    var dt = (dates[i].getTime() - d0) / 86400000 / 365;
    sum += values[i] / Math.pow(1 + rate, dt);
  }
  return sum;
}

function xirr(values, dates, guess) {
  var rate = guess || 0.1;
  for (var iter = 0; iter < 300; iter++) {
    var d0 = dates[0].getTime();
    var f = 0, df = 0;
    for (var i = 0; i < values.length; i++) {
      var dt = (dates[i].getTime() - d0) / 86400000 / 365;
      var pv = values[i] / Math.pow(1 + rate, dt);
      f += pv;
      if (dt !== 0) df -= dt * values[i] / Math.pow(1 + rate, dt + 1);
    }
    if (Math.abs(df) < 1e-14) break;
    var nr = rate - f / df;
    if (Math.abs(nr - rate) < 1e-10) return nr;
    rate = nr;
  }
  return rate;
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

function generateIPDates(firstIP, maturity, freqMonths, dateRule) {
  var dates = [];
  var isLast = dateRule === "last";
  var fixedDay = firstIP.getDate();
  var cur = new Date(firstIP);
  while (cur <= maturity) {
    dates.push(new Date(cur));
    var nm = cur.getMonth() + freqMonths;
    var ny = cur.getFullYear() + Math.floor(nm / 12);
    var mo = nm % 12;
    if (isLast) {
      cur = lastDayOfMonth(ny, mo);
    } else {
      var maxD = new Date(ny, mo + 1, 0).getDate();
      cur = new Date(ny, mo, Math.min(fixedDay, maxD));
    }
  }
  if (dates.length === 0 || dates[dates.length - 1].getTime() !== maturity.getTime()) {
    dates.push(new Date(maturity));
  }
  return dates;
}

function computeCF(opts) {
  var couponRate = opts.couponRate, ytm = opts.ytm, faceValue = opts.faceValue;
  var quantity = opts.quantity, settlementDate = opts.settlementDate;
  var allIPDates = opts.allIPDates, redemptionDate = opts.redemptionDate;
  var redemptionAmount = opts.redemptionAmount;
  var recordDateDays = opts.recordDateDays || 15;
  var stampDutyRate = 0.000001, tdsRate = 0.10;

  var P = faceValue * quantity;
  var lastIPDate = null, futureCFDates = [];

  for (var i = 0; i < allIPDates.length; i++) {
    var rec = new Date(allIPDates[i]);
    rec.setDate(rec.getDate() - recordDateDays);
    if (settlementDate <= rec) {
      lastIPDate = i > 0 ? allIPDates[i - 1] : allIPDates[0];
      futureCFDates = allIPDates.slice(i);
      break;
    }
  }
  if (!lastIPDate) {
    lastIPDate = allIPDates[allIPDates.length - 1];
    futureCFDates = [];
  }

  if (!futureCFDates.find(function(d) { return d.getTime() === redemptionDate.getTime(); })) {
    futureCFDates.push(redemptionDate);
    futureCFDates.sort(function(a, b) { return a - b; });
  }

  var rows = [];
  for (var i = 0; i < futureCFDates.length; i++) {
    var cfDate = futureCFDates[i];
    var yrDays = daysInYearForDate(cfDate);
    var refDate = i === 0 ? lastIPDate : futureCFDates[i - 1];
    var days = daysBetween(refDate, cfDate);
    var interest = (couponRate * P) / yrDays * days;
    var principal = cfDate.getTime() === redemptionDate.getTime() ? redemptionAmount * quantity : 0;
    var payout = interest + principal;
    var tds = Math.round(interest * tdsRate);
    var recDate = new Date(cfDate);
    recDate.setDate(recDate.getDate() - recordDateDays);
    rows.push({ date: cfDate, interest: interest, recordDate: recDate, principal: principal, payout: payout, tds: tds, netPayout: payout - tds, days: days, yrDays: yrDays });
  }

  var xnpvDates = [settlementDate].concat(futureCFDates);
  var xnpvValues = [0].concat(rows.map(function(r) { return r.payout; }));
  var npv = xnpv(ytm, xnpvValues, xnpvDates);
  var aiDays = daysBetween(lastIPDate, settlementDate);
  var ai = Math.round(couponRate * P / 365 * aiDays * 100) / 100;
  var cleanCons = npv - ai;
  var cleanPrice = Math.round(cleanCons * 100 / P * 10000) / 10000;
  var totalCons = Math.round(((cleanPrice * P / 100) + ai) * 100) / 100;
  var stampDuty = Math.round(totalCons * stampDutyRate * 100) / 100 >= 0.5 ? Math.round(totalCons * stampDutyRate) : 0;
  var tcIncSD = Math.round((totalCons + stampDuty) * 100) / 100;

  var xirrResult = null;
  try {
    xirrResult = xirr([-tcIncSD].concat(rows.map(function(r) { return r.payout; })), [settlementDate].concat(futureCFDates), ytm);
  } catch (e) {}

  return { lastIPDate: lastIPDate, settlementDate: settlementDate, futureCFDates: futureCFDates, rows: rows, npv: npv, ai: ai, cleanPrice: cleanPrice, cleanCons: cleanCons, totalCons: totalCons, stampDuty: stampDuty, tcIncSD: tcIncSD, xirrResult: xirrResult, P: P, couponRate: couponRate, ytm: ytm, faceValue: faceValue, quantity: quantity };
}

function exportCSV(result, isin) {
  var r = result;
  var L = [];
  L.push(["Bond CF Schedule"]);
  L.push([]);
  L.push(["ISIN", isin]);
  L.push(["Coupon", (r.couponRate * 100).toFixed(2) + "%"]);
  L.push(["IRR (YTM)", (r.ytm * 100).toFixed(2) + "%"]);
  L.push(["Face Value", r.faceValue]);
  L.push(["Quantity", r.quantity]);
  L.push(["P (FV x Q)", r.P]);
  L.push(["Settlement Date", fmtDate(r.settlementDate)]);
  L.push(["Last IP Date", fmtDate(r.lastIPDate)]);
  L.push([]);
  L.push(["NPV", r.npv.toFixed(2)]);
  L.push(["Accrued Interest", r.ai.toFixed(2)]);
  L.push(["Clean Price", r.cleanPrice.toFixed(4)]);
  L.push(["Clean Consideration", r.cleanCons.toFixed(2)]);
  L.push(["Total Consideration", r.totalCons.toFixed(2)]);
  L.push(["Stamp Duty", r.stampDuty]);
  L.push(["T.C (inc SD)", r.tcIncSD.toFixed(2)]);
  L.push(["XIRR Check", r.xirrResult ? (r.xirrResult * 100).toFixed(6) + "%" : "Error"]);
  L.push([]);
  L.push(["#", "Date", "Days", "Day Count", "Interest", "Record Date", "Principal", "Payout", "TDS", "Net Payout"]);
  L.push(["Ref", fmtDate(r.lastIPDate), "", "", "", "", "", "", "", "Last IP Date"]);
  L.push(["0", fmtDate(r.settlementDate), "", "", "0.00", "", "0.00", "-" + r.tcIncSD.toFixed(2), "0", ""]);
  r.rows.forEach(function(row, i) {
    L.push([i + 1, fmtDate(row.date), row.days, row.yrDays, row.interest.toFixed(2), fmtDate(row.recordDate), row.principal.toFixed(2), row.payout.toFixed(2), row.tds, row.netPayout.toFixed(2)]);
  });
  var csv = L.map(function(row) { return row.map(function(c) { return '"' + c + '"'; }).join(","); }).join("\n");
  var blob = new Blob([csv], { type: "text/csv" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = isin.replace(/[^a-zA-Z0-9]/g, "_") + "_CF_Schedule.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

var FREQ = [
  { label: "Monthly", value: 1 },
  { label: "Quarterly", value: 3 },
  { label: "Semi-Annual", value: 6 },
  { label: "Annual", value: 12 }
];

var inputStyle = { fontFamily: "monospace", fontSize: 13, background: "#111827", border: "1px solid #1e293b", color: "#e2e8f0", padding: "9px 12px", borderRadius: 6, outline: "none", width: "100%" };

function Field(props) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#64748b", fontWeight: 500, marginBottom: 4, display: "block" }}>{props.label}</label>
      <input style={inputStyle} value={props.value} onChange={props.onChange} placeholder={props.placeholder} type={props.type} />
    </div>
  );
}

function Card(props) {
  var bc = props.accent ? "#3b82f6" : props.neg ? "#ef4444" : "#1e293b";
  return (
    <div style={{ background: "#111827", borderRadius: 8, padding: "10px 12px", border: "1px solid " + bc, borderTopWidth: props.accent ? 2 : 1 }}>
      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{props.label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace", color: props.accent ? "#60a5fa" : props.neg ? "#f87171" : "#e2e8f0" }}>{props.value}</div>
    </div>
  );
}

function TdCell(props) {
  return <td style={{ padding: "8px 10px", textAlign: props.align || "right", fontFamily: "monospace", fontSize: 12, borderBottom: "1px solid #111827", color: props.color || "#cbd5e1", fontWeight: props.bold ? 500 : 400 }}>{props.children}</td>;
}

export default function App() {
  var _s = useState({
    isin: "", coupon: "", ytm: "", faceValue: "", quantity: "1",
    settlement: "", firstIP: "", maturityDate: "", freq: "1",
    redemptionAmount: "", recordDays: "15",
    manualDates: "", useManual: false, dateRule: "fixed"
  });
  var form = _s[0], setForm = _s[1];
  var _r = useState(null);
  var result = _r[0], setResult = _r[1];
  var _e = useState("");
  var error = _e[0], setError = _e[1];
  var _t = useState("schedule");
  var tab = _t[0], setTab = _t[1];

  function set(k) {
    return function(e) { setForm(function(f) { var n = {}; for (var x in f) n[x] = f[x]; n[k] = e.target.value; return n; }); };
  }

  var generate = useCallback(function() {
    setError("");
    try {
      var couponRate = parseFloat(form.coupon) / 100;
      var ytm = parseFloat(form.ytm) / 100;
      var faceValue = parseFloat(form.faceValue);
      var quantity = parseInt(form.quantity) || 1;
      var settlementDate = parseDate(form.settlement);
      var maturityDate = parseDate(form.maturityDate);
      var redemptionAmount = form.redemptionAmount ? parseFloat(form.redemptionAmount) : faceValue;
      var recordDays = parseInt(form.recordDays) || 15;

      if (!couponRate || !ytm || !faceValue || !settlementDate || !maturityDate) {
        setError("Please fill all required fields."); return;
      }

      var allIPDates;
      if (form.useManual && form.manualDates.trim()) {
        allIPDates = form.manualDates.split("\n").map(function(s) { return s.trim(); }).filter(Boolean).map(function(s) {
          var p = s.split(/[-\/]/);
          if (p.length === 3) {
            var a = Number(p[0]), b = Number(p[1]), c = Number(p[2]);
            return c > 31 ? new Date(c, b - 1, a) : new Date(a, b - 1, c);
          }
          return parseDate(s);
        }).filter(function(d) { return d && !isNaN(d); });
      } else {
        var firstIP = parseDate(form.firstIP);
        if (!firstIP) { setError("Enter First IP Date or use manual dates."); return; }
        allIPDates = generateIPDates(firstIP, maturityDate, parseInt(form.freq), form.dateRule);
      }

      if (allIPDates.length < 1) { setError("No IP dates generated."); return; }

      var res = computeCF({ couponRate: couponRate, ytm: ytm, faceValue: faceValue, quantity: quantity, settlementDate: settlementDate, allIPDates: allIPDates, redemptionDate: maturityDate, redemptionAmount: redemptionAmount, recordDateDays: recordDays });
      res.isin = form.isin || "BOND";
      setResult(res);
      setTab("schedule");
    } catch (e) { setError("Error: " + e.message); }
  }, [form]);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#0a0e17", color: "#c8cdd8", minHeight: "100vh" }}>
      <div style={{ background: "#111827", borderBottom: "1px solid #1e293b", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>₹</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>Bond CF Schedule Generator</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Cash Flow and Consideration Calculator</div>
          </div>
        </div>
        {result && <button onClick={function() { exportCSV(result, result.isin); }} style={{ fontWeight: 600, fontSize: 13, border: "none", borderRadius: 6, padding: "9px 18px", cursor: "pointer", background: "linear-gradient(135deg, #059669, #047857)", color: "#fff" }}>Export CSV</button>}
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 66px)" }}>
        <div style={{ width: 320, flexShrink: 0, background: "#0d1117", borderRight: "1px solid #1e293b", padding: 20, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Bond Parameters</div>
          <Field label="ISIN / Bond Name" value={form.isin} onChange={set("isin")} placeholder="e.g. INE08XP07399" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Coupon (%)" value={form.coupon} onChange={set("coupon")} placeholder="12" type="number" />
            <Field label="YTM (%)" value={form.ytm} onChange={set("ytm")} placeholder="15.25" type="number" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Face Value" value={form.faceValue} onChange={set("faceValue")} placeholder="10000" type="number" />
            <Field label="Quantity" value={form.quantity} onChange={set("quantity")} placeholder="1" type="number" />
          </div>
          <Field label="Settlement Date" value={form.settlement} onChange={set("settlement")} type="date" />

          <div style={{ height: 1, background: "#1e293b", margin: "14px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Cash Flow Dates</div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }} onClick={function() { setForm(function(f) { var n = {}; for (var x in f) n[x] = f[x]; n.useManual = !f.useManual; return n; }); }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, border: "1px solid " + (form.useManual ? "#3b82f6" : "#334155"), background: form.useManual ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>
              {form.useManual && "✓"}
            </div>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Paste dates manually (KID / Sourcing)</span>
          </div>

          {form.useManual ? (
            <div style={{ marginBottom: 12 }}>
              <textarea rows={7} value={form.manualDates} onChange={set("manualDates")} placeholder={"11-01-2026\n11-02-2026\n...\n(DD-MM-YYYY)"} style={{ fontFamily: "monospace", fontSize: 12, background: "#111827", border: "1px solid #1e293b", color: "#e2e8f0", padding: 10, borderRadius: 6, outline: "none", width: "100%", resize: "vertical" }} />
            </div>
          ) : (
            <div>
              <Field label="First IP Date" value={form.firstIP} onChange={set("firstIP")} type="date" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#64748b", fontWeight: 500, marginBottom: 4, display: "block" }}>Frequency</label>
                  <select value={form.freq} onChange={set("freq")} style={inputStyle}>
                    {FREQ.map(function(o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#64748b", fontWeight: 500, marginBottom: 4, display: "block" }}>Date Rule</label>
                  <select value={form.dateRule} onChange={set("dateRule")} style={inputStyle}>
                    <option value="fixed">Fixed Date</option>
                    <option value="last">Last Day of Month</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <Field label="Maturity Date" value={form.maturityDate} onChange={set("maturityDate")} type="date" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Redemption Amt" value={form.redemptionAmount} onChange={set("redemptionAmount")} placeholder="= FV" type="number" />
            <Field label="Record Days" value={form.recordDays} onChange={set("recordDays")} placeholder="15" type="number" />
          </div>

          {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</div>}

          <button onClick={generate} style={{ fontWeight: 600, fontSize: 14, border: "none", borderRadius: 6, padding: "12px 20px", cursor: "pointer", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", width: "100%", marginTop: 6 }}>
            Generate CF Schedule
          </button>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {!result ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 48, opacity: 0.2, color: "#64748b" }}>₹</div>
              <div style={{ fontSize: 14, color: "#475569" }}>Enter bond parameters and click Generate</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ padding: "14px 20px 0", display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                <Card label="NPV" value={fmtNum(result.npv)} />
                <Card label="Accrued Int" value={fmtNum(result.ai)} neg={result.ai < 0} />
                <Card label="Clean Price" value={fmtNum(result.cleanPrice, 4)} />
                <Card label="Clean Cons" value={fmtNum(result.cleanCons)} />
                <Card label="Total Cons" value={fmtNum(result.totalCons)} />
                <Card label="Stamp Duty" value={fmtNum(result.stampDuty, 0)} />
                <Card label="T.C (inc SD)" value={fmtNum(result.tcIncSD)} accent={true} />
              </div>

              <div style={{ padding: "8px 20px", display: "flex", gap: 20, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
                <span>Last IP: <b style={{ color: "#94a3b8" }}>{fmtDate(result.lastIPDate)}</b></span>
                <span>Settlement: <b style={{ color: "#94a3b8" }}>{fmtDate(result.settlementDate)}</b></span>
                <span>XIRR: <b style={{ color: result.xirrResult && Math.abs(result.xirrResult - result.ytm) < 0.001 ? "#10b981" : "#f87171" }}>{result.xirrResult ? (result.xirrResult * 100).toFixed(4) + "%" : "ERR"}</b></span>
                <span>P: <b style={{ color: "#94a3b8" }}>₹{fmtNum(result.P, 0)}</b></span>
              </div>

              <div style={{ padding: "0 20px", borderBottom: "1px solid #1e293b", display: "flex", gap: 4 }}>
                <button onClick={function() { setTab("schedule"); }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, border: "none", background: "none", color: tab === "schedule" ? "#3b82f6" : "#64748b", cursor: "pointer", borderBottom: "2px solid " + (tab === "schedule" ? "#3b82f6" : "transparent") }}>Cash Flow Schedule</button>
                <button onClick={function() { setTab("summary"); }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, border: "none", background: "none", color: tab === "summary" ? "#3b82f6" : "#64748b", cursor: "pointer", borderBottom: "2px solid " + (tab === "summary" ? "#3b82f6" : "transparent") }}>Summary</button>
              </div>

              <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
                {tab === "schedule" ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["#", "Date", "Days", "Yr", "Interest", "Record Date", "Principal", "Payout", "TDS", "Net Payout"].map(function(h) {
                          return <th key={h} style={{ background: "#141c2e", color: "#94a3b8", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 10px", textAlign: h === "#" ? "center" : "right", borderBottom: "2px solid #1e293b", position: "sticky", top: 0, zIndex: 1 }}>{h}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: "rgba(239,68,68,0.04)" }}>
                        <TdCell align="center" color="#64748b">—</TdCell>
                        <TdCell color="#f87171">{fmtDate(result.lastIPDate)}</TdCell>
                        <td colSpan={8} style={{ padding: "8px 10px", textAlign: "left", fontFamily: "monospace", fontSize: 11, borderBottom: "1px solid #111827", color: "#94a3b8", paddingLeft: 16 }}>Last IP Date (AI reference)</td>
                      </tr>
                      <tr style={{ background: "rgba(239,68,68,0.04)" }}>
                        <TdCell align="center" color="#f87171">0</TdCell>
                        <TdCell color="#f87171">{fmtDate(result.settlementDate)}</TdCell>
                        <TdCell>—</TdCell>
                        <TdCell>—</TdCell>
                        <TdCell>0.00</TdCell>
                        <TdCell>—</TdCell>
                        <TdCell>0.00</TdCell>
                        <TdCell color="#f87171" bold={true}>-{fmtNum(result.tcIncSD)}</TdCell>
                        <TdCell>0</TdCell>
                        <TdCell>—</TdCell>
                      </tr>
                      {result.rows.map(function(r, i) {
                        return (
                          <tr key={i} style={{ background: r.principal > 0 ? "rgba(16,185,129,0.04)" : "transparent" }}>
                            <TdCell align="center" color="#64748b">{i + 1}</TdCell>
                            <TdCell>{fmtDate(r.date)}</TdCell>
                            <TdCell>{r.days}</TdCell>
                            <TdCell color="#4a5568">{r.yrDays}</TdCell>
                            <TdCell>{fmtNum(r.interest)}</TdCell>
                            <TdCell color="#64748b">{fmtDate(r.recordDate)}</TdCell>
                            <TdCell color={r.principal > 0 ? "#10b981" : "#334155"}>{fmtNum(r.principal)}</TdCell>
                            <TdCell bold={true}>{fmtNum(r.payout)}</TdCell>
                            <TdCell color="#64748b">{r.tds}</TdCell>
                            <TdCell>{fmtNum(r.netPayout)}</TdCell>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: "20px 0" }}>
                    <div style={{ background: "#111827", borderRadius: 8, border: "1px solid #1e293b", overflow: "hidden" }}>
                      {[
                        ["ISIN", result.isin],
                        ["Coupon Rate", (result.couponRate * 100).toFixed(2) + "%"],
                        ["YTM", (result.ytm * 100).toFixed(2) + "%"],
                        ["Face Value", fmtNum(result.faceValue, 0)],
                        ["Quantity", result.quantity],
                        ["P (FV x Q)", fmtNum(result.P, 0)],
                        ["Settlement", fmtDate(result.settlementDate)],
                        ["Last IP Date", fmtDate(result.lastIPDate)],
                        ["---"],
                        ["NPV", fmtNum(result.npv)],
                        ["Accrued Interest", fmtNum(result.ai)],
                        ["Clean Price", fmtNum(result.cleanPrice, 4)],
                        ["Clean Cons", fmtNum(result.cleanCons)],
                        ["Total Cons", fmtNum(result.totalCons)],
                        ["Stamp Duty", fmtNum(result.stampDuty, 0)],
                        ["T.C (inc SD)", fmtNum(result.tcIncSD)],
                        ["---"],
                        ["XIRR", result.xirrResult ? (result.xirrResult * 100).toFixed(6) + "%" : "Error"],
                        ["XIRR Match", result.xirrResult && Math.abs(result.xirrResult - result.ytm) < 0.001 ? "Verified" : "Mismatch"]
                      ].map(function(row, i) {
                        if (row[0] === "---") return <div key={i} style={{ height: 1, background: "#1e293b" }} />;
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #0d1117" }}>
                            <span style={{ color: "#64748b", fontSize: 13 }}>{row[0]}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 500, color: row[0] === "XIRR Match" ? (row[1] === "Verified" ? "#10b981" : "#f87171") : "#e2e8f0" }}>{row[1]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
