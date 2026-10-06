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
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const pct=v=>{const n=Number(v);return Number.isFinite(n)?Math.abs(n)<=2?n*100:n:null};

async function getYahoo(ticker){
  try{
    const u="https://query2.finance.yahoo.com/v10/finance/quoteSummary/"+encodeURIComponent(ticker)+"?modules=calendarEvents,earningsHistory,earningsTrend&formatted=false&lang=en-US&region=US&corsDomain=finance.yahoo.com";
    const r=await fetch(u,{headers:{"User-Agent":UA},next:{revalidate:1800}});
    if(!r.ok)return null;
    const q=(await r.json())?.quoteSummary?.result?.[0],e=q?.calendarEvents?.earnings;
    const raw=e?.earningsDate?.[0]?.raw;
    const history=(q?.earningsHistory?.history||[]).slice(0,8).map(x=>({date:x?.quarter?.raw?new Date(x.quarter.raw*1000).toISOString():null,epsActual:x?.epsActual?.raw??null,epsEstimate:x?.epsEstimate?.raw??null,surprisePercent:x?.surprisePercent?.raw!=null?pct(x.surprisePercent.raw):null})).filter(x=>x.date);
    const trend=(q?.earningsTrend?.trend||[]).slice(0,5).map(x=>({period:x?.period||null,epsEstimate:x?.earningsEstimate?.avg?.raw??null,revenueEstimate:x?.revenueEstimate?.avg?.raw??null,epsGrowth:pct(x?.earningsEstimate?.growth?.raw??x?.earningsEstimate?.growth?.fmt),revenueGrowth:pct(x?.revenueEstimate?.growth?.raw??x?.revenueEstimate?.growth?.fmt),analystCount:x?.earningsEstimate?.numberOfAnalysts?.raw??null}));
    return {ticker,date:raw?new Date(raw*1000).toISOString():null,estimated:Boolean(e?.isEarningsDateEstimate),epsAverage:e?.earningsAverage?.raw??null,revenueAverage:e?.revenueAverage?.raw??null,history,trend,source:"Yahoo Finance"};
  }catch{return null}
}

async function getEarningsToday(ticker){
  try{
    const r=await fetch("https://www.earningstoday.com/stocks/"+encodeURIComponent(ticker)+"/earnings-date",{headers:{"User-Agent":UA},cache:"no-store"});
    if(!r.ok)return null;
    const html=await r.text();
    const patterns=[
      /dateTime(?:\\?["']|["'])\\s*:\\s*(?:\\?["']|["'])(\\d{4}-\\d{2}-\\d{2})/i,
      /earningsDate(?:\\?["']|["'])\\s*:\\s*(?:\\?["']|["'])(\\d{4}-\\d{2}-\\d{2})/i,
      /Earnings Date[^A-Za-z0-9]{0,30}(\\d{1,2}\\/\\d{1,2}\\/\\d{4})/i
    ];
    let value=null;
    for(const p of patterns){const m=html.match(p);if(m){value=m[1];break;}}
    if(!value)return null;
    const iso=/^\\d{4}-\\d{2}-\\d{2}$/.test(value)?value:value.replace(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/,"$3-$1-$2");
    const date=new Date(iso+"T00:00:00Z");
    if(Number.isNaN(date.getTime()))return null;
    return {ticker,date:date.toISOString(),estimated:true,history:[],trend:[],source:"EarningsToday"};
  }catch{return null}
}

async function getStockAnalysis(ticker){
  try{
    const r=await fetch("https://stockanalysis.com/stocks/"+encodeURIComponent(ticker)+"/",{headers:{"User-Agent":UA},cache:"no-store"});
    if(!r.ok)return null;
    const html=await r.text();
    const text=html.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
    const patterns=[
      /(?:Est\\.? Earnings|Earnings Date)\\s*[:\\-]?\\s*([A-Z][a-z]{2}\\s+\\d{1,2}(?:,\\s*\\d{4})?)/i,
      /earningsDate[^0-9]{0,30}(\\d{4}-\\d{2}-\\d{2})/i
    ];
    let value=null;
    for(const p of patterns){const m=text.match(p);if(m){value=m[1];break;}}
    if(!value)return null;
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return null;
    return {ticker,date:date.toISOString(),estimated:true,history:[],trend:[],source:"StockAnalysis / S&P Global"};
  }catch{return null}
}

async function getOne(ticker){
  const y=await getYahoo(ticker);
  if(y&&(y.date||y.history.length||y.trend.length))return y;
  return (await getEarningsToday(ticker)) || (await getStockAnalysis(ticker));
}

export async function GET(){
  const tickers=await getTickers();
  const rows=(await Promise.all(tickers.map(getOne))).filter(Boolean).sort((a,b)=>{if(!a.date)return 1;if(!b.date)return -1;return new Date(a.date)-new Date(b.date)});
  return NextResponse.json({earnings:rows,updatedAt:new Date().toISOString(),tickerCount:tickers.length,sourceCoverage:rows.reduce((m,x)=>(m[x.source]=(m[x.source]||0)+1,m),{})});
}