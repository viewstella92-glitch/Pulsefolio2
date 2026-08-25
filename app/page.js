"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, Bell, BriefcaseBusiness, ChevronDown, CircleDollarSign,
  Eye, LayoutDashboard, Plus, RefreshCw, Search, Settings2, Star,
  TrendingDown, TrendingUp, Wallet, X
} from "lucide-react";

const seedPortfolio = [
  { id: "1", symbol: "AAPL", shares: 10, avg: 180 },
  { id: "2", symbol: "NVDA", shares: 8, avg: 120 },
  { id: "3", symbol: "MSFT", shares: 5, avg: 390 }
];
const seedWatchlist = ["TSLA", "AMZN", "GOOGL", "META"];

function money(n, currency="USD") {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style:"currency", currency, maximumFractionDigits:2 }).format(n);
}
function pct(n) { return `${n >= 0 ? "+" : ""}${Number(n || 0).toFixed(2)}%`; }

function Sparkline({ data, positive=true }) {
  if (!data?.length) return <div className="spark empty" />;
  const vals = data.map(x => x.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max-min || 1;
  const pts = vals.map((v,i) => `${(i/(vals.length-1||1))*100},${100-((v-min)/range)*90-5}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={positive ? "#36d399" : "#ff6b7a"} strokeWidth="2.8" vectorEffect="non-scaling-stroke"/></svg>;
}

export default function Home() {
  const [tab, setTab] = useState("overview");
  const [portfolio, setPortfolio] = useState(seedPortfolio);
  const [watchlist, setWatchlist] = useState(seedWatchlist);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("pf-portfolio"));
      const w = JSON.parse(localStorage.getItem("pf-watchlist"));
      const a = JSON.parse(localStorage.getItem("pf-alerts"));
      if (p) setPortfolio(p);
      if (w) setWatchlist(w);
      if (a) setAlerts(a);
    } catch {}
  }, []);

  useEffect(() => { localStorage.setItem("pf-portfolio", JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem("pf-watchlist", JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem("pf-alerts", JSON.stringify(alerts)); }, [alerts]);

  const symbols = useMemo(() => [...new Set([...portfolio.map(x=>x.symbol), ...watchlist])], [portfolio, watchlist]);

  async function refresh() {
    setLoading(true);
    const entries = await Promise.all(symbols.map(async s => {
      try {
        const r = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}`);
        const j = await r.json();
        return [s, r.ok ? j : { symbol:s, error:j.error }];
      } catch { return [s, {symbol:s, error:"Network error"}]; }
    }));
    setQuotes(Object.fromEntries(entries));
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => { if (symbols.length) refresh(); }, [symbols.join("|")]);

  const holdings = portfolio.map(h => {
    const q = quotes[h.symbol];
    const price = q?.price ?? h.avg;
    const value = price * h.shares;
    const cost = h.avg * h.shares;
    return {...h, q, value, cost, pnl:value-cost, pnlPct:cost ? ((value-cost)/cost)*100 : 0};
  });
  const totalValue = holdings.reduce((a,h)=>a+h.value,0);
  const totalCost = holdings.reduce((a,h)=>a+h.cost,0);
  const totalPnl = totalValue-totalCost;
  const totalPnlPct = totalCost ? totalPnl/totalCost*100 : 0;
  const dayPnl = holdings.reduce((a,h)=>a+(h.q?.change||0)*h.shares,0);

  function addWatch(symbol) {
    const s=symbol.trim().toUpperCase();
    if (!s || watchlist.includes(s)) return;
    setWatchlist(v=>[...v,s]); setQuery(""); setModal(null);
  }
  function addHolding(e) {
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const symbol=String(f.get("symbol")).trim().toUpperCase();
    const shares=Number(f.get("shares")), avg=Number(f.get("avg"));
    if(!symbol || shares<=0 || avg<0) return;
    setPortfolio(v=>[...v,{id:crypto.randomUUID(),symbol,shares,avg}]);
    setModal(null);
  }

  const nav = [
    ["overview","Overview",LayoutDashboard],
    ["portfolio","Portfolio",BriefcaseBusiness],
    ["watchlist","Watchlist",Eye],
    ["alerts","Alerts",Bell]
  ];

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark"><Activity size={20}/></div><div><b>Pulsefolio</b><span>PERSONAL INVESTING</span></div></div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={18}/>{label}{id==="alerts"&&alerts.length>0&&<em>{alerts.length}</em>}</button>)}</nav>
      <div className="sidebottom"><button><Settings2 size={18}/> Settings</button><div className="miniuser"><div>PP</div><span><b>My Portfolio</b><small>Local workspace</small></span></div></div>
    </aside>

    <section className="content">
      <header className="topbar">
        <div><span className="eyebrow">MARKET DASHBOARD</span><h1>{nav.find(x=>x[0]===tab)?.[1]}</h1></div>
        <div className="actions">
          <div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWatch(query)} placeholder="Add ticker to watchlist…"/></div>
          <button className="iconbtn" onClick={refresh} title="Refresh"><RefreshCw size={18} className={loading?"spin":""}/></button>
          <button className="primary" onClick={()=>setModal("holding")}><Plus size={18}/> Add position</button>
        </div>
      </header>

      {tab==="overview" && <Overview holdings={holdings} totalValue={totalValue} totalPnl={totalPnl} totalPnlPct={totalPnlPct} dayPnl={dayPnl} quotes={quotes} watchlist={watchlist} setWatchlist={setWatchlist} setTab={setTab}/>}
      {tab==="portfolio" && <Portfolio holdings={holdings} setPortfolio={setPortfolio} setModal={setModal}/>}
      {tab==="watchlist" && <Watchlist watchlist={watchlist} quotes={quotes} setWatchlist={setWatchlist}/>}
      {tab==="alerts" && <Alerts alerts={alerts} setAlerts={setAlerts} quotes={quotes} />}

      <footer>Data refreshes from market data when available · {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first refresh"}</footer>
    </section>

    {modal==="holding" && <div className="overlay" onMouseDown={()=>setModal(null)}><form className="modal" onSubmit={addHolding} onMouseDown={e=>e.stopPropagation()}><div className="modalhead"><div><span className="eyebrow">PORTFOLIO</span><h2>Add position</h2></div><button type="button" className="iconbtn" onClick={()=>setModal(null)}><X size={18}/></button></div><label>Ticker<input name="symbol" placeholder="e.g. NVDA" required/></label><div className="twocol"><label>Shares<input name="shares" type="number" step="any" min="0.0001" placeholder="10" required/></label><label>Average cost<input name="avg" type="number" step="any" min="0" placeholder="120" required/></label></div><button className="primary wide">Add to portfolio</button></form></div>}
  </main>;
}

function Overview({holdings,totalValue,totalPnl,totalPnlPct,dayPnl,quotes,watchlist,setWatchlist,setTab}) {
  const top=holdings.slice().sort((a,b)=>b.value-a.value).slice(0,5);
  return <div className="page">
    <div className="stats">
      <Stat icon={Wallet} label="Portfolio value" value={money(totalValue)} sub="Current market value"/>
      <Stat icon={TrendingUp} label="Total return" value={money(totalPnl)} sub={pct(totalPnlPct)} positive={totalPnl>=0}/>
      <Stat icon={Activity} label="Today's P&L" value={money(dayPnl)} sub="Based on daily move" positive={dayPnl>=0}/>
      <Stat icon={CircleDollarSign} label="Invested" value={money(holdings.reduce((a,h)=>a+h.cost,0))} sub={`${holdings.length} positions`}/>
    </div>
    <div className="grid2">
      <section className="panel heroChart"><div className="panelhead"><div><span className="eyebrow">PORTFOLIO</span><h2>Holdings performance</h2></div><span className="live"><i/> LIVE</span></div><div className="bigchart"><div className="chartghost"><span>Value</span><b>{money(totalValue)}</b></div><Sparkline data={top.flatMap(h=>h.q?.chart||[])} positive={totalPnl>=0}/></div></section>
      <section className="panel"><div className="panelhead"><div><span className="eyebrow">ALLOCATION</span><h2>By position</h2></div></div><div className="allocation">{top.map((h,i)=><div className="alloc" key={h.id}><div className="allocrow"><span><i className="dot" style={{"--i":i}}/>{h.symbol}</span><b>{totalValue ? (h.value/totalValue*100).toFixed(1):0}%</b></div><div className="bar"><i style={{width:`${totalValue ? h.value/totalValue*100:0}%`}}/></div>)}</div></section>
    </div>
    <section className="panel"><div className="panelhead"><div><span className="eyebrow">POSITIONS</span><h2>Your portfolio</h2></div><button className="textbtn" onClick={()=>setTab("portfolio")}>View all →</button></div><Table holdings={top}/></section>
    <section className="panel"><div className="panelhead"><div><span className="eyebrow">WATCHLIST</span><h2>Market radar</h2></div><button className="textbtn" onClick={()=>setTab("watchlist")}>Manage →</button></div><div className="watchgrid">{watchlist.slice(0,4).map(s=><WatchCard key={s} q={quotes[s]} symbol={s} onRemove={()=>setWatchlist(v=>v.filter(x=>x!==s))}/>)}</div></section>
  </div>
}

function Stat({icon:Icon,label,value,sub,positive}) { return <div className="stat"><div className="staticon"><Icon size={18}/></div><span>{label}</span><strong>{value}</strong><small className={positive===undefined?"":positive?"up":"down"}>{sub}</small></div> }

function Table({holdings,setPortfolio}) { return <div className="tablewrap"><table><thead><tr><th>Asset</th><th>Shares</th><th>Avg. cost</th><th>Price</th><th>Market value</th><th>Return</th></tr></thead><tbody>{holdings.map(h=><tr key={h.id}><td><b className="ticker">{h.symbol}</b><span className="muted">{h.q?.name||"Market asset"}</span></td><td>{h.shares}</td><td>{money(h.avg)}</td><td>{h.q?.price ? money(h.q.price,h.q.currency):"—"}</td><td><b>{money(h.value)}</b></td><td className={h.pnl>=0?"up":"down"}>{money(h.pnl)} <small>({pct(h.pnlPct)})</small></td></tr>)}</tbody></table></div> }

function Portfolio({holdings,setPortfolio}) { return <div className="page"><section className="panel"><div className="panelhead"><div><span className="eyebrow">ALL POSITIONS</span><h2>Portfolio</h2></div><span className="count">{holdings.length} positions</span></div><Table holdings={holdings}/></section><div className="hint"><Star size={18}/><div><b>Tip</b><p>Your positions are saved in this browser. Add the same ticker more than once if you want separate lots.</p></div></div></div> }

function Watchlist({watchlist,quotes,setWatchlist}) { return <div className="page"><div className="watchgrid full">{watchlist.map(s=><WatchCard key={s} q={quotes[s]} symbol={s} onRemove={()=>setWatchlist(v=>v.filter(x=>x!==s))}/>)}</div>{!watchlist.length&&<Empty title="Your watchlist is empty" text="Use the search box above to add a ticker."/>}</div> }

function WatchCard({q,symbol,onRemove}) { return <div className="watchcard"><div className="watchtop"><div><b>{symbol}</b><small>{q?.name||"Loading…"}</small></div><button className="xsmall" onClick={onRemove}><X size={14}/></button></div><div className="watchprice">{q?.price ? money(q.price,q.currency):"—"} <span className={q?.change>=0?"up":"down"}>{q?.changePct!=null?pct(q.changePct):"…"}</span></div><Sparkline data={q?.chart} positive={(q?.changePct||0)>=0}/><div className="watchmeta"><span>Day high <b>{q?.dayHigh ? money(q.dayHigh,q.currency):"—"}</b></span><span>52W high <b>{q?.fiftyTwoHigh ? money(q.fiftyTwoHigh,q.currency):"—"}</b></span></div></div> }

function Alerts({alerts,setAlerts,quotes}) {
  function add(){const s=prompt("Ticker (e.g. NVDA)"); if(!s)return; const p=Number(prompt("Alert price")); if(!p)return; setAlerts(v=>[...v,{id:crypto.randomUUID(),symbol:s.toUpperCase(),price:p,type:"below"}]);}
  return <div className="page"><section className="panel"><div className="panelhead"><div><span className="eyebrow">PRICE ALERTS</span><h2>Alerts</h2></div><button className="primary" onClick={add}><Plus size={17}/> New alert</button></div>{alerts.length?<div className="alertlist">{alerts.map(a=>{const q=quotes[a.symbol]; const hit=q?.price && q.price<=a.price; return <div className="alertrow" key={a.id}><div className="bell"><Bell size={17}/></div><div><b>{a.symbol}</b><span>Notify when price is below {money(a.price)}</span></div><strong className={hit?"up":""}>{q?.price?money(q.price):"—"}</strong><span className={hit?"triggered":"armed"}>{hit?"TRIGGERED":"ARMED"}</span><button className="xsmall" onClick={()=>setAlerts(v=>v.filter(x=>x.id!==a.id))}><X size={15}/></button></div>})}</div>:<Empty title="No alerts yet" text="Create price alerts to keep an eye on important levels."/>}</section></div>
}
function Empty({title,text}) { return <div className="emptybox"><Bell size={22}/><b>{title}</b><p>{text}</p></div> }