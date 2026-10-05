"use client";

import { useEffect, useMemo, useState } from "react";

const fmt=(n,d=2)=>n==null||n===""||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:d});
const usd=n=>n==null?"—":"$"+fmt(n);
const pct=n=>n==null?"—":fmt(n,1)+"%";
const scoreClass=n=>Number(n)>=75?"score good":Number(n)>=55?"score mid":"score low";
const badgeClass=s=>(s||"").toLowerCase().replaceAll(" ","-");
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const dateShort=x=>x?new Date(x).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";
const extractAnalystTarget=(items,price)=>{
  for(const n of (items||[])){
    const text=`${n.title||""} ${n.summary||""}`;
    if(!/(price target|target price|target to|target of|ราคาเป้าหมาย|เป้าหมาย)/i.test(text)) continue;
    const m=text.match(/(?:price target|target price|target(?: to| of)?|ราคาเป้าหมาย|เป้าหมาย)[^$]{0,35}\$\s*([0-9]+(?:\.[0-9]+)?)/i)||text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:price target|target)/i);
    if(m&&Number(m[1])>0){const target=Number(m[1]);return {target,upside:price?((target/price-1)*100):null,source:n.source||"ข่าว",title:n.title||"",url:n.url||""};}
  }
  return null;
};

export default function Home(){
  const [stocks,setหุ้นs]=useState([]),[tab,setTab]=useState("home"),[selected,setSelected]=useState(null),[search,setSearch]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[ai,setAi]=useState(""),[aiLoading,setAiLoading]=useState(false),[watch,setWatch]=useState([]);
  const [quotes,setQuotes]=useState({}),[news,setข่าว]=useState([]),[earnings,setEarnings]=useState([]),[portfolio,setพอร์ตลงทุน]=useState({});
  const [changes,setChanges]=useState([]),[lastUpdate,setLastUpdate]=useState(null),[brief,setBrief]=useState(""),[briefLoading,setBriefLoading]=useState(false),[syncLoading,setSyncLoading]=useState(false),[earnBrief,setEarnBrief]=useState(""),[earnLoading,setEarnLoading]=useState(false),[changeAI,setChangeAI]=useState({}),[changeAILoading,setChangeAILoading]=useState("");
  const load=async()=>{
    setLoading(true);
    try{
      const [s,q,n,e,ch]=await Promise.all([fetch("/api/stocks",{cache:"no-store"}),fetch("/api/market",{cache:"no-store"}),fetch("/api/news",{cache:"no-store"}),fetch("/api/earnings",{cache:"no-store"}),fetch("/api/changes",{cache:"no-store"})]);
      const sd=await s.json(),qd=await q.json(),nd=await n.json(),ed=await e.json(),cd=await ch.json();
      if(!s.ok || sd.error) throw new Error(sd.error||"โหลดข้อมูลหุ้นไม่สำเร็จ");
      setหุ้นs(sd.stocks||[]);
      setError("");
      setQuotes(Object.fromEntries((qd.quotes||[]).map(x=>[x.ticker,x])));
      setข่าว(nd.news||[]);setEarnings(ed.earnings||[]);setChanges(cd.changes||[]);setLastUpdate(cd.lastUpdate||null);
    }catch(e){setError(e?.message||"ไม่สามารถโหลดข้อมูลได้")}finally{setLoading(false)}
  };
  useEffect(()=>{load();try{setWatch(JSON.parse(localStorage.getItem("pulse-watch")||"[]"));setพอร์ตลงทุน(JSON.parse(localStorage.getItem("pulse-portfolio")||"{}"))}catch{}},[]);
  useEffect(()=>localStorage.setItem("pulse-watch",JSON.stringify(watch)),[watch]);
  useEffect(()=>localStorage.setItem("pulse-portfolio",JSON.stringify(portfolio)),[portfolio]);
  const merged=useMemo(()=>stocks.map(s=>({...s,...(quotes[s.ticker]||{}),db_price:s.price})),[stocks,quotes]);
  const ranked=useMemo(()=>[...merged].sort((a,b)=>Number(b.overall_score||0)-Number(a.overall_score||0)),[merged]);
  const filtered=ranked.filter(s=>(s.ticker+" "+s.name).toLowerCase().includes(search.toLowerCase()));
  const buys=ranked.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).slice(0,5);
  const watchRows=ranked.filter(s=>watch.includes(s.ticker));
  const newsRows=search?news.filter(n=>(n.ticker+" "+n.title).toLowerCase().includes(search.toLowerCase())).slice(0,20):news.slice(0,12);
  const openStock=s=>setSelected({...s,news:news.filter(n=>n.ticker===s.ticker)});
  const portfolioRows=Object.entries(portfolio).map(([ticker,p])=>{const s=merged.find(x=>x.ticker===ticker);const price=Number(quotes[ticker]?.price||s?.price||0);const qty=Number(p.qty||0);const avg=Number(p.avg||0);return {...s,ticker,qty,avg,price,value:qty*price,cost:qty*avg,pnl:qty*(price-avg)}}).filter(x=>x.qty>0);
  const totalValue=portfolioRows.reduce((a,x)=>a+x.value,0),totalCost=portfolioRows.reduce((a,x)=>a+x.cost,0),totalPnl=totalValue-totalCost;
  async function earningsBrief(){setEarnLoading(true);try{const r=await fetch("/api/ai/earnings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({earnings,stocks:ranked})});const d=await r.json();setEarnBrief(d.text||d.error||"AI ยังไม่ได้ส่งคำตอบ")}catch{setEarnBrief("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setEarnLoading(false)}}
  async function syncNow(){setSyncLoading(true);try{await fetch("/api/cron/sync",{cache:"no-store"});await load()}finally{setSyncLoading(false)}}
  async function askBrief(){setBriefLoading(true);try{const r=await fetch("/api/ai/brief",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({stocks:ranked,changes,news})});const d=await r.json();setBrief(d.text||d.error||"AI ยังไม่ได้ส่งคำตอบ")}catch{setBrief("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setBriefLoading(false)}}
  async function askAI(ticker){setAiLoading(true);setAi("");try{const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker,data:merged.find(s=>s.ticker===ticker),news:news.filter(n=>n.ticker===ticker).slice(0,8)})});const d=await r.json();setAi(d.text||d.error||"AI ยังไม่ได้เชื่อมต่อ")}catch{setAi("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setAiLoading(false)}}
  async function explainChange(x){setChangeAILoading(x.ticker);try{const r=await fetch("/api/ai/change",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker:x.ticker,current:x.current,previous:x.previous,earnings:earnings.find(e=>e.ticker===x.ticker)||null,news:news.filter(n=>n.ticker===x.ticker).slice(0,5)})});const d=await r.json();setChangeAI(v=>({...v,[x.ticker]:d.text||d.error||"AI ยังไม่ได้ส่งคำตอบ"}))}catch{setChangeAI(v=>({...v,[x.ticker]:"เชื่อมต่อ AI ไม่สำเร็จ"}))}finally{setChangeAILoading("")}}
  return <main className="app">
    <aside className="sidebar"><div className="brand"><div className="brandIcon">P</div><div><b>Pulsefolio</b><small>วิเคราะห์หุ้นสหรัฐฯ</small></div></div><nav>
      <Nav active={tab==="home"} onClick={()=>setTab("home")}>ภาพรวม</Nav><Nav active={tab==="rank"} onClick={()=>setTab("rank")}>จัดอันดับหุ้น</Nav><Nav active={tab==="watch"} onClick={()=>setTab("watch")}>รายการติดตาม <em>{watch.length}</em></Nav><Nav active={tab==="portfolio"} onClick={()=>setTab("portfolio")}>พอร์ตลงทุน <em>{portfolioRows.length}</em></Nav>
    </nav><div className="method"><span>โมเดลวิเคราะห์</span><b>มูลค่า/ราคา 35%</b><b>การเติบโต 30%</b><b>คุณภาพ 20%</b><b>ความเสี่ยง 10%</b><b>ข่าว 5%</b><small>ราคาตลาดอาจมีความล่าช้า</small></div></aside>
    <section className="main"><header className="header"><div><span className="eyebrow">แดชบอร์ดการลงทุนส่วนตัว</span><h1>{tab==="home"?"ภาพรวมตลาด":tab==="rank"?"จัดอันดับหุ้น":tab==="watch"?"รายการติดตาม":"พอร์ตลงทุน"}</h1></div><div className="searchbox">⌕<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อหุ้นหรือบริษัท"/></div></header>
      {loading?<div className="loading">กำลังโหลดข้อมูลตลาด…</div>:error?<div className="errorCard"><b>ยังโหลดข้อมูลสกอร์ไม่ได้</b><span>{error}</span><button className="primary" onClick={load}>ลองใหม่</button><small>ถ้ายังไม่ขึ้น ปัญหาอยู่ที่การเชื่อมต่อ API ไม่ใช่หน้าแสดงผล</small></div>:tab==="home"?<HomeView stocks={ranked} buys={buys} portfolioRows={portfolioRows} totalValue={totalValue} totalPnl={totalPnl} news={newsRows} earnings={earnings} changes={changes} lastUpdate={lastUpdate} brief={brief} briefLoading={briefLoading} syncLoading={syncLoading} earnBrief={earnBrief} earnLoading={earnLoading} changeAI={changeAI} changeAILoading={changeAILoading} onBrief={askBrief} onEarningsBrief={earningsBrief} onExplainChange={explainChange} onSync={syncNow} onOpen={openStock} onRank={()=>setTab("rank")} onReload={load}/>:tab==="rank"?<Ranking rows={filtered} onOpen={openStock}/>:tab==="watch"?<รายการติดตาม rows={watchRows} onOpen={openStock}/>:<พอร์ตลงทุน rows={portfolioRows} totalValue={totalValue} totalCost={totalCost} totalPnl={totalPnl} onOpen={openStock}/>}
      <footer>ข้อมูลพื้นฐานและการวิเคราะห์ · ราคาตลาด: Yahoo Finance · ข่าวและงบ: Yahoo/Google · AI: Gemini</footer>
    </section>
    {selected&&<หุ้นDrawer stock={selected} onClose={()=>{setSelected(null);setAi("")}} onAI={()=>askAI(selected.ticker)} ai={ai} aiLoading={aiLoading} watch={watch} setWatch={setWatch} portfolio={portfolio} setพอร์ตลงทุน={setพอร์ตลงทุน}/>}
  </main>
}

function Nav({active,onClick,children}){return <button className={active?"nav active":"nav"} onClick={onClick}>{children}</button>}
function Metric({label,value,sub}){return <div className="metric"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
function SectionHead({title,action,onClick}){return <div className="sectionHead"><h3>{title}</h3>{action&&<button onClick={onClick}>{action}</button>}</div>}

function HomeView({stocks,buys,portfolioRows,totalValue,totalPnl,news,earnings,changes,lastUpdate,brief,briefLoading,syncLoading,earnBrief,earnLoading,changeAI,changeAILoading,onBrief,onEarningsBrief,onExplainChange,onSync,onOpen,onRank,onReload}){
 const avg=stocks.length?stocks.reduce((a,s)=>a+Number(s.overall_score||0),0)/stocks.length:0;
 return <div className="home"><div className="hero"><div><span className="eyebrow">เครื่องมือวิเคราะห์การลงทุน</span><h2>ค้นหาธุรกิจที่ดีในราคาที่เหมาะสม</h2><p>มูลค่า/ราคา, ระบบรวมมูลค่า การเติบโต คุณภาพ ความเสี่ยง และมูลค่ายุติธรรมเพื่อจัดอันดับหุ้น</p><div className="heroActions"><button className="primary" onClick={onRank}>ดูอันดับหุ้น</button><button className="secondary" onClick={onReload}>อัปเดตราคาและข่าว</button><button className="secondary" onClick={onSync}>{syncLoading?"กำลังซิงก์…":"ซิงก์ข้อมูลพื้นฐาน"}</button></div></div><div className="heroคะแนน"><span>คะแนนภาพรวม</span><strong>{fmt(avg,0)}</strong><small>/ 100</small></div></div>
 <div className="metrics"><Metric label="หุ้นที่วิเคราะห์" value={stocks.length}/><Metric label="โซนซื้อ" value={stocks.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).length}/><Metric label="สถานะข้อมูล" value={lastUpdate?.status==="success"?"อัปเดตอัตโนมัติ":"พร้อมใช้งาน"} sub={lastUpdate?.finished_at?"ซิงก์ล่าสุด "+new Date(lastUpdate.finished_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"เปิดอัปเดตรายวัน"}/><Metric label="พอร์ตลงทุน value" value={totalValue?money(totalValue):"—"} sub={totalPnl?((totalPnl>=0?"+":"")+money(totalPnl)+" กำไร/ขาดทุน"):"ยังไม่มีหุ้นในพอร์ต"}/></div>
 <section className="section"><SectionHead title="โอกาสที่น่าสนใจ" action="ดูอันดับทั้งหมด →" onClick={onRank}/><div className="opps">{buys.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div></section>
 <section className="section intelligence"><div className="intelHead"><div><span className="eyebrow">AI INVESTMENT BRIEF</span><h3>สิ่งที่สำคัญตอนนี้</h3></div><button className="primary" onClick={onBrief}>{briefLoading?"กำลังวิเคราะห์…":"สร้างสรุปด้วย AI"}</button></div>{brief?<div className="brief">{brief}</div>:<div className="empty compact">กด สร้างสรุปด้วย AI เพื่อให้ Gemini สรุปภาพรวมจากข้อมูลใน Dashboard โดยไม่เติมตัวเลขเอง</div>}</section>
 <section className="section"><SectionHead title="มีอะไรเปลี่ยนจากครั้งก่อน" action={changes.length?changes.length+" signals":"ยังไม่มีการเปลี่ยนแปลง"}/>{changes.length?<div className="changes">{changes.slice(0,6).map(x=><ChangeItem key={x.ticker} x={x} ai={changeAI[x.ticker]} loading={changeAILoading===x.ticker} onExplain={onExplainChange}/>)}</div>:<div className="empty compact">ยังไม่มี snapshot ก่อนหน้า ระบบจะเริ่มเก็บประวัติหลังการ sync ครั้งถัดไป</div>}</section>
 <section className="section"><SectionHead title="ข่าวตลาด" action={news.length?news.length+" ข่าว":""}/>{news.length?<div className="newsList">{news.map((n,i)=><ข่าวItem key={n.url||i} n={n}/>)}</div>:<div className="empty">ยังไม่มีข่าวจากแหล่งข้อมูลฟรีในขณะนี้</div>}</section>
 <section className="section"><div className="intelHead"><div><span className="eyebrow">วิเคราะห์ช่วงประกาศงบ</span><h3>อะไรที่ควรจับตา</h3></div><button className="primary" onClick={onEarningsBrief}>{earnLoading?"กำลังวิเคราะห์…":"วิเคราะห์งบ"}</button></div>{earnBrief&&<div className="brief">{earnBrief}</div>}<SectionHead title="กำหนดประกาศงบ" action={earnings.length?earnings.length+" รายการ":"ไม่มีข้อมูล"}/>{earnings.length?<div className="earnGrid">{earnings.slice(0,8).map(e=><div className="earnCard" key={e.ticker}><b>{e.ticker}</b><span>{dateShort(e.date)} {e.ประมาณการd?"· ประมาณการ":""}</span>{e.epsAverage!=null&&<small>EPS ประมาณการ {fmt(e.epsAverage,2)}</small>}</div>)}</div>:<div className="notice">Earnings dates could not be fetched right now. The app will retry on refresh; no dates are invented.</div>}</section>
 <section className="section"><SectionHead title="คะแนนลงทุนคำนวณอย่างไร"/><div className="scoreExplain"><Explain n="35%" t="มูลค่า/ราคา" d="Forward P/E, PEG and price vs fair value."/><Explain n="30%" t="การเติบโต" d="ปัจจุบัน, next-year and long-term growth."/><Explain n="20%" t="คุณภาพ" d="ROE, margin and financial strength."/><Explain n="10%" t="ความเสี่ยง" d="Beta, cyclicality and valuation risk."/><Explain n="5%" t="ข่าว" d="Reserved for real news sentiment; current base score does not pretend placeholder news is live." /></div></section>
 <div className="notice"><b>กฎข้อมูล:</b> ข้อมูลที่ไม่มีจะแสดงเป็น “—” และ AI จะไม่สร้างตัวเลขพื้นฐานขึ้นเอง ราคาจาก Yahoo อาจมีความล่าช้า</div></div>
}
function ChangeItem({x,ai,loading,onExplain}){const sc=Number(x.score_change||0),pc=Number(x.price_change_pct||0);return <div className="changeItem"><div><b>{x.ticker}</b><span>{x.reason}</span>{ai&&<p className="changeAI">{ai}</p>}<button className="changeExplain" onClick={()=>onExplain(x)}>{loading?"กำลังวิเคราะห์…":ai?"วิเคราะห์อีกครั้ง":"ทำไมคะแนนเปลี่ยน?"}</button></div><strong className={sc>=0?"up":"down"}>{x.score_change==null?"—":(sc>=0?"+":"")+fmt(sc,1)+" pts"}</strong><small className={pc>=0?"up":"down"}>{x.price_change_pct==null?"":(pc>=0?"+":"")+fmt(pc,1)+"%"}</small></div>}
function Explain({n,t,d}){return <div className="explain"><strong>{n}</strong><b>{t}</b><span>{d}</span></div>}
function Opportunity({s,onOpen}){const price=s.price;const change=s.changePct;return <button className="opportunity" onClick={()=>onOpen(s)}><div className="ticker"><b>{s.ticker}</b><span>{s.name}</span></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div><div className="opBody"><span className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</span><span>PEG {fmt(s.peg,2)}</span><span>Fwd P/E {fmt(s.forward_pe,1)}x</span></div><div className="miniVal">ราคา <b>{usd(price)} <i className={change>=0?"up":"down"}>{change==null?"":(change>=0?"+":"")+fmt(change,1)+"%"}</i></b></div></button>}

function Ranking({rows,onOpen}){return <div className="section"><SectionHead title="จัดอันดับตามคะแนนการลงทุนรวม" action={rows.length+" stocks"}/><div className="rankTable"><div className="rankHead"><span>#</span><span>หุ้น</span><span>ราคา</span><span>คะแนน</span><span>มูลค่า/ราคา</span><span>การเติบโต</span><span>คุณภาพ</span><span>โซน</span></div>{rows.map((s,i)=><button className="rankRow" key={s.ticker} onClick={()=>onOpen(s)}><span>{i+1}</span><span className="ticker"><b>{s.ticker}</b><small>{s.name}</small></span><span>{usd(s.price)}</span><span className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</span><span>{fmt(s.valuation_score,0)}</span><span>{fmt(s.growth_score,0)}</span><span>{fmt(s.quality_score,0)}</span><span><b className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</b></span></button>)}</div></div>}
function รายการติดตาม({rows,onOpen}){return <div className="section"><SectionHead title="หุ้นที่ติดตาม" action={rows.length+" รายการ"}/>{rows.length?<div className="watchList">{rows.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div>:<div className="empty">ยังไม่มีหุ้นใน รายการติดตาม — เปิดหุ้นจาก Ranking แล้วกด + เพิ่มในรายการติดตาม</div>}</div>}

function พอร์ตลงทุน({rows,totalValue,totalCost,totalPnl,onOpen}){const ret=totalCost?(totalPnl/totalCost)*100:null;return <div className="portfolioPage"><div className="portfolioCards"><Metric label="ปัจจุบัน value" value={money(totalValue)}/><Metric label="ต้นทุน" value={money(totalCost)}/><Metric label="กำไร/ขาดทุน" value={(totalPnl>=0?"+":"")+money(totalPnl)} sub={ret==null?"":(ret>=0?"+":"")+fmt(ret,1)+"%"}/></div><div className="section"><SectionHead title="หุ้นในพอร์ต" action={rows.length+" รายการ"}/>{rows.length?<div className="holdings">{rows.map(s=><button className="holding" key={s.ticker} onClick={()=>onOpen(s)}><span><b>{s.ticker}</b><small>{fmt(s.qty,4)} shares · avg {usd(s.avg)}</small></span><span><b>{money(s.value)}</b><small className={s.pnl>=0?"up":"down"}>{s.pnl>=0?"+":""}{money(s.pnl)}</small></span></button>)}</div>:<div className="empty">ยังไม่มีหุ้นใน พอร์ตลงทุน — เปิดหุ้นแล้วกรอกจำนวนหุ้นและต้นทุนเฉลี่ย</div>}</div></div>}

function ข่าวItem({n}){return <a className="newsItem" href={n.url||"#"} target="_blank" rel="noreferrer"><span className="newsTicker">{n.ticker}</span><div><b>{n.title}</b><small>{n.source||"ข่าว"} · {n.publishedAt?dateShort(n.publishedAt):""}</small></div></a>}

function หุ้นDrawer({stock:s,onClose,onAI,ai,aiLoading,watch,setWatch,portfolio,setพอร์ตลงทุน}){
 const isWatch=watch.includes(s.ticker),[qty,setQty]=useState(portfolio[s.ticker]?.qty||""),[avg,setAvg]=useState(portfolio[s.ticker]?.avg||"");
 const price=Number(s.price||s.db_price||0),upside=s.fair_value_base&&price?((Number(s.fair_value_base)/price-1)*100):null;
 const pegReliable=!((s.industry||"").toLowerCase().includes("semiconductor")||((s.sector||"").toLowerCase().includes("consumer")&&Number(s.growth_current||0)>Number(s.growth_next||0)*1.8));
 function saveHolding(){const q=Number(qty),a=Number(avg);if(q>0&&a>0)setพอร์ตลงทุน(p=>({...p,[s.ticker]:{qty:q,avg:a}}));else setพอร์ตลงทุน(p=>{const x={...p};delete x[s.ticker];return x})}
 return <div className="drawerBack" onMouseDown={onClose}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={onClose}>×</button>
 <div className="drawerTop"><div><span className="eyebrow">{s.sector} · {s.industry}</span><h2>{s.ticker}</h2><p>{s.name}</p></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div></div>
 <div className="priceLine"><strong>{usd(price)}</strong><span>มูลค่ายุติธรรม {usd(s.fair_value_base)}</span><span className={upside>=0?"up":"down"}>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</span></div><div className="freshness">อัปเดตข้อมูล {s.updated_at?new Date(s.updated_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"} · {s.data_source||"Supabase"}</div>
 <div className="actions2"><button className="primary" onClick={()=>setWatch(w=>isWatch?w.filter(x=>x!==s.ticker):[...w,s.ticker])}>{isWatch?"✓ ✓ อยู่ในรายการติดตาม":"+ + เพิ่มในรายการติดตาม"}</button><button className="secondary" onClick={onAI}>{aiLoading?"กำลังวิเคราะห์…":"ให้ Gemini วิเคราะห์"}</button></div>
 <div className="zone"><span className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</span><div><small>ช่วงมูลค่ายุติธรรม</small><b>{usd(s.fair_value_low)} / {usd(s.fair_value_base)} / {usd(s.fair_value_high)}</b></div></div>
 <InvestmentSnapshot stock={s} price={price} upside={upside}/>
 <PriceScenario stock={s} price={price}/>
 <Block title="สถานะในพอร์ต"><div className="positionForm"><label>จำนวนหุ้น<input type="number" min="0" step="any" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/></label><label>ต้นทุนเฉลี่ย<input type="number" min="0" step="any" value={avg} onChange={e=>setAvg(e.target.value)} placeholder="0.00"/></label><button className="primary" onClick={saveHolding}>บันทึกสถานะ</button></div></Block>
 <Block title="มูลค่า/ราคา"><Grid items={[["Forward P/E",s.forward_pe?fmt(s.forward_pe,1)+"x":"—"],["PEG",s.peg?fmt(s.peg,2):"—"],["Industry Fwd P/E",s.industry_forward_pe?fmt(s.industry_forward_pe,1)+"x":"—"],["Trailing P/E",s.trailing_pe?fmt(s.trailing_pe,1)+"x":"N/A"]]}/><div className="priceOutlook"><b>โอกาสราคาจากมูลค่ายุติธรรม</b><strong>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</strong><small>คำนวณจากราคาปัจจุบันเทียบกับ Fair Value Base ไม่ใช่การรับประกันราคาหุ้น</small></div><AnalystTarget news={s.news||[]} price={price}/></Block>
 <Block title="โอกาสการเติบโต"><div className="growthHighlight"><strong>{pct(s.growth_next)}</strong><span>คาดการณ์การเติบโตของกำไรปีหน้า</span></div><Grid items={[["ปัจจุบัน",pct(s.growth_current)],["ปีหน้า",pct(s.growth_next)],["ระยะยาว",pct(s.growth_long)],["รายได้",pct(s.revenue_growth)]]}/></Block><Block title="ข่าวที่สนับสนุนการเติบโต"><PositiveNews news={s.news||[]}/></Block>
 <Block title="คุณภาพธุรกิจและความเสี่ยง"><Grid items={[["ROE",pct(s.roe)],["Profit margin",pct(s.profit_margin)],["กระแสเงินสดอิสระ",usd(s.free_cash_flow)],["หนี้สิน / ทุน",fmt(s.debt_to_equity,2)],["Beta",fmt(s.beta,2)]]}/></Block>
 <div className="newsPriceNote">ข่าวสามารถทำให้ราคาเปลี่ยนได้ โดยเฉพาะการปรับ Guidance, EPS/Revenue estimates หรือราคาเป้าหมายของนักวิเคราะห์ แต่ระบบจะแสดง % จากข่าวเฉพาะเมื่อมีตัวเลขอ้างอิงชัดเจนในข่าว</div><div className="reliability"><b>ความน่าเชื่อถือของ PEG</b><span>{pegReliable?"ใช้ประกอบการประเมินได้ แต่ควรดูความสม่ำเสมอของกำไรและวัฏจักรร่วมด้วย.":"ความเชื่อมั่นต่ำลง เพราะกำไรที่ผันผวนหรือเป็นวัฏจักรอาจทำให้ PEG คลาดเคลื่อน จึงไม่ควรพึ่ง PEG เพียงอย่างเดียว."}</span></div>
 <Block title="เหตุผลของคะแนน"><p className="explanation">{s.explanation||"ยังไม่มีคำอธิบาย"}</p></Block>
 {ai&&<div className="aiResult"><b>วิเคราะห์โดย Gemini</b><p>{ai}</p></div>}<p className="drawerNote">AI เป็นเครื่องมือช่วยวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน และใช้เฉพาะข้อมูลที่ Dashboard มีให้</p>
 </aside></div>
}
function InvestmentSnapshot({stock:s,price,upside}){
 const target=extractAnalystTarget(s.news||[],price);
 const scores=[["มูลค่า",s.valuation_score],["เติบโต",s.growth_score],["คุณภาพ",s.quality_score],["ความเสี่ยง",s.risk_score]];
 const positive=(s.growth_next!=null&&Number(s.growth_next)>0)||(target&&target.upside>0)||(upside!=null&&upside>0);
 return <section className="investmentSnapshot">
  <div className="snapshotHead"><div><span className="eyebrow">INVESTMENT SNAPSHOT</span><h3>สรุปภาพรวมหุ้นตัวนี้</h3></div><span className={"snapshotSignal "+(positive?"positive":"neutral")}>{positive?"มีปัจจัยสนับสนุน":"ต้องติดตาม"}</span></div>
  <div className="scoreCards">{scores.map(([label,value])=><div className="scoreCard" key={label}><span>{label}</span><strong>{fmt(value,0)}</strong><small>/ 100</small></div>)}</div>
  <div className="outlookGrid">
   <div><span>กำไรปีหน้า</span><b>{pct(s.growth_next)}</b><small>ประมาณการการเติบโต</small></div>
   <div><span>Fair Value Upside</span><b className={upside>=0?"up":"down"}>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</b><small>เทียบมูลค่ายุติธรรม</small></div>
   <div><span>Analyst Target</span><b>{target?usd(target.target):"—"}</b><small>{target&&target.upside!=null?(target.upside>=0?"+":"")+fmt(target.upside,1)+"% จากราคาปัจจุบัน":"ยังไม่มีตัวเลขอ้างอิง"}</small></div>
  </div>
 </section>
}

function PriceScenario({stock:s,price}){
 const scenarios=[
  ["Bear","กรณีลบ",s.fair_value_low,"มูลค่ายุติธรรมต่ำ", "down"],
  ["Base","กรณีฐาน",s.fair_value_base,"มูลค่ายุติธรรมฐาน", "base"],
  ["Bull","กรณีบวก",s.fair_value_high,"มูลค่ายุติธรรมสูง", "up"]
 ];
 const hasPrice=Number(price)>0;
 return <section className="priceScenario">
  <div className="scenarioHead"><div><span className="eyebrow">PRICE OUTLOOK</span><h3>กรอบราคาที่ควรใช้คิด</h3></div><small>ไม่ใช่การคาดการณ์ราคาแบบ AI</small></div>
  <div className="scenarioGrid">{scenarios.map(([name,label,value,source,cls])=>{
    const target=Number(value)>0&&hasPrice?((Number(value)/Number(price)-1)*100):null;
    return <div className={"scenarioCard "+cls} key={name}>
      <div className="scenarioTop"><b>{name}</b><span>{label}</span></div>
      <strong>{Number(value)>0?usd(value):"—"}</strong>
      <span className={target==null?"scenarioMissing":target>=0?"up":"down"}>{target==null?"ยังไม่มีข้อมูล":(target>=0?"+":"")+fmt(target,1)+"%"}</span>
      <small>{source}</small>
    </div>
  })}</div>
  <div className="scenarioNote"><b>วิธีอ่าน:</b> Bear / Base / Bull ใช้ Fair Value Low / Base / High ที่มีอยู่ในฐานข้อมูลเท่านั้น ระบบจะไม่สร้างราคาขึ้นเอง หากไม่มี Fair Value จะแสดง “ยังไม่มีข้อมูล”</div>
 </section>
}

function PositiveNews({news}){const positive=news.filter(n=>["positive","growth driver","positive earnings","analyst upgrade"].includes((n.sentiment||"").toLowerCase())||["growth driver","positive earnings","analyst upgrade"].includes((n.category||"").toLowerCase())).slice(0,4);return positive.length?<div className="positiveNews">{positive.map((n,i)=><a key={n.url||i} href={n.url||"#"} target="_blank" rel="noreferrer"><b>{n.title}</b><small>{n.source||"ข่าว"} · {n.category||"ข่าวบวก"}</small></a>)}</div>:<div className="empty compact">ยังไม่พบข่าวบวกที่ระบบจัดว่าเป็นปัจจัยสนับสนุนการเติบโตในข้อมูลล่าสุด</div>}
function Block({title,children}){return <section className="block"><h3>{title}</h3>{children}</section>}
function Grid({items}){return <div className="dataGrid">{items.map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div>}


function AnalystTarget({news,price}){
 const x=extractAnalystTarget(news,price);
 if(!x) return <div className="targetCard mutedTarget"><b>ราคาเป้าหมายนักวิเคราะห์</b><strong>ยังไม่มีข้อมูล</strong><small>ระบบจะแสดงตัวเลขเมื่อข่าวมีราคาเป้าหมายที่ระบุชัดเจนเท่านั้น — ไม่คาดเดาตัวเลขเอง</small></div>;
 return <div className="targetCard"><div><b>ราคาเป้าหมายนักวิเคราะห์จากข่าว</b><small>{x.source}</small></div><strong>{usd(x.target)}</strong><span className={x.upside>=0?"up":"down"}>{x.upside==null?"—":(x.upside>=0?"+":"")+fmt(x.upside,1)+"% จากราคาปัจจุบัน"}</span><a href={x.url||"#"} target="_blank" rel="noreferrer">ดูข่าวอ้างอิง →</a></div>
}