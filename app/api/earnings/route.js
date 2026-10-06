import { NextResponse } from "next/server";

const FALLBACK_TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];

const clean=s=>(s??"").replace(/\s+/g," ").trim();

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
    return new Map(rows.map(x=>[String(x.ticker).toUpperCase(),x]));
  }catch{return new Map()}
}

function parseCsvLine(line){
  const out=[];let cur="",quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==="""&&line[i+1]==="""){cur+=""";i++;continue}
    if(c==="""){quoted=!quoted;continue}
    if(c===","&&!quoted){out.push(cur);cur="";continue}
    cur+=c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text){
  const lines=text.split(/\r?\n/).filter(Boolean);
  if(!lines.length)return [];
  const headers=parseCsvLine(lines[0]).map(x=>x.trim().toLowerCase());
  return lines.slice(1).map(line=>{
    const cells=parseCsvLine(line);
    return Object.fromEntries(headers.map((h,i)=>[h,(cells[i]??"").trim()]));
  });
}

async function getAlphaVantageCalendar(tickers){
  const key=process.env.ALPHAVANTAGE_API_KEY;
  if(!key)return {rows:[],error:"ALPHAVANTAGE_API_KEY is not configured"};
  try{
    const url="https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey="+encodeURIComponent(key);
    const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {rows:[],error:"Alpha Vantage HTTP "+r.status};
    const text=await r.text();
    if(text.trim().startsWith("{")){
      try{
        const j=JSON.parse(text);
        return {rows:[],error:j.Note||j.Information||j["Error Message"]||"Alpha Vantage returned no calendar data"};
      }catch{}
    }
    const wanted=new Set(tickers);
    const rows=parseCsv(text).filter(x=>wanted.has(String(x.symbol||"").toUpperCase()));
    return {rows};
  }catch(e){return {rows:[],error:e?.message||"Alpha Vantage request failed"}}
}

export async function GET(){
  const tickers=await getTickers();
  const stored=await getStored();
  const alpha=await getAlphaVantageCalendar(tickers);
  const rows=[];
  const seen=new Set();

  for(const x of alpha.rows){
    const ticker=String(x.symbol||"").toUpperCase();
    const date=x.reportDate;
    if(!ticker||!date||seen.has(ticker))continue;
    const parsed=new Date(date+"T00:00:00Z");
    if(Number.isNaN(parsed.getTime()))continue;
    const estimate=x.estimate===""?null:Number(x.estimate);
    rows.push({
      ticker,
      date:parsed.toISOString(),
      estimated:true,
      epsEstimate:Number.isFinite(estimate)?estimate:null,
      history:[],
      trend:[],
      source:"Alpha Vantage Earnings Calendar"
    });
    seen.add(ticker);
  }

  // Keep previously synced dates only when Alpha Vantage has no current calendar row.
  for(const ticker of tickers){
    if(seen.has(ticker))continue;
    const x=stored.get(ticker);
    if(x?.earnings_date){
      rows.push({
        ticker,
        date:x.earnings_date,
        estimated:x.earnings_estimated!==false,
        epsEstimate:null,
        history:[],
        trend:[],
        source:x.earnings_source||"Synced earnings source"
      });
      seen.add(ticker);
    }
  }

  rows.sort((a,b)=>new Date(a.date)-new Date(b.date));
  return NextResponse.json({
    earnings:rows,
    updatedAt:new Date().toISOString(),
    tickerCount:tickers.length,
    coverage:rows.length,
    sourceCoverage:rows.reduce((m,x)=>(m[x.source]=(m[x.source]||0)+1,m),{}),
    provider:alpha.rows.length?"Alpha Vantage":"stored fallback",
    providerError:alpha.error||null
  });
}
