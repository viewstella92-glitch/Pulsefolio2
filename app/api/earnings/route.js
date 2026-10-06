import { NextResponse } from "next/server";

const FALLBACK_TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];
const clean=s=>(s||"").replace(/\\s+/g," ").trim();

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
    const rows=await r.json();
    return new Map(rows.map(x=>[x.ticker,x]));
  }catch{return new Map()}
}

async function getJinaEarnings(ticker){
  try{
    const r=await fetch("https://r.jina.ai/https://www.earningstoday.com/stocks/"+encodeURIComponent(ticker)+"/earnings-date",{headers:{"Accept":"text/plain","User-Agent":"Mozilla/5.0"},cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(!r.ok)return null;
    const text=clean(await r.text());
    const m=text.match(/Next earnings report\\s+([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})/i);
    if(!m)return null;
    const date=new Date(m[1]);
    if(Number.isNaN(date.getTime())||date.getTime()<Date.now()-86400000)return null;
    return {ticker,date:date.toISOString(),estimated:true,history:[],trend:[],source:"EarningsToday via Jina"};
  }catch{return null}
}

export async function GET(){
  const tickers=await getTickers();
  const stored=await getStored();
  const rows=[];
  for(const ticker of tickers){
    const x=stored.get(ticker);
    if(x?.earnings_date)rows.push({ticker,date:x.earnings_date,estimated:x.earnings_estimated!==false,history:[],trend:[],source:x.earnings_source||"Synced earnings source"});
  }
  const missing=tickers.filter(t=>!stored.get(t)?.earnings_date);
  const live=(await Promise.all(missing.map(getJinaEarnings))).filter(Boolean);
  rows.push(...live);
  rows.sort((a,b)=>new Date(a.date)-new Date(b.date));
  return NextResponse.json({earnings:rows,updatedAt:new Date().toISOString(),tickerCount:tickers.length,sourceCoverage:rows.reduce((m,x)=>(m[x.source]=(m[x.source]||0)+1,m),{})});
}
