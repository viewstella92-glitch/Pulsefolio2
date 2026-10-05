"use client";

import { useEffect, useMemo, useState } from "react";

const fmt=(n,d=2)=>n==null||n===""||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:d});
const usd=n=>n==null?"—":"$"+fmt(n);
const pct=n=>n==null?"—":fmt(n,1)+"%";
const scoreClass=n=>Number(n)>=75?"score good":Number(n)>=55?"score mid":"score low";
const badgeClass=s=>(s||"").toLowerCase().replaceAll(" ","-");
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const dateShort=x=>x?new Date(x).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";

export default function Home(){
  const [stocks,setStocks]=useState([]),[tab,setTab]=useState("home"),[selected,setSelected]=useState(null),[search,setSearch]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[ai,setAi]=useState(""),[aiLoading,setAiLoading]=useState(false),[watch,setWatch]=useState([]);
  const [quotes,setQuotes]=useState({}),[news,setNews]=useState([]),[earnings,setEarnings]=useState([]),[portfolio,setPortfolio]=useState({});\n  const [changes,setChanges]=useState([]),[lastUpdate,setLastUpdate]=useState(null),[brief,setBrief]=useState(""),[briefLoading,setBriefLoading]=useState(false);
  const load=async()=>{
    setLoading(true);
    try{
      const [s,q,n,e]=await Promise.all([fetch("/api/stocks",{cache:"no-store"}),fetch("/api/market",{cache:"no-store"}),fetch("/api/news",{cache:"no-store"}),fetch("/api/earnings",{cache:"no-store"})]);
      const sd=await s.json(),qd=await q.json(),nd=await n.json(),ed=await e.json();
      if(!s.ok || sd.error) throw new Error(sd.error||"โหลดข้อมูลหุ้นไม่สำเร็จ");
      setStocks(sd.stocks||[]);
      setError("");
      setQuotes(Object.fromEntries((qd.quotes||[]).map(x=>[x.ticker,x])));
      setNews(nd.news||[]);setEarnings(ed.earnings||[]);setChanges(cd.changes||[]);setLastUpdate(cd.lastUpdate||null);
    }catch(e){setError(e?.message||"ไม่สามารถโหลดข้อมูลได้")}finally{setLoading(false)}
  };
  useEffect(()=>{load();try{setWatch(JSON.parse(localStorage.getItem("pulse-watch")||"[]"));setPortfolio(JSON.parse(localStorage.getItem("pulse-portfolio")||"{}"))}catch{}},[]);
  useEffect(()=>localStorage.setItem("pulse-watch",JSON.stringify(watch)),[watch]);
  useEffect(()=>localStorage.setItem("pulse-portfolio",JSON.stringify(portfolio)),[portfolio]);
  const merged=useMemo(()=>stocks.map(s=>({...s,...(quotes[s.ticker]||{}),db_price:s.price})),[stocks,quotes]);
  const ranked=useMemo(()=>[...merged].sort((a,b)=>Number(b.overall_score||0)-Number(a.overall_score||0)),[merged]);
  const filtered=ranked.filter(s=>(s.ticker+" "+s.name).toLowerCase().includes(search.toLowerCase()));
  const buys=ranked.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).slice(0,5);
  const watchRows=ranked.filter(s=>watch.includes(s.ticker));
  const newsRows=search?news.filter(n=>(n.ticker+" "+n.title).toLowerCase().includes(search.toLowerCase())).slice(0,20):news.slice(0,12);
  const portfolioRows=Object.entries(portfolio).map(([ticker,p])=>{const s=merged.find(x=>x.ticker===ticker);const price=Number(quotes[ticker]?.price||s?.price||0);const qty=Number(p.qty||0);const avg=Number(p.avg||0);return {...s,ticker,qty,avg,price,value:qty*price,cost:qty*avg,pnl:qty*(price-avg)}}).filter(x=>x.qty>0);
  const totalValue=portfolioRows.reduce((a,x)=>a+x.value,0),totalCost=portfolioRows.reduce((a,x)=>a+x.cost,0),totalPnl=totalValue-totalCost;
  async function askAI(ticker){setAiLoading(true);setAi("");try{const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker,data:merged.find(s=>s.ticker===ticker)})});const d=await r.json();setAi(d.text||d.error||"AI ยังไม่ได้เชื่อมต่อ")}catch{setAi("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setAiLoading(false)}}
  return <main className="app">
    <aside className="sidebar"><div className="brand"><div className="brandIcon">P</div><div><b>Pulsefolio</b><small>US STOCK ANALYSIS</small></div></div><nav>
      <Nav active={tab==="home"} onClick={()=>setTab("home")}>Overview</Nav><Nav active={tab==="rank"} onClick={()=>setTab("rank")}>Stock Ranking</Nav><Nav active={tab==="watch"} onClick={()=>setTab("watch")}>Watchlist <em>{watch.length}</em></Nav><Nav active={tab==="portfolio"} onClick={()=>setTab("portfolio")}>Portfolio <em>{portfolioRows.length}</em></Nav>
    </nav><div className="method"><span>ANALYSIS MODEL</span><b>Valuation 35%</b><b>Growth 30%</b><b>Quality 20%</b><b>Risk 10%</b><b>News 5%</b><small>Prices are market data and may be delayed.</small></div></aside>
    <section className="main"><header className="header"><div><span className="eyebrow">PERSONAL INVESTMENT DASHBOARD</span><h1>{tab==="home"?"Market Overview":tab==="rank"?"Stock Ranking":tab==="watch"?"My Watchlist":"My Portfolio"}</h1></div><div className="searchbox">⌕<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or company"/></div></header>
      {loading?<div className="loading">Loading market data…</div>:error?<div className="errorCard"><b>ยังโหลดข้อมูลสกอร์ไม่ได้</b><span>{error}</span><button className="primary" onClick={load}>ลองใหม่</button><small>ถ้ายังไม่ขึ้น ปัญหาอยู่ที่การเชื่อมต่อ API ไม่ใช่หน้าแสดงผล</small></div>:tab==="home"?<HomeView stocks={ranked} buys={buys} portfolioRows={portfolioRows} totalValue={totalValue} totalPnl={totalPnl} news={newsRows} earnings={earnings} changes={changes} lastUpdate={lastUpdate} brief={brief} briefLoading={briefLoading} onBrief={askBrief} onOpen={setSelected} onRank={()=>setTab("rank")} onReload={load}/>:tab==="rank"?<Ranking rows={filtered} onOpen={setSelected}/>:tab==="watch"?<Watchlist rows={watchRows} onOpen={setSelected}/>:<Portfolio rows={portfolioRows} totalValue={totalValue} totalCost={totalCost} totalPnl={totalPnl} onOpen={setSelected}/>}
      <footer>Fundamentals & analysis: Supabase · Quotes: Yahoo Finance · News/Earnings: public Yahoo/Google RSS & Yahoo calendar · AI: Gemini optional</footer>
    </section>
    {selected&&<StockDrawer stock={selected} onClose={()=>{setSelected(null);setAi("")}} onAI={()=>askAI(selected.ticker)} ai={ai} aiLoading={aiLoading} watch={watch} setWatch={setWatch} portfolio={portfolio} setPortfolio={setPortfolio}/>}
  </main>
}

function Nav({active,onClick,children}){return <button className={active?"nav active":"nav"} onClick={onClick}>{children}</button>}
function Metric({label,value,sub}){return <div className="metric"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
function SectionHead({title,action,onClick}){return <div className="sectionHead"><h3>{title}</h3>{action&&<button onClick={onClick}>{action}</button>}</div>}

function HomeView({stocks,buys,portfolioRows,totalValue,totalPnl,news,earnings,changes,lastUpdate,brief,briefLoading,onBrief,onOpen,onRank,onReload}){
 const avg=stocks.length?stocks.reduce((a,s)=>a+Number(s.overall_score||0),0)/stocks.length:0;
 return <div className="home"><div className="hero"><div><span className="eyebrow">INVESTMENT ENGINE</span><h2>Find good businesses at a good price.</h2><p>Valuation, growth, quality, risk and fair value are combined into one practical ranking.</p><div className="heroActions"><button className="primary" onClick={onRank}>Open ranking</button><button className="secondary" onClick={onReload}>Refresh market data</button></div></div><div className="heroScore"><span>Universe score</span><strong>{fmt(avg,0)}</strong><small>/ 100</small></div></div>
 <div className="metrics"><Metric label="Stocks analyzed" value={stocks.length}/><Metric label="Buy zone" value={stocks.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).length}/><Metric label="Data status" value={lastUpdate?.status==="success"?"Auto-updated":"Ready"} sub={lastUpdate?.finished_at?"Last sync "+new Date(lastUpdate.finished_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Daily refresh enabled"}/><Metric label="Portfolio value" value={totalValue?money(totalValue):"—"} sub={totalPnl?((totalPnl>=0?"+":"")+money(totalPnl)+" P/L"):"No holdings yet"}/></div>
 <section className="section"><SectionHead title="Best opportunities" action="View full ranking →" onClick={onRank}/><div className="opps">{buys.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div></section>
 <section className="section intelligence"><div className="intelHead"><div><span className="eyebrow">AI INVESTMENT BRIEF</span><h3>What matters right now</h3></div><button className="primary" onClick={onBrief}>{briefLoading?"Analyzing…":"Generate brief"}</button></div>{brief?<div className="brief">{brief}</div>:<div className="empty compact">กด Generate brief เพื่อให้ Gemini สรุปภาพรวมจากข้อมูลใน Dashboard โดยไม่เติมตัวเลขเอง</div>}</section>\n <section className="section"><SectionHead title="What changed since the last update" action={changes.length?changes.length+" signals":"No changes yet"}/>{changes.length?<div className="changes">{changes.slice(0,6).map(x=><ChangeItem key={x.ticker} x={x}/>)}</div>:<div className="empty compact">ยังไม่มี snapshot ก่อนหน้า ระบบจะเริ่มเก็บประวัติหลังการ sync ครั้งถัดไป</div>}</section>\n <section className="section"><SectionHead title="Market news" action={news.length?news.length+" headlines":""}/>{news.length?<div className="newsList">{news.map((n,i)=><NewsItem key={n.url||i} n={n}/>)}</div>:<div className="empty">ยังไม่มีข่าวจากแหล่งข้อมูลฟรีในขณะนี้</div>}</section>
 <section className="section"><SectionHead title="Upcoming earnings" action={earnings.length?earnings.length+" tracked":"Unavailable"}/>{earnings.length?<div className="earnGrid">{earnings.slice(0,8).map(e=><div className="earnCard" key={e.ticker}><b>{e.ticker}</b><span>{dateShort(e.date)} {e.estimated?"· estimate":""}</span>{e.epsAverage!=null&&<small>EPS est. {fmt(e.epsAverage,2)}</small>}</div>)}</div>:<div className="notice">Earnings dates could not be fetched right now. The app will retry on refresh; no dates are invented.</div>}</section>
 <section className="section"><SectionHead title="How the score works"/><div className="scoreExplain"><Explain n="35%" t="Valuation" d="Forward P/E, PEG and price vs fair value."/><Explain n="30%" t="Growth" d="Current, next-year and long-term growth."/><Explain n="20%" t="Quality" d="ROE, margin and financial strength."/><Explain n="10%" t="Risk" d="Beta, cyclicality and valuation risk."/><Explain n="5%" t="News" d="Reserved for real news sentiment; current base score does not pretend placeholder news is live." /></div></section>
 <div className="notice"><b>Data rule:</b> Missing numbers are shown as “—”; the AI is instructed not to invent fundamentals. Yahoo market prices can be delayed.</div></div>
}
function ChangeItem({x}){const sc=Number(x.score_change||0),pc=Number(x.price_change_pct||0);return <div className="changeItem"><div><b>{x.ticker}</b><span>{x.reason}</span></div><strong className={sc>=0?"up":"down"}>{x.score_change==null?"—":(sc>=0?"+":"")+fmt(sc,1)+" pts"}</strong><small className={pc>=0?"up":"down"}>{x.price_change_pct==null?"":(pc>=0?"+":"")+fmt(pc,1)+"%"}</small></div>}\nfunction Explain({n,t,d}){return <div className="explain"><strong>{n}</strong><b>{t}</b><span>{d}</span></div>}
function Opportunity({s,onOpen}){const price=s.price;const change=s.changePct;return <button className="opportunity" onClick={()=>onOpen(s)}><div className="ticker"><b>{s.ticker}</b><span>{s.name}</span></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div><div className="opBody"><span className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</span><span>PEG {fmt(s.peg,2)}</span><span>Fwd P/E {fmt(s.forward_pe,1)}x</span></div><div className="miniVal">Price <b>{usd(price)} <i className={change>=0?"up":"down"}>{change==null?"":(change>=0?"+":"")+fmt(change,1)+"%"}</i></b></div></button>}

function Ranking({rows,onOpen}){return <div className="section"><SectionHead title="Ranked by Overall Investment Score" action={rows.length+" stocks"}/><div className="rankTable"><div className="rankHead"><span>#</span><span>Stock</span><span>Price</span><span>Score</span><span>Valuation</span><span>Growth</span><span>Quality</span><span>Zone</span></div>{rows.map((s,i)=><button className="rankRow" key={s.ticker} onClick={()=>onOpen(s)}><span>{i+1}</span><span className="ticker"><b>{s.ticker}</b><small>{s.name}</small></span><span>{usd(s.price)}</span><span className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</span><span>{fmt(s.valuation_score,0)}</span><span>{fmt(s.growth_score,0)}</span><span>{fmt(s.quality_score,0)}</span><span><b className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</b></span></button>)}</div></div>}
function Watchlist({rows,onOpen}){return <div className="section"><SectionHead title="My watchlist" action={rows.length+" tracked"}/>{rows.length?<div className="watchList">{rows.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div>:<div className="empty">ยังไม่มีหุ้นใน Watchlist — เปิดหุ้นจาก Ranking แล้วกด Add to watchlist</div>}</div>}

function Portfolio({rows,totalValue,totalCost,totalPnl,onOpen}){const ret=totalCost?(totalPnl/totalCost)*100:null;return <div className="portfolioPage"><div className="portfolioCards"><Metric label="Current value" value={money(totalValue)}/><Metric label="Cost basis" value={money(totalCost)}/><Metric label="P/L" value={(totalPnl>=0?"+":"")+money(totalPnl)} sub={ret==null?"":(ret>=0?"+":"")+fmt(ret,1)+"%"}/></div><div className="section"><SectionHead title="Holdings" action={rows.length+" positions"}/>{rows.length?<div className="holdings">{rows.map(s=><button className="holding" key={s.ticker} onClick={()=>onOpen(s)}><span><b>{s.ticker}</b><small>{fmt(s.qty,4)} shares · avg {usd(s.avg)}</small></span><span><b>{money(s.value)}</b><small className={s.pnl>=0?"up":"down"}>{s.pnl>=0?"+":""}{money(s.pnl)}</small></span></button>)}</div>:<div className="empty">ยังไม่มีหุ้นใน Portfolio — เปิดหุ้นแล้วกรอกจำนวนหุ้นและต้นทุนเฉลี่ย</div>}</div></div>}

function NewsItem({n}){return <a className="newsItem" href={n.url||"#"} target="_blank" rel="noreferrer"><span className="newsTicker">{n.ticker}</span><div><b>{n.title}</b><small>{n.source||"News"} · {n.publishedAt?dateShort(n.publishedAt):""}</small></div></a>}

function StockDrawer({stock:s,onClose,onAI,ai,aiLoading,watch,setWatch,portfolio,setPortfolio}){
 const isWatch=watch.includes(s.ticker),[qty,setQty]=useState(portfolio[s.ticker]?.qty||""),[avg,setAvg]=useState(portfolio[s.ticker]?.avg||"");
 const price=Number(s.price||s.db_price||0),upside=s.fair_value_base&&price?((Number(s.fair_value_base)/price-1)*100):null;
 const pegReliable=!((s.industry||"").toLowerCase().includes("semiconductor")||((s.sector||"").toLowerCase().includes("consumer")&&Number(s.growth_current||0)>Number(s.growth_next||0)*1.8));
 function saveHolding(){const q=Number(qty),a=Number(avg);if(q>0&&a>0)setPortfolio(p=>({...p,[s.ticker]:{qty:q,avg:a}}));else setPortfolio(p=>{const x={...p};delete x[s.ticker];return x})}
 return <div className="drawerBack" onMouseDown={onClose}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={onClose}>×</button>
 <div className="drawerTop"><div><span className="eyebrow">{s.sector} · {s.industry}</span><h2>{s.ticker}</h2><p>{s.name}</p></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div></div>
 <div className="priceLine"><strong>{usd(price)}</strong><span>Fair value {usd(s.fair_value_base)}</span><span className={upside>=0?"up":"down"}>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</span></div><div className="freshness">Data updated {s.updated_at?new Date(s.updated_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"} · {s.data_source||"Supabase"}</div>
 <div className="actions2"><button className="primary" onClick={()=>setWatch(w=>isWatch?w.filter(x=>x!==s.ticker):[...w,s.ticker])}>{isWatch?"✓ In watchlist":"+ Add to watchlist"}</button><button className="secondary" onClick={onAI}>{aiLoading?"Analyzing…":"Ask Gemini to analyze"}</button></div>
 <div className="zone"><span className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</span><div><small>Fair value range</small><b>{usd(s.fair_value_low)} / {usd(s.fair_value_base)} / {usd(s.fair_value_high)}</b></div></div>
 <Block title="Portfolio position"><div className="positionForm"><label>Shares<input type="number" min="0" step="any" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/></label><label>Average cost<input type="number" min="0" step="any" value={avg} onChange={e=>setAvg(e.target.value)} placeholder="0.00"/></label><button className="primary" onClick={saveHolding}>Save position</button></div></Block>
 <Block title="Valuation"><Grid items={[["Forward P/E",s.forward_pe?fmt(s.forward_pe,1)+"x":"—"],["PEG",s.peg?fmt(s.peg,2):"—"],["Industry Fwd P/E",s.industry_forward_pe?fmt(s.industry_forward_pe,1)+"x":"—"],["Trailing P/E",s.trailing_pe?fmt(s.trailing_pe,1)+"x":"N/A"]]}/></Block>
 <Block title="Growth"><Grid items={[["Current",pct(s.growth_current)],["Next year",pct(s.growth_next)],["Long term",pct(s.growth_long)],["Revenue",pct(s.revenue_growth)]]}/></Block>
 <Block title="Business quality & risk"><Grid items={[["ROE",pct(s.roe)],["Profit margin",pct(s.profit_margin)],["Free cash flow",usd(s.free_cash_flow)],["Debt / Equity",fmt(s.debt_to_equity,2)],["Beta",fmt(s.beta,2)]]}/></Block>
 <div className="reliability"><b>PEG reliability</b><span>{pegReliable?"Usable, but compare with earnings stability and cycle position.":"Lower confidence: cyclical/unstable earnings can distort PEG, so valuation should rely less on PEG."}</span></div>
 <Block title="Why this score"><p className="explanation">{s.explanation||"No explanation available."}</p></Block>
 {ai&&<div className="aiResult"><b>Gemini analysis</b><p>{ai}</p></div>}<p className="drawerNote">AI is an analysis aid, not financial advice. It uses only data supplied by this dashboard.</p>
 </aside></div>
}
function Block({title,children}){return <section className="block"><h3>{title}</h3>{children}</section>}
function Grid({items}){return <div className="dataGrid">{items.map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div>}
