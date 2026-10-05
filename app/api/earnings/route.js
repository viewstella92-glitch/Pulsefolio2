import { NextResponse } from "next/server";
const TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
async function getOne(ticker){
  try{
    const u="https://query2.finance.yahoo.com/v10/finance/quoteSummary/"+ticker+"?modules=calendarEvents&formatted=false&lang=en-US&region=US&corsDomain=finance.yahoo.com";
    const r=await fetch(u,{headers:{"User-Agent":UA},next:{revalidate:1800}});
    if(!r.ok)return null;
    const d=await r.json(); const e=d?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
    const raw=e?.earningsDate?.[0]?.raw;
    if(!raw)return null;
    return {ticker,date:new Date(raw*1000).toISOString(),estimated:Boolean(e?.isEarningsDateEstimate),epsAverage:e?.earningsAverage?.raw??null,revenueAverage:e?.revenueAverage?.raw??null};
  }catch{return null}
}
export async function GET(){
  const rows=(await Promise.all(TICKERS.map(getOne))).filter(Boolean).sort((a,b)=>new Date(a.date)-new Date(b.date));
  return NextResponse.json({earnings:rows,updatedAt:new Date().toISOString()});
}