import { callGemini } from "../../../lib/gemini";
import { getVerified } from "../../../lib/edgar";
export const maxDuration=60;
const ALIASES={nvidia:"NVDA","เอ็นวิเดีย":"NVDA","เอนวิเดีย":"NVDA","เอ็นวีเดีย":"NVDA",salesforce:"CRM","เซลส์ฟอร์ซ":"CRM","เซลฟอร์ซ":"CRM",cigna:"CI","ซิกน่า":"CI",micron:"MU","ไมครอน":"MU",adobe:"ADBE","อะโดบี":"ADBE","อโดบี":"ADBE",applovin:"APP","แอปเลิฟวิน":"APP",intuit:"INTU","อินทูอิท":"INTU",netflix:"NFLX","เน็ตฟลิกซ์":"NFLX","เน็ตฟลิก":"NFLX",vertiv:"VRT","เวอร์ทิฟ":"VRT",mercadolibre:"MELI","เมอร์คาโด":"MELI",grab:"GRAB","แกร็บ":"GRAB","แกรบ":"GRAB",zoetis:"ZTS","โซเอทิส":"ZTS",autozone:"AZO","ออโต้โซน":"AZO",blackrock:"BLK","แบล็คร็อค":"BLK","แบลคร็อก":"BLK",mastercard:"MA","มาสเตอร์การ์ด":"MA",apple:"AAPL","แอปเปิล":"AAPL","แอปเปิ้ล":"AAPL","arm holdings":"ARM","อาร์ม":"ARM","astera labs":"ALAB","แอสเทอรา":"ALAB",centrus:"LEU","เซ็นทรัส":"LEU","novo nordisk":"NVO","โนโว":"NVO",broadcom:"AVGO","บรอดคอม":"AVGO"};
const NAME_STOP=new Set(["the","inc","corp","corporation","company","holdings","group","global","international","american","united","first","new"]);
const BASE_COLS="ticker,name,price,trailing_pe,forward_pe,peg,growth_current,growth_next,growth_long,revenue_growth,roe,profit_margin,free_cash_flow,debt_to_equity,beta,industry_forward_pe,fair_value_low,fair_value_base,fair_value_high,market_cap,updated_at,data_source,data_quality,eps_estimate_current,eps_estimate_7d,eps_estimate_30d,eps_estimate_60d,eps_estimate_90d,earnings_revision_score";
const EXTRA_COLS="data_quality_details,field_sources,fair_value_assumptions";
const compactVerified=v=>{if(!v?.ok)return {ticker:v?.ticker,available:false,reason:v?.reason||"ไม่มีข้อมูลที่ตรวจสอบได้",trust:v?.trust||null};const m=v.metrics||{},p=x=>x?{value:x.value,asOf:x.asOf,filed:x.filed,basis:x.basis,source:x.source||"SEC EDGAR"}:null;return {ticker:v.ticker,name:v.name,price:v.price,revenueTtm:p(m.revenueTtm),netIncomeTtm:p(m.netIncomeTtm),epsDilutedTtm:p(m.epsDilutedTtm),freeCashFlowTtm:p(m.freeCashFlowTtm),equity:p(m.equity),longTermDebt:p(m.longTermDebt),cash:p(m.cash),sharesOutstanding:m.sharesOutstanding||null,valuation:v.valuation,derived:v.derived,trust:v.trust,fetchedAt:v.fetchedAt}};
const num=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
const reconcile=(fund,verified)=>{const out={...fund},conflicts=[];if(!verified?.ok)return {data:out,conflicts};const take=(field,value,source)=>{if(num(value)==null)return;const old=num(out[field]);if(old!=null&&Math.abs(old-value)>Math.max(Math.abs(value)*0.03,0.01))conflicts.push({field,fundamentals:old,verified:value});out[field]=value;out[field+"_source"]=source;};take("price",verified.price?.value,"VERIFIED: Yahoo Finance");take("trailing_pe",verified.valuation?.peTtm,"VERIFIED: Yahoo price / SEC EPS TTM");take("eps_trailing",verified.metrics?.epsDilutedTtm?.value,"VERIFIED: SEC EDGAR EPS TTM");take("free_cash_flow",verified.metrics?.freeCashFlowTtm?.value,"VERIFIED: SEC EDGAR CFO - CapEx");take("profit_margin",verified.derived?.netMarginPct,"VERIFIED: SEC EDGAR");take("roe",verified.derived?.roePct,"VERIFIED: SEC EDGAR");take("revenue_growth",verified.derived?.revenueGrowth?.pct,"VERIFIED: SEC EDGAR");take("market_cap",verified.valuation?.marketCap,"VERIFIED: Yahoo price x SEC shares");if(verified.derived?.debtToEquity!=null)take("debt_to_equity",verified.derived.debtToEquity*100,"VERIFIED: SEC EDGAR debt / equity");out.verified_trust=verified.trust?.level||null;out.verified_warnings=verified.trust?.warnings||[];out.reconciled=true;return {data:out,conflicts};};
const withTimeout=(promise,ms,fallback)=>Promise.race([promise,new Promise(r=>setTimeout(()=>r(fallback),ms))]);
export async function POST(req){
const key=process.env.GEMINI_API_KEY,supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(!key||!supabaseUrl||!supabaseKey)return Response.json({error:"AI/Supabase environment variables are missing"},{status:500});
try{
const body=await req.json().catch(()=>({}));
const question=typeof body?.question==="string"?body.question:typeof body?.message==="string"?body.message:"";
if(!question.trim())return Response.json({error:"กรุณาระบุคำถาม"},{status:400});
if(question.length>4000)return Response.json({error:"คำถามยาวเกินไป"},{status:400});
const history=Array.isArray(body?.history)?body.history.slice(-8).map(x=>({role:x?.role==="assistant"?"assistant":"user",text:String(x?.text??x?.content??"").slice(0,1500)})).filter(x=>x.text.trim()):[];
const headers={apikey:supabaseKey,Authorization:"Bearer "+supabaseKey},base=supabaseUrl+"/rest/v1/";
const getFundamentals=async()=>{const full=await fetch(base+"stock_fundamentals?select="+BASE_COLS+","+EXTRA_COLS,{headers,cache:"no-store"});if(full.ok)return full;return fetch(base+"stock_fundamentals?select="+BASE_COLS,{headers,cache:"no-store"});};
const [f,a,n,b,state]=await Promise.all([
getFundamentals(),
fetch(base+"stock_analysis?select=ticker,valuation_score,growth_score,quality_score,risk_score,news_score,updated_at",{headers,cache:"no-store"}),
fetch(base+"stock_news?select=ticker,title,source,summary,sentiment,category,impact_score,published_at&order=published_at.desc&limit=60",{headers,cache:"no-store"}),
fetch(base+"daily_market_briefing?select=briefing_date,briefing_text,generated_at&order=briefing_date.desc&limit=3",{headers,cache:"no-store"}),
fetch(base+"pulsefolio_state?id=eq.1&select=watchlist,portfolio",{headers,cache:"no-store"})]);
const [fundamentals,analysis,news,briefings,stateRows]=await Promise.all([f.json().catch(()=>[]),a.json().catch(()=>[]),n.json().catch(()=>[]),b.json().catch(()=>[]),state.json().catch(()=>[])]);
if(!f.ok||!a.ok||!n.ok||!b.ok||!state.ok)return Response.json({error:"โหลดข้อมูลจาก Supabase ไม่สำเร็จ"},{status:500});
const knownTickers=new Set((fundamentals||[]).map(x=>String(x.ticker||"").trim().toUpperCase()).filter(Boolean));
const tokenMatches=(question.match(/(?<![A-Za-z])\$?[A-Za-z]{1,5}(?:[.-][A-Za-z]{1,3})?(?![A-Za-z])/g)||[]).map(t=>t.replace(/^\$/,"").toUpperCase()).filter(t=>knownTickers.has(t));
const q=question.toLowerCase(),nameAlias=new Map(Object.entries(ALIASES));
for(const x of fundamentals||[]){const w=String(x.name||"").toLowerCase().split(/[\s,.]+/)[0];if(w.length>=5&&!NAME_STOP.has(w))nameAlias.set(w,String(x.ticker||"").toUpperCase())}
const aliasMatches=[...nameAlias].filter(([al,t])=>q.includes(al)&&knownTickers.has(t)).map(([,t])=>t),tickers=[...new Set([...tokenMatches,...aliasMatches])];
const stateRow=stateRows?.[0]||{watchlist:[],portfolio:{}},portfolioState={watchlist:Array.isArray(stateRow.watchlist)?stateRow.watchlist:[],portfolio:stateRow.portfolio&&typeof stateRow.portfolio==="object"?stateRow.portfolio:{}};
const mine=[...new Set([...Object.keys(portfolioState.portfolio),...portfolioState.watchlist])].map(x=>String(x).toUpperCase()),wantsMine=/พอร์ต|ถืออยู่|ติดตาม|portfolio|watchlist/i.test(question),scope=tickers.length?tickers:(wantsMine&&mine.length?mine:[]);
const filterByTicker=rows=>scope.length?(rows||[]).filter(x=>scope.includes(String(x.ticker||"").toUpperCase())):(rows||[]);
const compact=r=>({ticker:r.ticker,name:r.name,price:r.price,trailing_pe:r.trailing_pe,forward_pe:r.forward_pe,peg:r.peg,growth_current:r.growth_current,growth_next:r.growth_next,growth_long:r.growth_long,revenue_growth:r.revenue_growth,roe:r.roe,profit_margin:r.profit_margin,free_cash_flow:r.free_cash_flow,debt_to_equity:r.debt_to_equity,beta:r.beta,industry_forward_pe:r.industry_forward_pe,fair_value_low:r.fair_value_low,fair_value_base:r.fair_value_base,fair_value_high:r.fair_value_high,market_cap:r.market_cap,data_quality:r.data_quality,data_quality_details:r.data_quality_details,field_sources:r.field_sources, fair_value_assumptions:r.fair_value_assumptions,updated_at:r.updated_at,data_source:r.data_source});
const filteredFundamentals=scope.length?filterByTicker(fundamentals):(fundamentals||[]).map(compact),filteredAnalysis=filterByTicker(analysis),filteredNews=(scope.length?filterByTicker(news):(news||[]).slice(0,20)).map(x=>({...x,summary:String(x.summary||"").slice(0,200)}));
const rankedTickers=(fundamentals||[]).map(r=>{const scores=["valuation_score","growth_score","quality_score","risk_score","news_score"].map(k=>num((analysis||[]).find(a=>String(a.ticker||"").toUpperCase()===String(r.ticker||"").toUpperCase())?.[k])).filter(v=>v!=null);return {ticker:String(r.ticker||"").toUpperCase(),avg:scores.length?scores.reduce((x,y)=>x+y,0)/scores.length:-1};}).filter(x=>x.ticker).sort((x,y)=>y.avg-x.avg).map(x=>x.ticker);
    const verificationCandidates=[...new Set([...(tickers.length?tickers:[]),...(scope.length?scope:[]),...mine,...rankedTickers])].slice(0,5);
    const verifiedRows=verificationCandidates.length?await Promise.all(verificationCandidates.map(t=>withTimeout(getVerified(t),12000,{ok:false,ticker:t,reason:"หมดเวลาดึงข้อมูลจาก SEC"}))):[];
    const verifiedByTicker=new Map(verifiedRows.map(v=>[String(v.ticker||"").toUpperCase(),v]));
    const selectedFundamentals=scope.length?filterByTicker(fundamentals):(fundamentals||[]).map(compact);
    const conflicts=[];
    const reconciledFundamentals=selectedFundamentals.map(row=>{
      const v=verifiedByTicker.get(String(row.ticker||"").toUpperCase());
      if(!v)return row;
      const r=reconcile(row,v);
      for(const c of r.conflicts)conflicts.push({ticker:row.ticker,...c});
      return r.data;
    });
    const verified=verificationCandidates.map(t=>compactVerified(verifiedByTicker.get(t))).filter(Boolean);
const historyText=history.length?history.map(x=>(x.role==="assistant"?"AI":"ผู้ใช้")+": "+x.text).join("\n"):"ไม่มีประวัติบทสนทนา";
const scopeText=scope.length?"ใช้ Fundamentals / Analysis / News เฉพาะหุ้นในขอบเขตนี้: "+scope.join(", "):"ไม่พบ ticker หรือขอบเขตพอร์ต/รายการติดตามที่ตรงกับข้อมูล จึงส่งข้อมูลสรุปของหุ้นทั้งหมดที่มี และระบบตรวจสอบ SEC/Yahoo เพิ่มได้สูงสุด 5 หุ้นตามความเกี่ยวข้อง";
const prompt="คุณคือ AI Analyst ของ Pulsefolio\nกฎข้อมูล: ใช้เฉพาะข้อมูลที่แนบ ห้ามสร้าง/เดาตัวเลข ห้ามถือ null เป็นศูนย์; RECONCILED FUNDAMENTALS คือข้อมูลที่ระบบตรวจสอบและจัดลำดับแหล่งข้อมูลแล้ว; VERIFIED มีความสำคัญสูงกว่า FUNDAMENTALS เดิมสำหรับฟิลด์ที่ตรวจสอบได้; ถ้ามี RECONCILED CONFLICTS ให้แจ้งความขัดแย้งและใช้ค่า VERIFIED; ถ้า VERIFIED unavailable ให้ใช้ข้อมูลฐานต่อได้แต่ต้องบอกว่าตรวจสอบซ้ำไม่ได้; ห้ามสร้าง Forward P/E, PEG, growth_next, fair value หรือ target price; แยก asOf ของงบ/ราคาออกจาก updated_at ซึ่งเป็นเวลาซิงก์ฐานข้อมูล; เมื่ออ้างตัวเลขให้ระบุ source และ asOf/basis ถ้ามี; ตัวเลข ANALYSIS เป็นคะแนนย่อยไม่ใช่คะแนนรวม; ข่าวต้องมาจาก NEWS; ถ้าข้อมูลไม่พอให้บอกว่าไม่พอ; ตอบภาษาไทย กระชับ แยกข้อเท็จจริงจากการตีความ และห้ามฟันธงซื้อ/ขายหรือรับประกันผลตอบแทน.\n\nคำถาม:\n"+question+"\n\nประวัติ:\n"+historyText+"\n\nขอบเขต:\n"+scopeText+"\n\nWATCHLIST / PORTFOLIO:\n"+JSON.stringify(portfolioState)+"\n\nVERIFIED:\n"+JSON.stringify(verified)+"\n\nRECONCILED FUNDAMENTALS:\n"+JSON.stringify(reconciledFundamentals)+"\n\nRECONCILED CONFLICTS:\n"+JSON.stringify(conflicts)+"\n\nANALYSIS:\n"+JSON.stringify(filteredAnalysis)+"\n\nNEWS (summary <=200 chars):\n"+JSON.stringify(filteredNews)+"\n\nDAILY MARKET BRIEF:\n"+JSON.stringify(briefings||[]);
const result=await callGemini(prompt,key,{budgetMs:42000,perModelMs:20000});
if(!result.ok)return Response.json({error:result.reason,details:result.attempts},{status:502});
return Response.json({text:result.text,model:result.model,attempts:result.attempts,meta:{verifiedTickers:verificationCandidates,conflicts}});
}catch(e){return Response.json({error:e?.message||"AI chat failed"},{status:500})}}