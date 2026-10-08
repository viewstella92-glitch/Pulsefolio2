const DAY = 864e5;
const ms = s => Date.parse(s);
const days = (a, b) => (ms(b) - ms(a)) / DAY;

let tickerMap = null, tickerAt = 0;

async function sec(url) {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) throw new Error("ยังไม่ได้ตั้งค่า SEC_USER_AGENT ใน Vercel (รูปแบบ: ชื่อ อีเมล) — SEC บังคับให้ระบุ");
  const r = await fetch(url, { headers: { "User-Agent": ua, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error("SEC ตอบ " + r.status + " (" + url + ")");
  return r.json();
}

export async function lookupCik(ticker) {
  if (!tickerMap || Date.now() - tickerAt > 12 * 3600e3) {
    tickerMap = await sec("https://www.sec.gov/files/company_tickers.json");
    tickerAt = Date.now();
  }
  const t = ticker.toUpperCase().replace(".", "-");
  for (const k in tickerMap) {
    const x = tickerMap[k];
    if (x.ticker === t) return { cik: String(x.cik_str).padStart(10, "0"), name: x.title };
  }
  return null;
}

export async function yahooPrice(ticker) {
  const r = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker) + "?range=1y&interval=1d",
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(12000) }
  );
  if (!r.ok) throw new Error("Yahoo ตอบ " + r.status);
  const res = (await r.json())?.chart?.result?.[0];
  const closes = (res?.indicators?.quote?.[0]?.close || []).filter(x => x != null);
  const price = res?.meta?.regularMarketPrice;
  if (!(price > 0) || !closes.length) throw new Error("Yahoo ไม่มีราคา");
  const hi52 = Math.max(...closes, price), lo52 = Math.min(...closes, price);
  const t = res.meta.regularMarketTime;
  return { price, time: t ? new Date(t * 1000).toISOString() : null, hi52, lo52, fromHigh: (price / hi52 - 1) * 100 };
}

const dur = r => days(r.start, r.end);

function dedupe(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.start + "|" + r.end;
    const p = m.get(k);
    if (!p || r.filed > p.filed) m.set(k, r);
  }
  return [...m.values()];
}

export function pick(facts, concepts, unit, { instant = false } = {}) {
  let best = null;
  for (const c of concepts) {
    const u = facts?.["us-gaap"]?.[c]?.units?.[unit];
    if (!u?.length) continue;
    const rows = dedupe(u.filter(r => (instant ? r.end : r.start && r.end)));
    if (!rows.length) continue;
    const last = rows.reduce((a, r) => (r.end > a ? r.end : a), "");
    if (!best || last > best.last) best = { concept: c, rows, last };
  }
  return best;
}

export function ttm(s) {
  if (!s) return null;
  const annual = s.rows
    .filter(r => { const d = dur(r); return d >= 350 && d <= 380 && ["10-K", "20-F", "40-F"].includes(r.form); })
    .sort((a, b) => (a.end < b.end ? 1 : -1));
  if (!annual.length) return null;
  const A = annual[0];
  const base = { concept: s.concept, annual: annual.slice(0, 5).map(r => ({ end: r.end, val: r.val })) };
  const Y = s.rows
    .filter(r => r.end > A.end && dur(r) >= 80 && dur(r) <= 285 && Math.abs(days(A.end, r.start)) <= 5 && ["10-Q", "10-K", "20-F", "40-F"].includes(r.form))
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (!Y) return { ...base, value: A.val, asOf: A.end, filed: A.filed, basis: "ปีงบล่าสุด (10-K)" };
  const P = s.rows.find(r => r.start && Math.abs(dur(r) - dur(Y)) <= 10 && Math.abs(days(r.end, Y.end) - 365) <= 12);
  if (!P) return { ...base, value: A.val, asOf: A.end, filed: A.filed, basis: "ปีงบล่าสุด (ไม่พบงวดเทียบปีก่อน จึงยังไม่รวม YTD)" };
  return { ...base, value: A.val + Y.val - P.val, asOf: Y.end, filed: Y.filed, basis: "TTM = ปีงบ + YTD − YTD ปีก่อน" };
}

function latestInstant(s) {
  if (!s) return null;
  const r = s.rows.slice().sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  return { concept: s.concept, value: r.val, asOf: r.end, filed: r.filed, basis: "งบดุลล่าสุด" };
}

function latestShares(facts) {
  const u = facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares;
  if (!u?.length) return null;
  const end = u.reduce((a, r) => (r.end > a ? r.end : a), "");
  const rows = u.filter(r => r.end === end);
  const filed = rows.reduce((a, r) => (r.filed > a ? r.filed : a), "");
  const vals = [...new Set(rows.filter(r => r.filed === filed).map(r => r.val))];
  return { value: vals.reduce((a, b) => a + b, 0), asOf: end, filed, classes: vals.length };
}

function annualGrowth(t) {
  const a = t?.annual;
  if (!a || a.length < 2) return null;
  const gap = days(a[1].end, a[0].end);
  if (gap < 350 || gap > 380 || !(a[1].val > 0)) return null;
  return { pct: (a[0].val / a[1].val - 1) * 100, fiscalYearEnd: a[0].end, basis: "ปีงบล่าสุด เทียบปีงบก่อนหน้า" };
}

const CONCEPTS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  eps: ["EarningsPerShareDiluted"],
  cfo: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  equity: ["StockholdersEquity"],
  debt: ["LongTermDebt", "LongTermDebtNoncurrent"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
};

const src = x => (x ? { value: x.value, asOf: x.asOf, filed: x.filed, basis: x.basis, source: "SEC EDGAR us-gaap:" + x.concept } : null);

export async function buildFundamentals(ticker) {
  const warnings = [];
  const id = await lookupCik(ticker);
  if (!id) return { ok: false, ticker, reason: "ไม่พบ ticker ใน SEC (อาจเป็นหุ้นต่างประเทศที่ไม่ได้ยื่น 10-K)" };

  const [factsDoc, px] = await Promise.all([
    sec("https://data.sec.gov/api/xbrl/companyfacts/CIK" + id.cik + ".json"),
    yahooPrice(ticker).catch(e => ({ error: e.message })),
  ]);
  const facts = factsDoc.facts;
  if (!facts?.["us-gaap"]) return { ok: false, ticker, name: id.name, reason: "บริษัทนี้ไม่ได้รายงานแบบ US-GAAP (เช่น ยื่น 20-F/IFRS) ระบบยังไม่รองรับ" };

  const S = (k, o) => pick(facts, CONCEPTS[k], k === "eps" ? "USD/shares" : "USD", o);
  const tRev = ttm(S("revenue")), tOi = ttm(S("operatingIncome")), tNi = ttm(S("netIncome"));
  const tEps = ttm(S("eps")), tCfo = ttm(S("cfo")), tCapex = ttm(S("capex"));
  const equity = latestInstant(S("equity", { instant: true }));
  const debt = latestInstant(S("debt", { instant: true }));
  const cash = latestInstant(S("cash", { instant: true }));
  const shares = latestShares(facts);

  let fcf = null;
  if (tCfo && tCapex) {
    fcf = { value: tCfo.value - Math.abs(tCapex.value), asOf: tCfo.asOf < tCapex.asOf ? tCfo.asOf : tCapex.asOf, basis: "CFO − CapEx (" + tCfo.basis + ")", source: "SEC EDGAR us-gaap:" + tCfo.concept + " − " + tCapex.concept };
  } else warnings.push("คำนวณ Free Cash Flow ไม่ได้ (ไม่พบ CFO หรือ CapEx ในรูปแบบมาตรฐาน)");

  const price = px.error ? null : px.price;
  if (!price) warnings.push("ไม่มีราคาล่าสุดจาก Yahoo: " + (px.error || ""));
  else if (px.time && days(px.time, new Date().toISOString()) > 5) warnings.push("ราคาเก่ากว่า 5 วัน");

  const marketCap = price && shares ? price * shares.value : null;
  if (shares?.classes > 1) warnings.push("บริษัทมีหลายคลาสหุ้น — Market Cap ที่รวมคลาสอาจคลาดเคลื่อน ควรตรวจซ้ำ");
  if (!shares) warnings.push("ไม่พบจำนวนหุ้นที่ออกจำหน่าย จึงคำนวณ Market Cap ไม่ได้");

  const newest = [tEps, tNi, tRev].filter(Boolean).map(x => x.asOf).sort().pop();
  if (newest && days(newest, new Date().toISOString().slice(0, 10)) > 140) warnings.push("งบล่าสุดที่พบมีวันที่ " + newest + " (เก่ากว่า 140 วัน) อาจมีงบใหม่ที่ยังไม่รวม");
  if (tEps && tNi && shares && tNi.value > 0) {
    const ratio = (tEps.value * shares.value) / tNi.value;
    if (ratio < 0.7 || ratio > 1.4) warnings.push("EPS × จำนวนหุ้น ไม่สอดคล้องกับกำไรสุทธิ (อัตราส่วน " + ratio.toFixed(2) + ") อาจมีหุ้นหลายคลาส/ปรับหน่วย ควรตรวจกับงบจริง");
  }
  if (tEps && tNi && Math.sign(tEps.value) !== Math.sign(tNi.value)) warnings.push("เครื่องหมาย EPS กับกำไรสุทธิขัดกัน");
  if (!tRev) warnings.push("ไม่พบรายได้");
  if (!tEps) warnings.push("ไม่พบ EPS (diluted)");

  const pe = price && tEps?.value > 0 ? price / tEps.value : null;
  const valuation = {
    peTtm: pe,
    earningsYieldPct: pe ? 100 / pe : null,
    fcfYieldPct: marketCap && fcf ? (fcf.value / marketCap) * 100 : null,
    priceToSales: marketCap && tRev?.value > 0 ? marketCap / tRev.value : null,
    marketCap,
    note: "คำนวณจากราคา Yahoo ÷ EPS ย้อนหลัง 12 เดือนจาก SEC (ไม่ใช่ Forward P/E)",
  };
  const derived = {
    operatingMarginPct: tOi && tRev?.value > 0 ? (tOi.value / tRev.value) * 100 : null,
    netMarginPct: tNi && tRev?.value > 0 ? (tNi.value / tRev.value) * 100 : null,
    roePct: tNi && equity?.value > 0 ? (tNi.value / equity.value) * 100 : null,
    debtToEquity: debt && equity?.value > 0 ? debt.value / equity.value : null,
    revenueGrowth: annualGrowth(tRev),
    epsGrowth: annualGrowth(tEps),
  };

  const critical = !tEps || !tRev || !price;
  const level = critical ? "ต่ำ" : warnings.length >= 2 ? "กลาง" : "สูง";

  return {
    ok: true,
    ticker,
    name: id.name,
    cik: id.cik,
    fetchedAt: new Date().toISOString(),
    price: px.error ? null : { value: px.price, asOf: px.time, source: "Yahoo Finance", hi52Close: px.hi52, lo52Close: px.lo52, fromHighPct: px.fromHigh },
    metrics: {
      revenueTtm: src(tRev), operatingIncomeTtm: src(tOi), netIncomeTtm: src(tNi), epsDilutedTtm: src(tEps),
      freeCashFlowTtm: fcf, equity: src(equity), longTermDebt: src(debt), cash: src(cash),
      sharesOutstanding: shares ? { value: shares.value, asOf: shares.asOf, source: "SEC EDGAR dei:EntityCommonStockSharesOutstanding" } : null,
    },
    valuation,
    derived,
    trust: { level, warnings },
  };
}

const vcache = new Map();
export async function getVerified(ticker) {
  const t = String(ticker).toUpperCase();
  const c = vcache.get(t);
  if (c && Date.now() < c.until) return c.data;
  let data, ttl;
  try {
    data = await buildFundamentals(t);
    ttl = data.ok ? 6 * 3600e3 : 30 * 60e3;
  } catch (e) {
    data = { ok: false, ticker: t, reason: e?.message || "ดึงข้อมูลไม่สำเร็จ" };
    ttl = 5 * 60e3;
  }
  vcache.set(t, { data, until: Date.now() + ttl });
  return data;
}
