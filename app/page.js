"use client";

import { useEffect, useMemo, useState } from "react";

const fmt = (n, digits = 2) => n == null || n === "" || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US",{maximumFractionDigits:digits});
const usd = n => n == null ? "—" : "$" + fmt(n);
const pct = n => n == null ? "—" : fmt(n,1) + "%";
const scoreClass = n => Number(n)>=75 ? "score good" : Number(n)>=55 ? "score mid" : "score low";

export default function Home(){
  const [stocks,setStocks]=useState([]);
  const [tab,setTab]=useState("home");
  const [selected,setSelected]=useState(null);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [ai,setAi]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [watch,setWatch]=useState([]);

  useEffect(()=>{
    fetch("/api/stocks",{cache:"no-store"}).then(r=>r.json()).then(d=>setStocks(d.stocks||[])).catch(()=>{}).finally(()=>setLoading(false));
    try{setWatch(JSON.parse(localStorage.getItem("pulse-watch")||"[]"))}catch{}
  },[]);
  useEffect(()=>localStorage.setItem("pulse-watch",JSON.stringify(watch)),[watch]);

  const ranked=useMemo(()=>[...stocks].sort((a,b)=>Number(b.overall_score||0)-Number(a.overall_score||0)),[stocks]);
  const filtered=ranked.filter(s=>(s.ticker+" "+s.name).toLowerCase().includes(search.toLowerCase()));
  const buys=ranked.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).slice(0,5);
  const watchRows=ranked.filter(s=>watch.includes(s.ticker));

  async function askAI(ticker){
    setAiLoading(true); setAi("");
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker,data:stocks.find(s=>s.ticker===ticker)})});
      const d=await r.json(); setAi(d.text||d.error||"AI ยังไม่ได้เชื่อมต่อ");
    }catch{setAi("เชื่อมต่อ AI ไม่สำเร็จ")}
    finally{setAiLoading(false)}
  }

  return <main className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandIcon">P</div><div><b>Pulsefolio</b><small>US STOCK ANALYSIS</small></div></div>
      <nav>
        <Nav active={tab==="home"} onClick={()=>setTab("home")}>Overview</Nav>
        <Nav active={tab==="rank"} onClick={()=>setTab("rank")}>Stock Ranking</Nav>
        <Nav active={tab==="watch"} onClick={()=>setTab("watch")}>Watchlist <em>{watch.length}</em></Nav>
      </nav>
      <div className="method">
        <span>ANALYSIS MODEL</span>
        <b>Valuation 35%</b><b>Growth 30%</b><b>Quality 20%</b><b>Risk 10%</b><b>News 5%</b>
      </div>
    </aside>

    <section className="main">
      <header className="header">
        <div><span className="eyebrow">PERSONAL INVESTMENT DASHBOARD</span><h1>{tab==="home"?"Market Overview":tab==="rank"?"Stock Ranking":"My Watchlist"}</h1></div>
        <div className="searchbox">⌕<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or company"/></div>
      </header>

      {loading ? <div className="loading">Loading investment data…</div> :
      tab==="home" ? <HomeView stocks={ranked} buys={buys} onOpen={setSelected} onRank={()=>setTab("rank")}/> :
      tab==="rank" ? <Ranking rows={filtered} onOpen={setSelected} watch={watch} setWatch={setWatch}/> :
      <Watchlist rows={watchRows} onOpen={setSelected} watch={watch} setWatch={setWatch}/>
      }

      <footer>Data: Supabase fundamentals + analysis · Market quote: Yahoo Finance · News/AI: OpenAI when connected</footer>
    </section>

    {selected && <StockDrawer stock={selected} onClose={()=>{setSelected(null);setAi("")}} onAI={()=>askAI(selected.ticker)} ai={ai} aiLoading={aiLoading} watch={watch} setWatch={setWatch}/>}
  </main>
}

function Nav({active,onClick,children}){return <button className={active?"nav active":"nav"} onClick={onClick}>{children}</button>}

function HomeView({stocks,buys,onOpen,onRank}){
 const avg=stocks.length?stocks.reduce((a,s)=>a+Number(s.overall_score||0),0)/stocks.length:0;
 return <div className="home">
   <div className="hero"><div><span className="eyebrow">INVESTMENT ENGINE</span><h2>Find good businesses at a good price.</h2><p>Ranking uses the framework we defined: Forward P/E, PEG, growth, quality, risk and fair value.</p></div><div className="heroScore"><span>Universe score</span><strong>{fmt(avg,0)}</strong><small>/ 100</small></div></div>
   <div className="metrics"><Metric label="Stocks analyzed" value={stocks.length}/><Metric label="Buy zone" value={stocks.filter(s=>s.buy_zone==="BUY").length}/><Metric label="Wait" value={stocks.filter(s=>s.buy_zone==="WAIT").length}/><Metric label="Expensive" value={stocks.filter(s=>s.buy_zone==="EXPENSIVE").length}/></div>
   <section className="section"><SectionHead title="Best opportunities" action="View full ranking →" onClick={onRank}/><div className="opps">{buys.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div></section>
   <section className="section"><SectionHead title="How the score works"/><div className="scoreExplain"><Explain n="35%" t="Valuation" d="Forward P/E, PEG and price vs fair-value range."/><Explain n="30%" t="Growth" d="Current, next-year and long-term growth."/><Explain n="20%" t="Quality" d="ROE, margin and financial strength."/><Explain n="10%" t="Risk" d="Beta, cyclicality and valuation risk."/><Explain n="5%" t="News" d="Only counts when real news data is available." /></div></section>
   <div className="notice"><b>Important:</b> current Supabase news table has no rows, so News Score is shown as unavailable rather than pretending the placeholder score is live.</div>
 </div>
}
function Metric({label,value}){return <div className="metric"><span>{label}</span><strong>{value}</strong></div>}
function SectionHead({title,action,onClick}){return <div className="sectionHead"><h3>{title}</h3>{action&&<button onClick={onClick}>{action}</button>}</div>}
function Opportunity({s,onOpen}){return <button className="opportunity" onClick={()=>onOpen(s)}><div className="ticker"><b>{s.ticker}</b><span>{s.name}</span></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div><div className="opBody"><span className={"badge "+s.buy_zone.toLowerCase().replace(" ","-")}>{s.buy_zone}</span><span>PEG {fmt(s.peg,2)}</span><span>Fwd P/E {fmt(s.forward_pe,1)}x</span></div><div className="miniVal">Fair value <b>{usd(s.fair_value_low)}–{usd(s.fair_value_high)}</b></div></button>}
function Explain({n,t,d}){return <div className="explain"><strong>{n}</strong><b>{t}</b><span>{d}</span></div>}

function Ranking({rows,onOpen,watch,setWatch}){
 return <div className="section"><SectionHead title="Ranked by Overall Investment Score" action={rows.length+" stocks"}/><div className="rankTable"><div className="rankHead"><span>#</span><span>Stock</span><span>Score</span><span>Valuation</span><span>Growth</span><span>Quality</span><span>Risk</span><span>Buy zone</span></div>{rows.map((s,i)=><button className="rankRow" key={s.ticker} onClick={()=>onOpen(s)}><span>{i+1}</span><span className="ticker"><b>{s.ticker}</b><small>{s.name}</small></span><span className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</span><span>{fmt(s.valuation_score,0)}</span><span>{fmt(s.growth_score,0)}</span><span>{fmt(s.quality_score,0)}</span><span>{fmt(s.risk_score,0)}</span><span><b className={"badge "+s.buy_zone.toLowerCase()}>{s.buy_zone}</b></span></button>)}</div></div>
}
function Watchlist({rows,onOpen,watch,setWatch}){
 return <div className="section"><SectionHead title="My watchlist" action={rows.length+" tracked"}/>{rows.length?<div className="watchList">{rows.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div>:<div className="empty">ยังไม่มีหุ้นใน Watchlist — เปิดหุ้นจาก Ranking แล้วกด Add to watchlist</div>}</div>
}

function StockDrawer({stock:s,onClose,onAI,ai,aiLoading,watch,setWatch}){
 const isWatch=watch.includes(s.ticker);
 const upside=s.fair_value_base&&s.price?((Number(s.fair_value_base)/Number(s.price)-1)*100):null;
 const pegReliable=!(["Semiconductors"].includes(s.industry)||["Consumer Cyclical"].includes(s.sector)&&Number(s.growth_current||0)>Number(s.growth_next||0)*1.8);
 return <div className="drawerBack" onMouseDown={onClose}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
  <button className="close" onClick={onClose}>×</button>
  <div className="drawerTop"><div><span className="eyebrow">{s.sector} · {s.industry}</span><h2>{s.ticker}</h2><p>{s.name}</p></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div></div>
  <div className="priceLine"><strong>{usd(s.price)}</strong><span>Fair value base {usd(s.fair_value_base)}</span><span className={upside>=0?"up":"down"}>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</span></div>
  <div className="actions2"><button className="primary" onClick={()=>setWatch(w=>isWatch?w.filter(x=>x!==s.ticker):[...w,s.ticker])}>{isWatch?"✓ In watchlist":"+ Add to watchlist"}</button><button className="secondary" onClick={onAI}>{aiLoading?"Analyzing…":"Ask AI to analyze"}</button></div>
  <div className="zone"><span className={"badge "+s.buy_zone.toLowerCase()}>{s.buy_zone}</span><div><small>Buy zone logic</small><b>{usd(s.fair_value_low)} / {usd(s.fair_value_base)} / {usd(s.fair_value_high)}</b></div></div>
  <Block title="Valuation"><Grid items={[["Forward P/E",s.forward_pe?fmt(s.forward_pe,1)+"x":"—"],["PEG",s.peg?fmt(s.peg,2):"—"],["Industry Fwd P/E",s.industry_forward_pe?fmt(s.industry_forward_pe,1)+"x":"—"],["Trailing P/E",s.trailing_pe?fmt(s.trailing_pe,1)+"x":"N/A"]]}/></Block>
  <Block title="Growth"><Grid items={[["Current",pct(s.growth_current)],["Next year",pct(s.growth_next)],["Long term",pct(s.growth_long)],["Revenue",pct(s.revenue_growth)]}/></Block>
  <Block title="Business quality & risk"><Grid items={[["ROE",pct(s.roe)],["Profit margin",pct(s.profit_margin)],["Debt / Equity",fmt(s.debt_to_equity,2)],["Beta",fmt(s.beta,2)]}/></Block>
  <div className="reliability"><b>PEG reliability</b><span>{pegReliable?"Usable, but still compare with earnings stability.":"Lower confidence: cyclical/unstable earnings can distort PEG."}</span></div>
  <Block title="Why this score"><p className="explanation">{s.explanation}</p></Block>
  {ai&&<div className="aiResult"><b>AI analysis</b><p>{ai}</p></div>}
  <p className="drawerNote">AI must use the numbers shown here and must not invent missing fundamentals. This is an analysis aid, not financial advice.</p>
 </aside></div>
}
function Block({title,children}){return <section className="block"><h3>{title}</h3>{children}</section>}
function Grid({items}){return <div className="dataGrid">{items.map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div>}
