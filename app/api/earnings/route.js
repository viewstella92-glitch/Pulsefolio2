import { NextResponse } from "next/server";

const FALLBACK_TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];
async function getTickers(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return FALLBACK_TICKERS;
  try{
    const r=await fetch(url+"/rest/v1/stock_universe?select=ticker&active=eq.true",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    if(!r.ok)return FALLBACK_TICKERS;
    const rows=await r.json();
    const tickers=rows.map(x=>x.ticker).filter(Boolean);
    return tickers.length?tickers:FALLBACK_TICKERS;
  }catch{return FALLBACK_TICKERS}
}
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

async function getOne(ticker){
  try{
    const u="https://query2.finance.yahoo.com/v10/finance/quoteSummary/"+ticker+"?modules=calendarEvents,earningsHistory,earningsTrend&formatted=false&lang=en-US&region=US&corsDomain=finance.yahoo.com";
    const r=await fetch(u,{headers:{"User-Agent":UA},next:{revalidate:1800}});
    if(!r.ok)return null;
    const d=await r.json();
    const q=d?.quoteSummary?.result?.[0];
    const e=q?.calendarEvents?.earnings;
    const raw=e?.earningsDate?.[0]?.raw;
    const history=(q?.earningsHistory?.history||[]).slice(0,8).map(x=>({
      date:x?.quarter?.raw?new Date(x.quarter.raw*1000).toISOString():null,
      epsActual:x?.epsActual?.raw??null,
      epsEstimate:x?.epsEstimate?.raw??null,
      surprisePercent:x?.surprisePercent?.raw!=null?Number(x.surprisePercent.raw)*100:null
    })).filter(x=>x.date);
    const trend=(q?.earningsTrend?.trend||[]).slice(0,5).map(x=>({
      period:x?.period||null,
      epsEstimate:x?.earningsEstimate?.avg?.raw??null,
      revenueEstimate:x?.revenueEstimate?.avg?.raw??null,
      epsGrowth:(()=>{const v=x?.earningsEstimate?.growth?.raw??x?.earningsEstimate?.growth?.fmt;return v==null?null:(Math.abs(Number(v))<=2?Number(v)*100:Number(v))})(),
      revenueGrowth:(()=>{const v=x?.revenueEstimate?.growth?.raw??x?.revenueEstimate?.growth?.fmt;return v==null?null:(Math.abs(Number(v))<=2?Number(v)*100:Number(v))})(),
      analystCount:x?.earningsEstimate?.numberOfAnalysts?.raw??null
    }));
    return {
      ticker,
      date:raw?new Date(raw*1000).toISOString():null,
      estimated:Boolean(e?.isEarningsDateEstimate),
      epsAverage:e?.earningsAverage?.raw??null,
      revenueAverage:e?.revenueAverage?.raw??null,
      history,
      trend
    };
  }catch{return null}
}

export async function GET(){
  const rows=(await Promise.all(TICKERS.map(getOne))).filter(Boolean).sort((a,b)=>{
    if(!a.date)return 1;if(!b.date)return -1;return new Date(a.date)-new Date(b.date);
  });
  return NextResponse.json({earnings:rows,updatedAt:new Date().toISOString()});
}