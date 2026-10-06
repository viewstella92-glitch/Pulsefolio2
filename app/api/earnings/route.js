import { NextResponse } from "next/server";

const FALLBACK_TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];

async function getTickers(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return FALLBACK_TICKERS;
  try{
    const r=await fetch(url+"/rest/v1/stock_universe?select=ticker&active=eq.true",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    if(!r.ok)return FALLBACK_TICKERS;
    const rows=await r.json(),tickers=rows.map(x=>String(x.ticker||"").trim().toUpperCase()).filter(Boolean);
    return tickers.length?tickers:FALLBACK_TICKERS;
  }catch{return FALLBACK_TICKERS}
}

async function getStored(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return new Map();
  try{
    const r=await fetch(url+"/rest/v1/stock_fundamentals?select=ticker,earnings_date,earnings_source,earnings_estimated&earnings_date=not.is.null",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    if(!r.ok)return new Map();
    return new Map((await r.json()).map(x=>[String(x.ticker).toUpperCase(),x]));
  }catch{return new Map()}
}

function num(v){if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}

async function alpha(symbol,fn){
  const key=process.env.ALPHAVANTAGE_API_KEY;
  if(!key)return {data:null,error:"ALPHAVANTAGE_API_KEY is not configured"};
  try{
    const r=await fetch("https://www.alphavantage.co/query?function="+fn+"&symbol="+encodeURIComponent(symbol)+"&apikey="+encodeURIComponent(key),{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {data:null,error:"Alpha Vantage HTTP "+r.status};
    const j=await r.json();
    if(j.Note||j.Information)return {data:null,error:j.Note||j.Information};
    if(j["Error Message"])return {data:null,error:j["Error Message"]};
    return {data:j};
  }catch(e){return {data:null,error:e?.message||"Alpha Vantage request failed"}}
}

async function calendar(tickers){
  const key=process.env.ALPHAVANTAGE_API_KEY;
  if(!key)return {rows:[],error:"ALPHAVANTAGE_API_KEY is not configured"};
  try{
    const r=await fetch("https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&datatype=csv&apikey="+encodeURIComponent(key),{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {rows:[],error:"Alpha Vantage HTTP "+r.status};
    const text=await r.text();
    if(text.trim().startsWith("{")){
      try{const j=JSON.parse(text);return {rows:[],error:j.Note||j.Information||j["Error Message"]||"No calendar data"}}catch{}
    }
    const parse=line=>{
      const out=[];let cur="",quoted=false;
      for(let i=0;i<line.length;i++){
        const c=line[i];
        if(c==='"'&&line[i+1]==='"'){cur+='"';i++;continue}
        if(c==='"'){quoted=!quoted;continue}
        if(c===','&&!quoted){out.push(cur);cur="";continue}
        cur+=c;
      }
      out.push(cur);
      return out;
    };
    const lines=text.split(/\r?\n/).filter(Boolean);
    if(!lines.length)return {rows:[],error:"Empty calendar"};
    const headers=parse(lines[0]).map(x=>x.trim().toLowerCase()),wanted=new Set(tickers);
    return {rows:lines.slice(1).map(line=>{
      const cells=parse(line);
      return Object.fromEntries(headers.map((k,i)=>[k,(cells[i]||"").trim()]));
    }).filter(x=>wanted.has(String(x.symbol||"").toUpperCase()))};
  }catch(e){return {rows:[],error:e?.message||"Calendar request failed"}}
}

async function getCache(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return [];
  try{
    const r=await fetch(url+"/rest/v1/stock_earnings_cache?select=ticker,report_date,fiscal_date_ending,estimated,eps_estimate,eps_actual,surprise,surprise_pct,history,trend,source,fetched_at&order=report_date.asc",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    if(!r.ok)return [];
    return await r.json();
  }catch{return []}
}

export async function GET(){
  const tickers=await getTickers();
  const allowed=new Set(tickers);
  const cached=(await getCache()).filter(x=>allowed.has(String(x.ticker||"").toUpperCase()));
  const rows=cached.map(x=>({
    ticker:String(x.ticker).toUpperCase(),
    date:x.report_date,
    estimated:x.estimated!==false,
    epsEstimate:num(x.eps_estimate),
    epsActual:num(x.eps_actual),
    surprise:num(x.surprise),
    surprisePct:num(x.surprise_pct),
    history:Array.isArray(x.history)?x.history:[],
    trend:Array.isArray(x.trend)?x.trend:[],
    source:x.source||"Supabase earnings cache",
    fetchedAt:x.fetched_at
  })).filter(x=>x.date);
  const upcoming=rows.filter(x=>new Date(x.date)>=new Date()).length;
  return NextResponse.json({
    earnings:rows,
    updatedAt:new Date().toISOString(),
    tickerCount:tickers.length,
    coverage:rows.length,
    upcomingCoverage:upcoming,
    historyCoverage:rows.filter(x=>x.history.length).length,
    trendCoverage:rows.filter(x=>x.trend.length).length,
    sourceCoverage:rows.reduce((m,x)=>(m[x.source]=(m[x.source]||0)+1,m),{}),
    provider:"Supabase earnings cache",
    providerError:rows.length?"": "Earnings provider cache is empty for some active tickers"
  });
}
