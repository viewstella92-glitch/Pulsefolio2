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

export async function GET(){
  const tickers=await getTickers();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return NextResponse.json({earnings:[],updatedAt:new Date().toISOString(),tickerCount:tickers.length,sourceCoverage:{}});
  try{
    const q=new URLSearchParams();
    q.set("select","ticker,earnings_date,earnings_source,earnings_estimated");
    q.set("ticker","in.("+tickers.join(",")+")");
    q.set("earnings_date","not.is.null");
    const r=await fetch(url+"/rest/v1/stock_fundamentals?"+q.toString(),{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    if(!r.ok)throw new Error("Earnings data unavailable");
    const rows=await r.json();
    const earnings=rows.map(x=>({ticker:x.ticker,date:x.earnings_date,estimated:x.earnings_estimated!==false,history:[],trend:[],source:x.earnings_source||"Stored earnings source"})).sort((a,b)=>new Date(a.date)-new Date(b.date));
    return NextResponse.json({earnings,updatedAt:new Date().toISOString(),tickerCount:tickers.length,sourceCoverage:earnings.reduce((m,x)=>(m[x.source]=(m[x.source]||0)+1,m),{})});
  }catch(e){
    return NextResponse.json({earnings:[],updatedAt:new Date().toISOString(),tickerCount:tickers.length,sourceCoverage:{},error:e?.message||"Earnings data unavailable"},{status:200});
  }
}
