"use client";

import { useEffect, useMemo, useState } from "react";

const fmt=(n,d=2)=>n==null||n===""||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:d});
const usd=n=>n==null?"—":"$"+fmt(n);
const pct=n=>n==null?"—":fmt(n,1)+"%";
const scoreClass=n=>Number(n)>=75?"score good":Number(n)>=55?"score mid":"score low";
const badgeClass=s=>(s||"").toLowerCase().replaceAll(" ","-");
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const dateShort=x=>x?new Date(x).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const num=(v)=>Number.isFinite(Number(v))?Number(v):null;
function industryProfile(s){
  const text=`${s.industry||""} ${s.sector||""}`.toLowerCase();
  if(/semiconductor|chip|memory|equipment/.test(text)) return {name:"Semiconductor",keys:["growth","margin","fcf","debt","valuation"]};
  if(/software|application|internet|technology|tech/.test(text)) return {name:"Technology / Software",keys:["growth","margin","fcf","roe","valuation"]};
  if(/health|biotech|pharma|drug|medical/.test(text)) return {name:"Healthcare",keys:["growth","margin","fcf","roe","valuation"]};
  if(/financial|bank|asset management|capital market|insurance/.test(text)) return {name:"Financials",keys:["roe","margin","debt","valuation","growth"]};
  if(/retail|consumer|apparel|automotive|restaurant/.test(text)) return {name:"Consumer",keys:["revenue","margin","roe","fcf","valuation"]};
  return {name:"General",keys:["growth","margin","fcf","roe","valuation"]};
}
function metricScore(v,good,bad){
  if(v==null) return null;
  if(good>bad) return clamp(((v-bad)/(good-bad))*100);
  return clamp(((bad-v)/(bad-good))*100);
}
function investmentDecision(s){
  const profile=industryProfile(s);
  const growth=num(s.growth_next), revenue=num(s.revenue_growth), margin=num(s.profit_margin), roe=num(s.roe), fcf=num(s.free_cash_flow), debt=num(s.debt_to_equity), pe=num(s.forward_pe), indPe=num(s.industry_forward_pe), peg=num(s.peg);
  const growthScore=growth==null?50:clamp(50+growth*1.5);
  const marginScore=margin==null?50:clamp(50+margin*2.2);
  const roeScore=roe==null?50:clamp(50+roe*1.5);
  const fcfScore=fcf==null?50:(fcf>0?70:25);
  const debtScore=debt==null?50:clamp(90-debt*8);
  let valuationScore=50;
  if(pe!=null&&pe>0&&growth!=null&&growth>0){const p=pe/growth;valuationScore=p<=1?92:p<=1.5?80:p<=2?62:p<=3?42:25;}
  if(indPe!=null&&indPe>0&&pe!=null&&pe>0) valuationScore=clamp(valuationScore+(pe<indPe?8:-8));
  const business=clamp(profile.keys.reduce((a,k)=>{
    const m=k==="growth"?growthScore:k==="revenue"?(revenue==null?50:clamp(50+revenue*1.5)):k==="margin"?marginScore:k==="roe"?roeScore:k==="fcf"?fcfScore:valuationScore;
    return a+m;
  },0)/profile.keys.length);
  const financial=clamp((marginScore+roeScore+fcfScore+debtScore)/4);
  const riskPenalty=(growth!=null&&growth<0?22:0)+(revenue!=null&&revenue<0?18:0)+(margin!=null&&margin<0?20:0)+(fcf!=null&&fcf<0?18:0)+(debt!=null&&debt>150?12:0);
  const risk=clamp(100-riskPenalty-(num(s.beta)!=null&&num(s.beta)>1.8?8:0));
  const deterioration=clamp(100-riskPenalty-(growth!=null&&growth<5?12:0));
  const score=clamp(business*.30+growthScore*.20+financial*.15+valuationScore*.25+risk*.10);
  let label=score>=80?"น่าลงทุนมาก":score>=68?"น่าลงทุน":score>=55?"รอจังหวะ":score>=42?"ความเสี่ยงสูง":"ควรหลีกเลี่ยง";
  if(deterioration<45) label="ควรหลีกเลี่ยง";
  const warnings=[];
  if(growth!=null&&growth<0) warnings.push("กำไรคาดว่าจะหดตัว");
  if(revenue!=null&&revenue<0) warnings.push("รายได้หดตัว");
  if(margin!=null&&margin<0) warnings.push("Margin ติดลบ");
  if(fcf!=null&&fcf<0) warnings.push("Free Cash Flow ติดลบ");
  if(debt!=null&&debt>150) warnings.push("หนี้สูง");
  if(peg!=null&&peg>2) warnings.push("P/E สูงเมื่อเทียบกับ Growth");
  const positives=[];
  if(growth!=null&&growth>=15) positives.push("Growth แข็งแรง");
  if(fcf!=null&&fcf>0) positives.push("สร้าง Free Cash Flow");
  if(roe!=null&&roe>=15) positives.push("ROE ดี");
  if(pe!=null&&growth!=null&&growth>0&&pe/growth<=1.5) positives.push("Valuation รองรับ Growth");
  return {score, label, industry:profile.name, business, financial, valuation:valuationScore, risk, deterioration, warnings, positives};
}
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
  const [searchResults,setSearchResults]=useState([]),[searching,setSearching]=useState(false),[addingTicker,setAddingTicker]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[ai,setAi]=useState(""),[aiLoading,setAiLoading]=useState(false),[watch,setWatch]=useState([]);
  const [quotes,setQuotes]=useState({}),[news,setข่าว]=useState([]),[earnings,setEarnings]=useState([]),[portfolio,setพอร์ตลงทุน]=useState({});
  const [changes,setChanges]=useState([]),[insights,setInsights]=useState({}),[lastUpdate,setLastUpdate]=useState(null),[brief,setBrief]=useState(""),[briefLoading,setBriefLoading]=useState(false),[syncLoading,setSyncLoading]=useState(false),[earnBrief,setEarnBrief]=useState(""),[earnLoading,setEarnLoading]=useState(false),[changeAI,setChangeAI]=useState({}),[changeAILoading,setChangeAILoading]=useState(""),[dailyBrief,setDailyBrief]=useState(null),[alerts,setAlerts]=useState([]),[chatOpen,setChatOpen]=useState(false),[chatInput,setChatInput]=useState(""),[chatMessages,setChatMessages]=useState([]),[chatLoading,setChatLoading]=useState(false);
  const [compareTickers,setCompareTickers]=useState([]);
  const load=async()=>{
    setLoading(true);
    try{
      const [s,q,n,e,ch,ins,b,a]=await Promise.all([fetch("/api/stocks",{cache:"no-store"}),fetch("/api/market",{cache:"no-store"}),fetch("/api/news",{cache:"no-store"}),fetch("/api/earnings",{cache:"no-store"}),fetch("/api/changes",{cache:"no-store"}),fetch("/api/insights",{cache:"no-store"}),fetch("/api/briefing",{cache:"no-store"}),fetch("/api/alerts",{cache:"no-store"})]);
      const sd=await s.json(),qd=await q.json(),nd=await n.json(),ed=await e.json(),cd=await ch.json(),id=await ins.json(),bd=await b.json(),ad=await a.json();
      if(!s.ok || sd.error) throw new Error(sd.error||"โหลดข้อมูลหุ้นไม่สำเร็จ");
      setหุ้นs(sd.stocks||[]);
      setError("");
      setQuotes(Object.fromEntries((qd.quotes||[]).map(x=>[x.ticker,x])));
      setข่าว(nd.news||[]);setEarnings(ed.earnings||[]);setChanges(cd.changes||[]);setInsights(id.insights||{});setLastUpdate(cd.lastUpdate||null);setDailyBrief((bd.briefings||[])[0]||null);setAlerts(ad.alerts||[]);
    }catch(e){setError(e?.message||"ไม่สามารถโหลดข้อมูลได้")}finally{setLoading(false)}
  };
  useEffect(()=>{load();try{setWatch(JSON.parse(localStorage.getItem("pulse-watch")||"[]"));setพอร์ตลงทุน(JSON.parse(localStorage.getItem("pulse-portfolio")||"{}"))}catch{}},[]);
  useEffect(()=>{if(stocks.length&&!compareTickers.length)setCompareTickers(stocks.slice(0,4).map(x=>x.ticker))},[stocks,compareTickers.length]);
  useEffect(()=>{if(!search.trim()||search.trim().length<2){setSearchResults([]);return}const t=setTimeout(async()=>{setSearching(true);try{const r=await fetch("/api/stocks/search?q="+encodeURIComponent(search.trim()),{cache:"no-store"});const d=await r.json();setSearchResults(d.results||[])}catch{setSearchResults([])}finally{setSearching(false)}},300);return()=>clearTimeout(t)},[search]);
  async function addStock(ticker){setAddingTicker(ticker);try{const r=await fetch("/api/stocks/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker})});const d=await r.json();if(!r.ok)throw new Error(d.error||"เพิ่มหุ้นไม่สำเร็จ");setSearch("");setSearchResults([]);await load();setTab("rank")}catch(e){setError(e?.message||"เพิ่มหุ้นไม่สำเร็จ")}finally{setAddingTicker("")}}
  useEffect(()=>localStorage.setItem("pulse-watch",JSON.stringify(watch)),[watch]);
  useEffect(()=>localStorage.setItem("pulse-portfolio",JSON.stringify(portfolio)),[portfolio]);
  const merged=useMemo(()=>stocks.map(s=>({...s,...(quotes[s.ticker]||{}),db_price:s.price})),[stocks,quotes]);
  const ranked=useMemo(()=>[...merged].sort((a,b)=>Number(b.overall_score||0)-Number(a.overall_score||0)),[merged]);
  const filtered=ranked.filter(s=>(s.ticker+" "+s.name).toLowerCase().includes(search.toLowerCase()));
  const decisions=useMemo(()=>merged.map(s=>({...s,investmentDecision:investmentDecision(s)})).sort((a,b)=>b.investmentDecision.score-a.investmentDecision.score),[merged]);
  const investmentPicks=decisions.slice(0,5);
  const buys=ranked.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).slice(0,5);
  const watchRows=ranked.filter(s=>watch.includes(s.ticker));
  const newsRows=search?news.filter(n=>(n.ticker+" "+n.title).toLowerCase().includes(search.toLowerCase())).slice(0,20):news.slice(0,12);
  const openStock=s=>setSelected({...s,news:news.filter(n=>n.ticker===s.ticker)});
  async function removeStock(ticker){
    if(!window.confirm("ลบ "+ticker+" ออกจากรายการหุ้นที่วิเคราะห์?"))return;
    try{
      const r=await fetch("/api/stocks/search",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({ticker})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"ลบหุ้นไม่สำเร็จ");
      setWatch(w=>w.filter(x=>x!==ticker));
      setพอร์ตลงทุน(p=>{const x={...p};delete x[ticker];return x});
      setSelected(null);
      setAi("");
      await load();
    }catch(e){setError(e?.message||"ลบหุ้นไม่สำเร็จ")}
  }
  const portfolioRows=Object.entries(portfolio).map(([ticker,p])=>{const s=merged.find(x=>x.ticker===ticker);const price=Number(quotes[ticker]?.price||s?.price||0);const qty=Number(p.qty||0);const avg=Number(p.avg||0);return {...s,ticker,qty,avg,price,value:qty*price,cost:qty*avg,pnl:qty*(price-avg)}}).filter(x=>x.qty>0);
  const totalValue=portfolioRows.reduce((a,x)=>a+x.value,0),totalCost=portfolioRows.reduce((a,x)=>a+x.cost,0),totalPnl=totalValue-totalCost;
  async function earningsBrief(){setEarnLoading(true);try{const r=await fetch("/api/ai/earnings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({earnings,stocks:ranked})});const d=await r.json();setEarnBrief(d.text||d.error||"AI ยังไม่ได้ส่งคำตอบ")}catch{setEarnBrief("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setEarnLoading(false)}}
  async function syncNow(){setSyncLoading(true);try{await fetch("/api/cron/sync",{cache:"no-store"});await load()}finally{setSyncLoading(false)}}
  async function askBrief(){setBriefLoading(true);try{const r=await fetch("/api/ai/brief",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({stocks:ranked,changes,news})});const d=await r.json();setBrief(d.text||d.error||"AI ยังไม่ได้ส่งคำตอบ")}catch{setBrief("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setBriefLoading(false)}}
  async function askAI(ticker){setAiLoading(true);setAi("");try{const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker,data:merged.find(s=>s.ticker===ticker),news:news.filter(n=>n.ticker===ticker).slice(0,8)})});const d=await r.json();setAi(d.text||d.error||"AI ยังไม่ได้เชื่อมต่อ")}catch{setAi("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setAiLoading(false)}}
  async function askChat(){const q=chatInput.trim();if(!q||chatLoading)return;setChatInput("");setChatMessages(m=>[...m,{role:"user",text:q}]);setChatLoading(true);try{const r=await fetch("/api/ai/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:q})});const d=await r.json();setChatMessages(m=>[...m,{role:"assistant",text:d.text||d.error||"AI ยังไม่ตอบ"}]);}catch{setChatMessages(m=>[...m,{role:"assistant",text:"เชื่อมต่อ AI ไม่สำเร็จ"}]);}finally{setChatLoading(false)}}
  async function explainChange(x){setChangeAILoading(x.ticker);try{const r=await fetch("/api/ai/change",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticker:x.ticker,current:x.current,previous:x.previous,earnings:earnings.find(e=>e.ticker===x.ticker)||null,news:news.filter(n=>n.ticker===x.ticker).slice(0,5)})});const d=await r.json();setChangeAI(v=>({...v,[x.ticker]:d.text||d.error||"AI ยังไม่ได้ส่งคำตอบ"}))}catch{setChangeAI(v=>({...v,[x.ticker]:"เชื่อมต่อ AI ไม่สำเร็จ"}))}finally{setChangeAILoading("")}}
  return <main className="app">
    <aside className="sidebar"><div className="brand"><div className="brandIcon">P</div><div><b>Pulsefolio</b><small>วิเคราะห์หุ้นสหรัฐฯ</small></div></div><nav>
      <Nav active={tab==="home"} onClick={()=>setTab("home")}>ภาพรวม</Nav><Nav active={tab==="rank"} onClick={()=>setTab("rank")}>จัดอันดับหุ้น</Nav><Nav active={tab==="watch"} onClick={()=>setTab("watch")}>รายการติดตาม <em>{watch.length}</em></Nav><Nav active={tab==="portfolio"} onClick={()=>setTab("portfolio")}>พอร์ตลงทุน <em>{portfolioRows.length}</em></Nav><Nav active={tab==="compare"} onClick={()=>setTab("compare")}>เปรียบเทียบหุ้น</Nav>
    </nav><div className="method"><span>โมเดลวิเคราะห์</span><b>มูลค่า/ราคา 35%</b><b>การเติบโต 30%</b><b>คุณภาพ 20%</b><b>ความเสี่ยง 10%</b><b>ข่าว 5%</b><small>ราคาตลาดอาจมีความล่าช้า</small></div></aside>
    <section className="main"><header className="header"><div><span className="eyebrow">แดชบอร์ดการลงทุนส่วนตัว</span><h1>{tab==="home"?"ภาพรวมตลาด":tab==="rank"?"จัดอันดับหุ้น":tab==="watch"?"รายการติดตาม":tab==="compare"?"เปรียบเทียบหุ้น":"พอร์ตลงทุน"}</h1></div><div className="searchWrap"><div className="searchbox">⌕<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหา Ticker หรือชื่อบริษัท"/></div>{search.trim().length>=2&&(searching||searchResults.length>0)&&<div className="searchResults">{searching?<div className="searchLoading">กำลังค้นหา…</div>:searchResults.map(x=><button className="searchResult" key={x.ticker} onClick={()=>addStock(x.ticker)}><span><b>{x.ticker}</b><small>{x.name} · {x.exchange}</small></span><em>{addingTicker===x.ticker?"กำลังเพิ่ม…":"เพิ่ม + "}</em></button>)}</div>}</div></header>
      {loading?<div className="loading">กำลังโหลดข้อมูลตลาด…</div>:error?<div className="errorCard"><b>ยังโหลดข้อมูลสกอร์ไม่ได้</b><span>{error}</span><button className="primary" onClick={load}>ลองใหม่</button><small>ถ้ายังไม่ขึ้น ปัญหาอยู่ที่การเชื่อมต่อ API ไม่ใช่หน้าแสดงผล</small></div>:tab==="home"?<HomeView stocks={ranked} buys={buys} portfolioRows={portfolioRows} totalValue={totalValue} totalPnl={totalPnl} news={newsRows} earnings={earnings} changes={changes} lastUpdate={lastUpdate} investmentPicks={investmentPicks} insights={insights} brief={brief} briefLoading={briefLoading} syncLoading={syncLoading} earnBrief={earnBrief} earnLoading={earnLoading} changeAI={changeAI} changeAILoading={changeAILoading} dailyBrief={dailyBrief} alerts={alerts} onBrief={askBrief} onEarningsBrief={earningsBrief} onExplainChange={explainChange} onSync={syncNow} onOpen={openStock} insights={insights} onRank={()=>setTab("rank")} onReload={load}/>:tab==="rank"?<Ranking rows={filtered} onOpen={openStock}/>:tab==="watch"?<รายการติดตาม rows={watchRows} onOpen={openStock}/>:tab==="compare"?<CompareView stocks={merged} selected={compareTickers} setSelected={setCompareTickers} onOpen={openStock}/>:<พอร์ตลงทุน rows={portfolioRows} totalValue={totalValue} totalCost={totalCost} totalPnl={totalPnl} onOpen={openStock}/>}
      <footer>ข้อมูลพื้นฐานและการวิเคราะห์ · ราคาตลาด: Yahoo Finance · ข่าวและงบ: Yahoo/Google · AI: Gemini</footer><button className="chatFab" onClick={()=>setChatOpen(v=>!v)}>AI</button>{chatOpen&&<AIChat input={chatInput} setInput={setChatInput} messages={chatMessages} loading={chatLoading} onSend={askChat} onClose={()=>setChatOpen(false)}/>}
    </section>
    {selected&&<หุ้นDrawer insights={insights[selected.ticker]} stock={selected} onClose={()=>{setSelected(null);setAi("")}} onAI={()=>askAI(selected.ticker)} ai={ai} aiLoading={aiLoading} watch={watch} setWatch={setWatch} portfolio={portfolio} setพอร์ตลงทุน={setพอร์ตลงทุน} onRemove={()=>removeStock(selected.ticker)}/>}
  </main>
}

function CompareView({stocks,selected,setSelected,onOpen}){
 const [aiText,setAiText]=useState(""),[aiLoading,setAiLoading]=useState(false);
 const rows=selected.map(t=>stocks.find(s=>s.ticker===t)).filter(Boolean);
 const scored=rows.map(s=>({...s,decision:investmentDecision(s)}));
 const best=[...scored].sort((a,b)=>b.decision.score-a.decision.score)[0];
 const toggle=t=>setSelected(v=>v.includes(t)?v.filter(x=>x!==t):v.length<4?[...v,t]:v);
 async function ask(){if(rows.length<2)return;setAiLoading(true);setAiText("");try{const q="เปรียบเทียบหุ้น "+rows.map(x=>x.ticker).join(" vs ")+" จากข้อมูลล่าสุดในระบบ บอกว่าตัวไหนน่าสนใจกว่า เหตุผลหลัก จุดแข็ง จุดเสี่ยง และ valuation โดยห้ามสร้างตัวเลขเอง";const r=await fetch("/api/ai/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:q})});const d=await r.json();setAiText(d.text||d.error||"AI ยังไม่ตอบ")}catch{setAiText("เชื่อมต่อ AI ไม่สำเร็จ")}finally{setAiLoading(false)}}
 return <div className="comparePage">
  <div className="section compareHero"><div><span className="eyebrow">STOCK COMPARISON</span><h2>เทียบหุ้นแบบเห็นภาพเดียว</h2><p>เลือก 2–4 หุ้น แล้วระบบจะเทียบ Growth, Valuation, Quality, Risk และ Investment Score ให้พร้อมกัน</p></div><button className="primary" onClick={ask} disabled={rows.length<2}>{aiLoading?"กำลังวิเคราะห์…":"ให้ Pulse AI วิเคราะห์"}</button></div>
  <section className="section"><div className="sectionHead"><h3>เลือกหุ้นที่ต้องการเทียบ</h3><span className="dataTag">{rows.length}/4</span></div><div className="compareChoices">{stocks.map(s=><button key={s.ticker} className={selected.includes(s.ticker)?"compareChoice selected":"compareChoice"} onClick={()=>toggle(s.ticker)}><b>{s.ticker}</b><small>{s.name}</small></button>)}</div></section>
  {rows.length<2?<div className="empty">เลือกอย่างน้อย 2 หุ้นเพื่อเริ่มเปรียบเทียบ</div>:<><section className="section"><div className="sectionHead"><h3>คะแนนเปรียบเทียบ</h3>{best&&<span className="compareWinner">เด่นสุด: {best.ticker}</span>}</div><div className="compareTable"><div className="compareTableHead"><span>หุ้น</span><span>Investment</span><span>Growth</span><span>Forward P/E</span><span>PEG</span><span>ROE</span><span>Risk</span></div>{scored.map(s=><button key={s.ticker} className="compareRow" onClick={()=>onOpen(s)}><b>{s.ticker}<small>{s.name}</small></b><strong>{fmt(s.decision.score,0)}<em>{s.decision.label}</em></strong><span>{pct(s.growth_next)}</span><span>{s.forward_pe==null?"—":fmt(s.forward_pe,1)+"x"}</span><span>{s.peg==null?"—":fmt(s.peg,2)}</span><span>{pct(s.roe)}</span><span>{fmt(s.decision.risk,0)}/100</span></button>)}</div></section>
 <section className="section"><div className="sectionHead"><h3>สรุปความต่างที่สำคัญ</h3></div><div className="compareCards">{scored.map(s=><div className="compareCard" key={s.ticker}><div><b>{s.ticker}</b><span>{s.decision.label}</span></div><p>{s.decision.positives.slice(0,2).join(" · ")||"ยังไม่มีปัจจัยบวกที่ชัดเจน"}</p>{s.decision.warnings.length>0&&<small>⚠ {s.decision.warnings.slice(0,2).join(" · ")}</small>}</div>)}</div></section>
 {aiText&&<section className="section compareAI"><div className="sectionHead"><h3>Pulse AI · ความเห็นเปรียบเทียบ</h3></div><div className="brief">{aiText}</div></section>}</>}
 </div>
}

function Nav({active,onClick,children}){return <button className={active?"nav active":"nav"} onClick={onClick}>{children}</button>}
function Metric({label,value,sub}){return <div className="metric"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
function SectionHead({title,action,onClick}){return <div className="sectionHead"><h3>{title}</h3>{action&&<button onClick={onClick}>{action}</button>}</div>}

function HomeView({stocks,buys,investmentPicks,insights,portfolioRows,totalValue,totalPnl,news,earnings,changes,lastUpdate,brief,briefLoading,syncLoading,earnBrief,earnLoading,changeAI,changeAILoading,dailyBrief,alerts,onBrief,onEarningsBrief,onExplainChange,onSync,onOpen,onRank,onReload}){
 const avg=stocks.length?stocks.reduce((a,s)=>a+Number(s.overall_score||0),0)/stocks.length:0;
 return <div className="home"><div className="hero"><div><span className="eyebrow">เครื่องมือวิเคราะห์การลงทุน</span><h2>ค้นหาธุรกิจที่ดีในราคาที่เหมาะสม</h2><p>มูลค่า/ราคา, ระบบรวมมูลค่า การเติบโต คุณภาพ ความเสี่ยง และมูลค่ายุติธรรมเพื่อจัดอันดับหุ้น</p><div className="heroActions"><button className="primary" onClick={onRank}>ดูอันดับหุ้น</button><button className="secondary" onClick={onReload}>อัปเดตราคาและข่าว</button><button className="secondary" onClick={onSync}>{syncLoading?"กำลังซิงก์…":"ซิงก์ข้อมูลพื้นฐาน"}</button></div></div><div className="heroคะแนน"><span>คะแนนภาพรวม</span><strong>{fmt(avg,0)}</strong><small>/ 100</small></div></div>
 <div className="metrics"><Metric label="หุ้นที่วิเคราะห์" value={stocks.length}/><Metric label="โซนซื้อ" value={stocks.filter(s=>["BUY","STRONG BUY"].includes(s.buy_zone)).length}/><Metric label="สถานะข้อมูล" value={lastUpdate?.status==="success"?"อัปเดตอัตโนมัติ":"พร้อมใช้งาน"} sub={lastUpdate?.finished_at?"ซิงก์ล่าสุด "+new Date(lastUpdate.finished_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"เปิดอัปเดตรายวัน"}/><Metric label="พอร์ตลงทุน value" value={totalValue?money(totalValue):"—"} sub={totalPnl?((totalPnl>=0?"+":"")+money(totalPnl)+" กำไร/ขาดทุน"):"ยังไม่มีหุ้นในพอร์ต"}/></div>
 <section className="section"><div className="decisionHead"><div><span className="eyebrow">INVESTMENT DECISION</span><h3>หุ้นที่น่าลงทุนจริงตอนนี้</h3><p>คัดจากสุขภาพธุรกิจ, Growth, ฐานะการเงิน, Valuation, ความเสี่ยง และ KPI ที่ปรับตามอุตสาหกรรม</p></div><button className="secondary" onClick={onRank}>ดูทั้งหมด →</button></div><div className="investmentPicks">{investmentPicks.map((s,i)=><InvestmentPick key={s.ticker} s={s} rank={i+1} insights={insights[s.ticker]} onOpen={onOpen}/>)}</div></section><section className="section"><SectionHead title="โอกาสที่น่าสนใจ" action="ดูอันดับทั้งหมด →" onClick={onRank}/><div className="opps">{buys.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div></section>
 <section className="section intelligence"><div className="intelHead"><div><span className="eyebrow">AI INVESTMENT BRIEF</span><h3>สิ่งที่สำคัญตอนนี้</h3></div><button className="primary" onClick={onBrief}>{briefLoading?"กำลังวิเคราะห์…":"สร้างสรุปด้วย AI"}</button></div>{brief?<div className="brief">{brief}</div>:<div className="empty compact">กด สร้างสรุปด้วย AI เพื่อให้ Gemini สรุปภาพรวมจากข้อมูลใน Dashboard โดยไม่เติมตัวเลขเอง</div>}</section>
 <section className="section"><SectionHead title="มีอะไรเปลี่ยนจากครั้งก่อน" action={changes.length?changes.length+" signals":"ยังไม่มีการเปลี่ยนแปลง"}/>{changes.length?<div className="changes">{changes.slice(0,6).map(x=><ChangeItem key={x.ticker} x={x} ai={changeAI[x.ticker]} loading={changeAILoading===x.ticker} onExplain={onExplainChange}/>)}</div>:<div className="empty compact">ยังไม่มี snapshot ก่อนหน้า ระบบจะเริ่มเก็บประวัติหลังการ sync ครั้งถัดไป</div>}</section>
 <section className="section"><SectionHead title="ข่าวตลาด" action={news.length?news.length+" ข่าว":""}/>{news.length?<div className="newsList">{news.map((n,i)=><ข่าวItem key={n.url||i} n={n}/>)}</div>:<div className="empty">ยังไม่มีข่าวจากแหล่งข้อมูลฟรีในขณะนี้</div>}</section>
 <section className="section"><div className="intelHead"><div><span className="eyebrow">EARNINGS INTELLIGENCE</span><h3>ผลประกอบการ · Surprise · Guidance</h3></div><button className="primary" onClick={onEarningsBrief}>{earnLoading?"กำลังวิเคราะห์…":"วิเคราะห์งบ"}</button></div>{earnBrief&&<div className="brief">{earnBrief}</div>}<EarningsTracker earnings={earnings} news={news}/></section>
 <section className="section"><SectionHead title="คะแนนลงทุนคำนวณอย่างไร"/><div className="scoreExplain"><Explain n="35%" t="มูลค่า/ราคา" d="Forward P/E, PEG and price vs fair value."/><Explain n="30%" t="การเติบโต" d="ปัจจุบัน, next-year and long-term growth."/><Explain n="20%" t="คุณภาพ" d="ROE, margin and financial strength."/><Explain n="10%" t="ความเสี่ยง" d="Beta, cyclicality and valuation risk."/><Explain n="5%" t="ข่าว" d="Reserved for real news sentiment; current base score does not pretend placeholder news is live." /></div></section>
 <div className="notice"><b>กฎข้อมูล:</b> ข้อมูลที่ไม่มีจะแสดงเป็น “—” และ AI จะไม่สร้างตัวเลขพื้นฐานขึ้นเอง ราคาจาก Yahoo อาจมีความล่าช้า</div></div>
}
function EarningsTracker({earnings,news}){
 const rows=earnings.map(e=>{
   const hist=(e.history||[]).filter(x=>x.epsActual!=null&&x.epsEstimate!=null);
   const latest=hist[0];
   const beats=hist.filter(x=>x.surprisePercent!=null&&x.surprisePercent>0).length;
   const misses=hist.filter(x=>x.surprisePercent!=null&&x.surprisePercent<0).length;
   const avgSurprise=hist.length?hist.reduce((a,x)=>a+Number(x.surprisePercent||0),0)/hist.length:null;
   const tickerNews=(news||[]).filter(n=>n.ticker===e.ticker).slice(0,12);
   const guidanceItems=tickerNews.filter(n=>/guidance|outlook|forecast|expects|expectation|raised|raises|lowered|cuts|cut|ลดคาดการณ์|เพิ่มคาดการณ์|ปรับคาดการณ์/i.test((n.title||"")+" "+(n.summary||"")));
   let guidance="ยังไม่พบสัญญาณ"; let guidanceTone="neutral";
   if(guidanceItems.length){
     const text=guidanceItems.map(n=>(n.title||"")+" "+(n.summary||"")).join(" ");
     if(/lowered|cuts|cut|reduce|reduced|downside|ลดคาดการณ์|ปรับลด/i.test(text)){guidance="มีสัญญาณ Guidance ลดลง";guidanceTone="down"}
     else if(/raised|raises|increase|increased|upside|เพิ่มคาดการณ์|ปรับเพิ่ม/i.test(text)){guidance="มีสัญญาณ Guidance เพิ่มขึ้น";guidanceTone="up"}
     else guidance="พบข่าว Guidance / Outlook";
   }
   return {...e,latest,beats,misses,avgSurprise,guidance,guidanceTone,guidanceSource:guidanceItems[0]?.source||null};
 }).sort((a,b)=>{const ad=a.date?new Date(a.date).getTime():Infinity,bd=b.date?new Date(b.date).getTime():Infinity;return ad-bd;});
 return <div className="earningsTracker">
  <div className="earningsTrackerNote">Beat/Miss ใช้ EPS Actual เทียบกับ EPS Estimate จาก Yahoo Finance ส่วน Guidance เป็นสัญญาณจากข่าวล่าสุดของหุ้น — ถ้าไม่มีหลักฐานจะไม่เดาตัวเลขหรือสถานะ</div>
  {rows.length?<div className="earningsIntelGrid">{rows.slice(0,10).map(e=><div className="earnIntelCard" key={e.ticker}>
    <div className="earnIntelTop"><div><b>{e.ticker}</b><small>{e.date?dateShort(e.date):"ยังไม่ทราบวัน"}{e.estimated?" · ประมาณการ":""}</small></div>{e.latest?.surprisePercent!=null?<span className={e.latest.surprisePercent>0?"up":e.latest.surprisePercent<0?"down":"neutral"}>{e.latest.surprisePercent>0?"BEAT":e.latest.surprisePercent<0?"MISS":"MEET"}</span>:<span className="neutral">ยังไม่มีผลล่าสุด</span>}</div>
    <div className="earnMetricRow"><span>EPS ล่าสุด <b>{e.latest?.epsActual!=null?fmt(e.latest.epsActual,2):"—"}</b></span><span>คาด <b>{e.latest?.epsEstimate!=null?fmt(e.latest.epsEstimate,2):"—"}</b></span><span>Surprise <b className={e.latest?.surprisePercent>=0?"up":"down"}>{e.latest?.surprisePercent!=null?(e.latest.surprisePercent>=0?"+":"")+fmt(e.latest.surprisePercent,1)+"%":"—"}</b></span></div>
    <div className="earnMetricRow"><span>8 งบล่าสุด <b>{e.beats} Beat</b></span><span>{e.misses} Miss</span><span>Avg <b>{e.avgSurprise!=null?(e.avgSurprise>=0?"+":"")+fmt(e.avgSurprise,1)+"%":"—"}</b></span></div>
    <div className="guidanceSignal"><span>Guidance / Outlook</span><b className={e.guidanceTone}>{e.guidance}</b><small>{e.guidanceSource?"จาก "+e.guidanceSource:"ไม่มีข่าวอ้างอิงเพียงพอ"}</small></div>
    {e.epsAverage!=null&&<small className="earnNext">งวดถัดไป: EPS consensus {fmt(e.epsAverage,2)}{e.revenueAverage!=null?" · Revenue "+fmt(e.revenueAverage,0):""}</small>}
  </div>)}</div>:<div className="notice">ยังดึงข้อมูล Earnings ไม่ได้ ระบบจะลองใหม่เมื่อ Refresh และจะไม่สร้างข้อมูลขึ้นเอง</div>}
 </div>
}
function ChangeItem({x,ai,loading,onExplain}){const sc=Number(x.score_change||0),pc=Number(x.price_change_pct||0);return <div className="changeItem"><div><b>{x.ticker}</b><span>{x.reason}</span>{ai&&<p className="changeAI">{ai}</p>}<button className="changeExplain" onClick={()=>onExplain(x)}>{loading?"กำลังวิเคราะห์…":ai?"วิเคราะห์อีกครั้ง":"ทำไมคะแนนเปลี่ยน?"}</button></div><strong className={sc>=0?"up":"down"}>{x.score_change==null?"—":(sc>=0?"+":"")+fmt(sc,1)+" pts"}</strong><small className={pc>=0?"up":"down"}>{x.price_change_pct==null?"":(pc>=0?"+":"")+fmt(pc,1)+"%"}</small></div>}
function Explain({n,t,d}){return <div className="explain"><strong>{n}</strong><b>{t}</b><span>{d}</span></div>}
function InvestmentPick({s,rank,insights,onOpen}){
 const d=s.investmentDecision||investmentDecision(s);
 return <button className="investmentPick" onClick={()=>onOpen(s)}>
  <span className="pickRank">#{rank}</span>
  <div className="pickMain"><b>{s.ticker}</b><span>{s.name}</span><small>{d.industry}</small></div>
  <div className="pickScore"><strong>{fmt(d.score,0)}</strong><span>{d.label}</span></div>
  <div className="pickReasons">{(d.positives.length?d.positives:["ยังต้องติดตามข้อมูลเพิ่มเติม"]).slice(0,2).map(x=><span key={x}>✓ {x}</span>)}{d.warnings.slice(0,1).map(x=><span className="warn" key={x}>⚠ {x}</span>)}</div>
 </button>
}
function Opportunity({s,onOpen}){const price=s.price;const change=s.changePct;return <button className="opportunity" onClick={()=>onOpen(s)}><div className="ticker"><b>{s.ticker}</b><span>{s.name}</span></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div><div className="opBody"><span className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</span><span>PEG {fmt(s.peg,2)}</span><span>Fwd P/E {fmt(s.forward_pe,1)}x</span></div><div className="miniVal">ราคา <b>{usd(price)} <i className={change>=0?"up":"down"}>{change==null?"":(change>=0?"+":"")+fmt(change,1)+"%"}</i></b></div></button>}

function Ranking({rows,onOpen}){return <div className="section"><SectionHead title="จัดอันดับตามคะแนนการลงทุนรวม" action={rows.length+" stocks"}/><div className="rankTable"><div className="rankHead"><span>#</span><span>หุ้น</span><span>ราคา</span><span>คะแนน</span><span>มูลค่า/ราคา</span><span>การเติบโต</span><span>คุณภาพ</span><span>โซน</span></div>{rows.map((s,i)=><button className="rankRow" key={s.ticker} onClick={()=>onOpen(s)}><span>{i+1}</span><span className="ticker"><b>{s.ticker}</b><small>{s.name}</small></span><span>{usd(s.price)}</span><span className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</span><span>{fmt(s.valuation_score,0)}</span><span>{fmt(s.growth_score,0)}</span><span>{fmt(s.quality_score,0)}</span><span><b className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</b></span></button>)}</div></div>}
function รายการติดตาม({rows,onOpen}){return <div className="section"><SectionHead title="หุ้นที่ติดตาม" action={rows.length+" รายการ"}/>{rows.length?<div className="watchList">{rows.map(s=><Opportunity key={s.ticker} s={s} onOpen={onOpen}/>)}</div>:<div className="empty">ยังไม่มีหุ้นใน รายการติดตาม — เปิดหุ้นจาก Ranking แล้วกด + เพิ่มในรายการติดตาม</div>}</div>}

function พอร์ตลงทุน({rows,totalValue,totalCost,totalPnl,onOpen}){const ret=totalCost?(totalPnl/totalCost)*100:null;return <div className="portfolioPage"><div className="portfolioCards"><Metric label="ปัจจุบัน value" value={money(totalValue)}/><Metric label="ต้นทุน" value={money(totalCost)}/><Metric label="กำไร/ขาดทุน" value={(totalPnl>=0?"+":"")+money(totalPnl)} sub={ret==null?"":(ret>=0?"+":"")+fmt(ret,1)+"%"}/></div><div className="section"><SectionHead title="หุ้นในพอร์ต" action={rows.length+" รายการ"}/>{rows.length?<div className="holdings">{rows.map(s=><button className="holding" key={s.ticker} onClick={()=>onOpen(s)}><span><b>{s.ticker}</b><small>{fmt(s.qty,4)} shares · avg {usd(s.avg)}</small></span><span><b>{money(s.value)}</b><small className={s.pnl>=0?"up":"down"}>{s.pnl>=0?"+":""}{money(s.pnl)}</small></span></button>)}</div>:<div className="empty">ยังไม่มีหุ้นใน พอร์ตลงทุน — เปิดหุ้นแล้วกรอกจำนวนหุ้นและต้นทุนเฉลี่ย</div>}</div></div>}

function ข่าวItem({n}){return <a className="newsItem" href={n.url||"#"} target="_blank" rel="noreferrer"><span className="newsTicker">{n.ticker}</span><div><b>{n.title}</b><small>{n.source||"ข่าว"} · {n.publishedAt?dateShort(n.publishedAt):""}</small></div></a>}

function หุ้นDrawer({insights:insight,stock:s,onClose,onAI,ai,aiLoading,watch,setWatch,portfolio,setพอร์ตลงทุน,onRemove}){
 const isWatch=watch.includes(s.ticker),[qty,setQty]=useState(portfolio[s.ticker]?.qty||""),[avg,setAvg]=useState(portfolio[s.ticker]?.avg||"");
 const price=Number(s.price||s.db_price||0),upside=s.fair_value_base&&price?((Number(s.fair_value_base)/price-1)*100):null;
 const pegReliable=!((s.industry||"").toLowerCase().includes("semiconductor")||((s.sector||"").toLowerCase().includes("consumer")&&Number(s.growth_current||0)>Number(s.growth_next||0)*1.8));
 function saveHolding(){const q=Number(qty),a=Number(avg);if(q>0&&a>0)setพอร์ตลงทุน(p=>({...p,[s.ticker]:{qty:q,avg:a}}));else setพอร์ตลงทุน(p=>{const x={...p};delete x[s.ticker];return x})}
 return <div className="drawerBack" onMouseDown={onClose}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={onClose}>×</button>
 <div className="drawerTop"><div><span className="eyebrow">{s.sector} · {s.industry}</span><h2>{s.ticker}</h2><p>{s.name}</p></div><div className={scoreClass(s.overall_score)}>{fmt(s.overall_score,0)}</div></div>
 <div className="priceLine"><strong>{usd(price)}</strong><span>มูลค่ายุติธรรม {usd(s.fair_value_base)}</span><span className={upside>=0?"up":"down"}>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</span></div><div className="freshness">อัปเดตข้อมูล {s.updated_at?new Date(s.updated_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—"} · {s.data_source||"Supabase"}</div>
 <div className="actions2"><button className="primary" onClick={()=>setWatch(w=>isWatch?w.filter(x=>x!==s.ticker):[...w,s.ticker])}>{isWatch?"✓ ✓ อยู่ในรายการติดตาม":"+ + เพิ่มในรายการติดตาม"}</button><button className="secondary" onClick={onAI}>{aiLoading?"กำลังวิเคราะห์…":"ให้ Gemini วิเคราะห์"}</button><button className="dangerBtn" onClick={onRemove}>ลบหุ้นออก</button></div>
 <div className="zone"><span className={"badge "+badgeClass(s.buy_zone)}>{s.buy_zone}</span><div><small>ช่วงมูลค่ายุติธรรม</small><b>{usd(s.fair_value_low)} / {usd(s.fair_value_base)} / {usd(s.fair_value_high)}</b></div></div>
 <InvestmentSnapshot stock={s} price={price} upside={upside}/>
 <GrowthValuationFit stock={s}/>
 <PriceScenario stock={s} price={price}/>
 <Block title="สถานะในพอร์ต"><div className="positionForm"><label>จำนวนหุ้น<input type="number" min="0" step="any" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/></label><label>ต้นทุนเฉลี่ย<input type="number" min="0" step="any" value={avg} onChange={e=>setAvg(e.target.value)} placeholder="0.00"/></label><button className="primary" onClick={saveHolding}>บันทึกสถานะ</button></div></Block>
 <BusinessDecision stock={s}/><IntelligencePanel s={s} insight={insight}/><Block title="มูลค่า/ราคา"><Grid items={[["Forward P/E",s.forward_pe?fmt(s.forward_pe,1)+"x":"—"],["PEG",s.peg?fmt(s.peg,2):"—"],["Industry Fwd P/E",s.industry_forward_pe?fmt(s.industry_forward_pe,1)+"x":"—"],["Trailing P/E",s.trailing_pe?fmt(s.trailing_pe,1)+"x":"N/A"]]}/><div className="priceOutlook"><b>โอกาสราคาจากมูลค่ายุติธรรม</b><strong>{upside==null?"—":(upside>=0?"+":"")+fmt(upside,1)+"%"}</strong><small>คำนวณจากราคาปัจจุบันเทียบกับ Fair Value Base ไม่ใช่การรับประกันราคาหุ้น</small></div><AnalystTarget news={s.news||[]} price={price}/></Block>
 <Block title="โอกาสการเติบโต"><div className="growthHighlight"><strong>{pct(s.growth_next)}</strong><span>คาดการณ์การเติบโตของกำไรปีหน้า</span></div><Grid items={[["ปัจจุบัน",pct(s.growth_current)],["ปีหน้า",pct(s.growth_next)],["ระยะยาว",pct(s.growth_long)],["รายได้",pct(s.revenue_growth)]]}/></Block><Block title="ข่าวที่สนับสนุนการเติบโต"><PositiveNews news={s.news||[]}/></Block>
 <Block title="คุณภาพธุรกิจและความเสี่ยง"><Grid items={[["ROE",pct(s.roe)],["Profit margin",pct(s.profit_margin)],["กระแสเงินสดอิสระ",usd(s.free_cash_flow)],["หนี้สิน / ทุน",fmt(s.debt_to_equity,2)],["Beta",fmt(s.beta,2)]]}/></Block>
 <div className="newsPriceNote">ข่าวสามารถทำให้ราคาเปลี่ยนได้ โดยเฉพาะการปรับ Guidance, EPS/Revenue estimates หรือราคาเป้าหมายของนักวิเคราะห์ แต่ระบบจะแสดง % จากข่าวเฉพาะเมื่อมีตัวเลขอ้างอิงชัดเจนในข่าว</div><div className="reliability"><b>ความน่าเชื่อถือของ PEG</b><span>{pegReliable?"ใช้ประกอบการประเมินได้ แต่ควรดูความสม่ำเสมอของกำไรและวัฏจักรร่วมด้วย.":"ความเชื่อมั่นต่ำลง เพราะกำไรที่ผันผวนหรือเป็นวัฏจักรอาจทำให้ PEG คลาดเคลื่อน จึงไม่ควรพึ่ง PEG เพียงอย่างเดียว."}</span></div>
 <Block title="เหตุผลของคะแนน"><p className="explanation">{s.explanation||"ยังไม่มีคำอธิบาย"}</p></Block>
 {ai&&<div className="aiResult"><b>วิเคราะห์โดย Gemini</b><p>{ai}</p></div>}<p className="drawerNote">AI เป็นเครื่องมือช่วยวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน และใช้เฉพาะข้อมูลที่ Dashboard มีให้</p>
 </aside></div>
}
function BusinessDecision({stock:s}){
 const d=investmentDecision(s);
 return <section className={"businessDecision "+(d.score>=68?"good":d.score<45?"bad":"wait")}>
  <div className="decisionTop"><div><span className="eyebrow">INVESTMENT DECISION</span><h3>สรุปว่าหุ้นนี้น่าลงทุนไหม?</h3></div><strong>{d.label}</strong></div>
  <div className="decisionScore"><span>Investment Score</span><b>{fmt(d.score,0)}</b><small>/ 100</small></div>
  <div className="decisionGrid"><div><span>สุขภาพธุรกิจ</span><b>{fmt(d.business,0)}</b></div><div><span>ฐานะการเงิน</span><b>{fmt(d.financial,0)}</b></div><div><span>Valuation</span><b>{fmt(d.valuation,0)}</b></div><div><span>ความเสี่ยง</span><b>{fmt(d.risk,0)}</b></div></div>
  <div className="decisionWhy"><b>อุตสาหกรรม:</b> {d.industry}<br/><b>ปัจจัยบวก:</b> {d.positives.length?d.positives.join(" · "):"ยังไม่มีข้อมูลเพียงพอ"}{d.warnings.length?<><br/><b>สัญญาณเตือน:</b> {d.warnings.join(" · ")}</>:""}</div>
  <small>คะแนนนี้เป็นการคำนวณจากข้อมูลพื้นฐานที่มีอยู่จริงและ KPI ที่ปรับตามกลุ่มอุตสาหกรรม ไม่ใช่คำแนะนำซื้อขาย และจะถูกปรับเมื่อข้อมูลใหม่เข้ามา</small>
 </section>
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

function GrowthValuationFit({stock:s}){
 const price=num(s.price), pe=num(s.forward_pe), growth=num(s.growth_next), longGrowth=num(s.growth_long), industryPe=num(s.industry_forward_pe);
 const valid=price>0&&pe>0&&growth>0;
 const forwardEps=valid?price/pe:null;
 const peg=valid?pe/growth:null;
 const industryAnchor=industryPe>0?industryPe:pe;
 const growthSupportedPe=valid?growth:null;
 const targetPeBase=valid?((industryAnchor*0.6)+(growthSupportedPe*0.4)):null;
 const targetPeBear=valid?((industryAnchor*0.75)+(growth*0.25)):null;
 const targetPeBull=valid?((industryAnchor*0.45)+(growth*0.55)):null;
 const g3=longGrowth!=null&&longGrowth>0?longGrowth:growth;
 const eps3=forwardEps&&g3!=null?forwardEps*Math.pow(1+g3/100,2):null;
 const priceBear=eps3&&targetPeBear?eps3*targetPeBear:null;
 const priceBase=eps3&&targetPeBase?eps3*targetPeBase:null;
 const priceBull=eps3&&targetPeBull?eps3*targetPeBull:null;
 const baseUpside=priceBase&&price?((priceBase/price)-1)*100:null;
 let status="ยังประเมินไม่ได้",tone="neutral",reason="ต้องมีราคาปัจจุบัน, Forward P/E และ Growth เพื่อสร้างกรอบราคา";
 if(valid){
   if(peg<=1){status="P/E สอดคล้องกับการเติบโต";tone="positive";reason="Valuation ปัจจุบันไม่สูงเมื่อเทียบกับ Growth";}
   else if(peg<=1.5){status="P/E ค่อนข้างสอดคล้อง";tone="positive";reason="Valuation สูงกว่า Growth บางส่วน แต่ยังอยู่ในกรอบที่รับได้";}
   else if(peg<=2){status="P/E เริ่มตึง";tone="neutral";reason="ราคาหุ้นสะท้อน Growth ไปพอสมควรแล้ว";}
   else{status="P/E แพงเมื่อเทียบกับการเติบโต";tone="negative";reason="ราคาต้องการ Growth ที่สูงเพื่อรองรับ Valuation";}
 }
 const upsideText=(v)=>v==null||!price?"ต้องมีข้อมูล":(v/price-1>=0?"+":"")+fmt(v/price*100-100,1)+"%";
 return <section className={"growthFit "+tone}>
  <div className="growthFitHead"><div><span className="eyebrow">GROWTH × VALUATION</span><h3>การเติบโตสอดคล้องกับ P/E และราคาหุ้นหรือไม่?</h3></div><span className="fitBadge">{status}</span></div>
  <div className="fitGrid">
   <div><span>Forward P/E</span><b>{valid?fmt(pe,1)+"x":"—"}</b></div>
   <div><span>กำไรปีหน้าโต</span><b>{valid?pct(growth):"—"}</b></div>
   <div><span>PEG โดยประมาณ</span><b>{valid?fmt(peg,2):"—"}</b></div>
  </div>
  <div className="priceEstimateGrid">
   <div><span>ราคาประเมินกรณีลบ</span><b>{priceBear?usd(priceBear):"—"}</b><small>{upsideText(priceBear)}</small></div>
   <div><span>ราคาประเมินกรณีฐาน</span><b>{priceBase?usd(priceBase):"—"}</b><small>{upsideText(priceBase)}</small></div>
   <div><span>ราคาประเมินกรณีบวก</span><b>{priceBull?usd(priceBull):"—"}</b><small>{upsideText(priceBull)}</small></div>
  </div>
  <p><b>วิเคราะห์:</b> {reason} {priceBase&&price?"กรณีฐานให้ Upside ประมาณ "+(baseUpside>=0?"+":"")+fmt(baseUpside,1)+"%":""}</p>
  <small>วิธีคำนวณ: ใช้ Forward EPS โดยประมาณ (ราคาปัจจุบัน ÷ Forward P/E) แล้วเติบโตต่อ 2 ปีด้วย Growth ระยะยาว/ปีหน้า จากนั้นคูณด้วย Target P/E ที่ถ่วงระหว่าง Industry Forward P/E กับ P/E ที่รองรับ Growth. เป็นกรอบประเมินจากสมมติฐาน ไม่ใช่ราคาเป้าหมายจากนักวิเคราะห์ และไม่ใช่การรับประกันราคา</small>
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



function IntelligencePanel({s,insight}){
 if(!insight) return <div className="empty compact">ยังไม่มีข้อมูลประวัติสำหรับวิเคราะห์เชิงลึก</div>;
 const h=insight.historical||{}, r=insight.revision||{}, p=insight.peers||{};
 const current=Number(s.forward_pe), peer=Number(p.avgForwardPE), growth=Number(s.growth_next), pg=Number(p.avgGrowth);
 const low=Number(s.fair_value_low),base=Number(s.fair_value_base),high=Number(s.fair_value_high),price=Number(s.price);
 const expected=low>0&&base>0&&high>0?(low*.25+base*.5+high*.25):null;
 const expectedUpside=expected&&price>0?((expected/price)-1)*100:null;
 const relative=current>0&&peer>0?((current/peer)-1)*100:null;
 const fit=current>0&&growth>0?current/growth:null;
 const thesis=[];
 if(growth>0) thesis.push("กำไรมีแนวโน้มเติบโต");
 if(relative!=null&&relative<=10) thesis.push("Valuation ไม่ได้สูงกว่าค่าเฉลี่ยกลุ่มมาก");
 if(r.trend==="ปรับประมาณการขึ้น") thesis.push("ประมาณการกำไรมีทิศทางดีขึ้น");
 const risks=[];
 if(r.trend==="ปรับประมาณการลง") risks.push("ประมาณการกำไรถูกปรับลง");
 if(relative!=null&&relative>25) risks.push("P/E สูงกว่าค่าเฉลี่ยกลุ่มมาก");
 if(insight.industryCycle==="ชะลอกว่ากลุ่ม") risks.push("Growth ชะลอกว่าค่าเฉลี่ยกลุ่ม");
 return <section className="deepIntelligence">
  <div className="decisionHead"><div><span className="eyebrow">DEEP INVESTMENT CHECK</span><h3>อดีต · คู่แข่ง · Revision · วัฏจักร</h3></div></div>
  <div className="intelGrid">
   <div><span>Forward P/E ปัจจุบัน</span><b>{current>0?fmt(current,1)+"x":"—"}</b><small>Median ในประวัติ {h.median?fmt(h.median,1)+"x":"ข้อมูลไม่พอ"}</small></div>
   <div><span>ตำแหน่ง P/E ในอดีต</span><b>{h.percentile!=null?h.percentile+"th percentile":"—"}</b><small>{h.percentile!=null?(h.percentile>=80?"ค่อนข้างแพง":h.percentile<=30?"ค่อนข้างถูก":"อยู่ในกรอบกลาง"):"ต้องสะสมข้อมูลเพิ่ม"}</small></div>
   <div><span>Revision ของ Growth</span><b>{r.trend}</b><small>{r.delta!=null?((r.delta>=0?"+":"")+fmt(r.delta,1)+" จุดจาก snapshot ล่าสุดที่มี"): "ข้อมูลยังไม่พอ"}</small></div>
   <div><span>วัฏจักรอุตสาหกรรม</span><b>{insight.industryCycle}</b><small>{p.avgGrowth!=null?"Growth กลุ่มเฉลี่ย "+pct(p.avgGrowth):"ยังไม่มีค่าเฉลี่ยกลุ่ม"}</small></div>
  </div>
  <div className="peerCompare"><div><b>เทียบคู่แข่ง/กลุ่ม</b><span>กลุ่ม: {insight.industry}</span></div><div className="peerStats"><span>P/E หุ้น <b>{current>0?fmt(current,1)+"x":"—"}</b></span><span>P/E กลุ่ม <b>{peer>0?fmt(peer,1)+"x":"—"}</b></span><span>Growth หุ้น <b>{Number.isFinite(growth)?pct(growth):"—"}</b></span><span>Growth กลุ่ม <b>{pg!=null?pct(pg):"—"}</b></span></div>{relative!=null&&<small>{relative>=0?"+":""}{fmt(relative,1)}% เทียบ P/E เฉลี่ยของกลุ่ม</small>}</div>
  <div className="thesisGrid"><div><b>เหตุผลที่น่าสนใจ</b><p>{thesis.length?thesis.join(" · "):"ยังไม่มีข้อมูลเพียงพอ"}</p></div><div><b>สิ่งที่อาจทำให้ Thesis ผิด</b><p>{risks.length?risks.join(" · "):"ยังไม่พบสัญญาณเตือนจากข้อมูลที่มี"}</p></div></div>
  <div className="scenarioProbability"><b>Expected Value แบบสถานการณ์</b>{expected!=null?<><strong>{usd(expected)}</strong><span className={expectedUpside>=0?"up":"down"}>{expectedUpside>=0?"+":""}{fmt(expectedUpside,1)}% จากราคาปัจจุบัน</span></>:<span>ยังไม่มี Fair Value ครบ 3 ระดับ</span>}<div><span>Bear 25%</span><span>Base 50%</span><span>Bull 25%</span></div><small>ใช้ความน่าจะเป็น 25/50/25 เป็น “สมมติฐานของโมเดล” ไม่ใช่ความน่าจะเป็นจากตลาด และคำนวณจาก Fair Value Low/Base/High เมื่อมีข้อมูลครบ</small></div>
 </section>
}

function AnalystTarget({news,price}){
 const x=extractAnalystTarget(news,price);
 if(!x) return <div className="targetCard mutedTarget"><b>ราคาเป้าหมายนักวิเคราะห์</b><strong>ยังไม่มีข้อมูล</strong><small>ระบบจะแสดงตัวเลขเมื่อข่าวมีราคาเป้าหมายที่ระบุชัดเจนเท่านั้น — ไม่คาดเดาตัวเลขเอง</small></div>;
 return <div className="targetCard"><div><b>ราคาเป้าหมายนักวิเคราะห์จากข่าว</b><small>{x.source}</small></div><strong>{usd(x.target)}</strong><span className={x.upside>=0?"up":"down"}>{x.upside==null?"—":(x.upside>=0?"+":"")+fmt(x.upside,1)+"% จากราคาปัจจุบัน"}</span><a href={x.url||"#"} target="_blank" rel="noreferrer">ดูข่าวอ้างอิง →</a></div>
}
function AIChat({input,setInput,messages,loading,onSend,onClose}){return <div className="aiChat"><div className="aiChatHead"><b>Pulse AI</b><button onClick={onClose}>×</button></div><div className="aiChatBody">{messages.length?messages.map((m,i)=><div key={i} className={"chatMsg "+m.role}>{m.text}</div>):<div className="empty compact">ถามได้ เช่น “หุ้นตัวไหนน่าสนใจที่สุดตอนนี้?” หรือ “NVDA มีความเสี่ยงอะไร?”</div>}{loading&&<div className="chatMsg assistant">กำลังวิเคราะห์…</div>}</div><form onSubmit={e=>{e.preventDefault();onSend()}} className="aiChatForm"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="ถามเกี่ยวกับหุ้นหรือพอร์ต…"/><button className="primary" type="submit">ส่ง</button></form></div>}
