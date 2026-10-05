"use client";

import { useEffect, useMemo, useState } from "react";

const seedPortfolio = [
  { id: "1", symbol: "AAPL", shares: 10, avg: 180 },
  { id: "2", symbol: "NVDA", shares: 8, avg: 120 },
  { id: "3", symbol: "MSFT", shares: 5, avg: 390 }
];
const seedWatchlist = ["TSLA", "AMZN", "GOOGL", "META"];

function money(n) {
  if (!Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(n));
}
function pct(n) { return `${Number(n || 0) >= 0 ? "+" : ""}${Number(n || 0).toFixed(2)}%`; }

export default function Home() {
  const [tab, setTab] = useState("overview");
  const [portfolio, setPortfolio] = useState(seedPortfolio);
  const [watchlist, setWatchlist] = useState(seedWatchlist);
  const [quotes, setQuotes] = useState({});
  const [analysis, setAnalysis] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("pf-portfolio"));
      const w = JSON.parse(localStorage.getItem("pf-watchlist"));
      if (p) setPortfolio(p);
      if (w) setWatchlist(w);
    } catch {}
  }, []);
  useEffect(() => localStorage.setItem("pf-portfolio", JSON.stringify(portfolio)), [portfolio]);
  useEffect(() => localStorage.setItem("pf-watchlist", JSON.stringify(watchlist)), [watchlist]);

  const symbols = useMemo(() => [...new Set([...portfolio.map(x => x.symbol), ...watchlist])], [portfolio, watchlist]);

  async function refresh() {
    setLoading(true);
    const entries = await Promise.all(symbols.map(async symbol => {
      try {
        const r = await fetch("/api/quote?symbol=" + encodeURIComponent(symbol), { cache: "no-store" });
        return [symbol, r.ok ? await r.json() : { symbol, error: "Unavailable" }];
      } catch {
        return [symbol, { symbol, error: "Unavailable" }];
      }
    }));
    setQuotes(Object.fromEntries(entries));
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [symbols.join("|")]);
  useEffect(() => {
    fetch("/api/analysis", { cache: "no-store" })
      .then(r => r.ok ? r.json() : [])
      .then(x => setAnalysis(Array.isArray(x) ? x : []))
      .catch(() => {});
  }, []);

  const holdings = portfolio.map(h => {
    const q = quotes[h.symbol];
    const price = Number(q?.price || h.avg);
    const value = price * h.shares;
    const cost = h.avg * h.shares;
    return { ...h, q, value, cost, pnl: value - cost, pnlPct: cost ? ((value - cost) / cost) * 100 : 0 };
  });
  const totalValue = holdings.reduce((a, h) => a + h.value, 0);
  const totalCost = holdings.reduce((a, h) => a + h.cost, 0);
  const totalPnl = totalValue - totalCost;

  function addWatch() {
    const s = query.trim().toUpperCase();
    if (s && !watchlist.includes(s)) setWatchlist(v => [...v, s]);
    setQuery("");
  }

  function addHolding(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const symbol = String(f.get("symbol") || "").trim().toUpperCase();
    const shares = Number(f.get("shares"));
    const avg = Number(f.get("avg"));
    if (symbol && shares > 0 && avg >= 0) {
      setPortfolio(v => [...v, { id: Date.now().toString(), symbol, shares, avg }]);
      setModal(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="logo">P</div><div><b>Pulsefolio</b><small>PERSONAL INVESTING</small></div></div>
        {[
          ["overview", "Dashboard"], ["portfolio", "Portfolio"], ["watchlist", "Watchlist"], ["opportunities", "Opportunities"]
        ].map(([id, label]) => <button key={id} className={tab === id ? "nav active" : "nav"} onClick={() => setTab(id)}>{label}</button>)}
        <div className="sidebottom">Local workspace</div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><span className="eyebrow">MARKET DASHBOARD</span><h1>{tab[0].toUpperCase() + tab.slice(1)}</h1></div>
          <div className="actions">
            <div className="search"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && addWatch()} placeholder="Add ticker…" /></div>
            <button className="button ghost" onClick={refresh}>{loading ? "Refreshing…" : "Refresh"}</button>
            <button className="button" onClick={() => setModal(true)}>+ Add position</button>
          </div>
        </header>

        {tab === "overview" && <Overview holdings={holdings} totalValue={totalValue} totalPnl={totalPnl} watchlist={watchlist} quotes={quotes} setTab={setTab} setWatchlist={setWatchlist} />}
        {tab === "portfolio" && <section className="panel"><Header title="Your portfolio" meta={holdings.length + " positions"} /><Table holdings={holdings} /></section>}
        {tab === "watchlist" && <section className="panel"><Header title="Market radar" meta={watchlist.length + " stocks"} /><div className="cards">{watchlist.map(s => <WatchCard key={s} symbol={s} q={quotes[s]} remove={() => setWatchlist(v => v.filter(x => x !== s))} />)}</div></section>}
        {tab === "opportunities" && <section className="panel"><Header title="Valuation-adjusted opportunities" meta={analysis.length + " stocks"} /><div className="analysis">{analysis.slice(0, 12).map(x => <div className="analysisCard" key={x.ticker}><b>{x.ticker}</b><strong>{Number(x.overall_score || 0).toFixed(0)}</strong><span>{x.buy_zone}</span><p>{x.explanation}</p></div>)}</div></section>}

        {tab !== "opportunities" && <section className="panel"><Header title="Investment engine" meta="AI-assisted" /><div className="analysis">{analysis.slice(0, 6).map(x => <div className="analysisCard" key={x.ticker}><b>{x.ticker}</b><strong>{Number(x.overall_score || 0).toFixed(0)}</strong><span>{x.buy_zone}</span><p>{x.explanation}</p></div>)}</div></section>}
      </section>

      {modal && <div className="overlay" onMouseDown={() => setModal(false)}><form className="modal" onSubmit={addHolding} onMouseDown={e => e.stopPropagation()}><h2>Add position</h2><label>Ticker<input name="symbol" placeholder="NVDA" required /></label><label>Shares<input name="shares" type="number" step="any" min="0.0001" required /></label><label>Average cost<input name="avg" type="number" step="any" min="0" required /></label><div className="modalActions"><button type="button" className="button ghost" onClick={() => setModal(false)}>Cancel</button><button className="button">Add</button></div></form></div>}
    </main>
  );
}

function Header({ title, meta }) { return <div className="panelHead"><div><span className="eyebrow">PULSEFOLIO</span><h2>{title}</h2></div><span className="meta">{meta}</span></div>; }

function Overview({ holdings, totalValue, totalPnl, watchlist, quotes, setTab, setWatchlist }) {
  return <div className="page">
    <div className="stats"><Stat label="Portfolio value" value={money(totalValue)} /><Stat label="Total P&L" value={money(totalPnl)} positive={totalPnl >= 0} /><Stat label="Positions" value={String(holdings.length)} /><Stat label="Watchlist" value={String(watchlist.length)} /></div>
    <section className="panel"><Header title="Portfolio" meta="Live market quotes" /><Table holdings={holdings} /></section>
    <section className="panel"><Header title="Market radar" meta={<button className="link" onClick={() => setTab("watchlist")}>View all →</button>} /><div className="cards">{watchlist.slice(0, 4).map(s => <WatchCard key={s} symbol={s} q={quotes[s]} remove={() => setWatchlist(v => v.filter(x => x !== s))} />)}</div></section>
  </div>;
}
function Stat({ label, value, positive }) { return <div className="stat"><span>{label}</span><strong className={positive === undefined ? "" : positive ? "up" : "down"}>{value}</strong></div>; }
function Table({ holdings }) { return <div className="tableWrap"><table><thead><tr><th>Asset</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Market value</th><th>Return</th></tr></thead><tbody>{holdings.map(h => <tr key={h.id}><td><b>{h.symbol}</b><small>{h.q?.name || "Market asset"}</small></td><td>{h.shares}</td><td>{money(h.avg)}</td><td>{h.q?.price ? money(h.q.price) : "—"}</td><td><b>{money(h.value)}</b></td><td className={h.pnl >= 0 ? "up" : "down"}>{money(h.pnl)} <small>({pct(h.pnlPct)})</small></td></tr>)}</tbody></table></div>; }
function WatchCard({ symbol, q, remove }) { return <div className="watch"><div className="watchTop"><div><b>{symbol}</b><small>{q?.name || "Loading…"}</small></div><button onClick={remove}>×</button></div><strong>{q?.price ? money(q.price) : "—"}</strong><span className={q?.changePct >= 0 ? "up" : "down"}>{q?.changePct != null ? pct(q.changePct) : "…"}</span><div className="watchMeta"><span>52W high</span><b>{q?.fiftyTwoHigh ? money(q.fiftyTwoHigh) : "—"}</b></div></div>; }
