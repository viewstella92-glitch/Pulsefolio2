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

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}

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
    const r=await fetch("https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey="+encodeURIComponent(key),{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {rows:[],error:"Alpha Vantage HTTP "+r.status};
    const text=await r.text();
    if(text.trim().startsWith("{")){try{const j=JSON.parse(text);return {rows:[],error:j.Note||j.Information||j["Error Message"]||"No calendar data"}}catch{}}
    const lines=text.split(/\r?\n/).filter(Boolean); if(!lines.length)return {rows:[],error:"Empty calendar"};
    const parse=line=>{const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==="""&&line[i+1]==="""){cur+=""";i++;continue}if(c==="""){q=!q;continue}if(c===","&&!q){out.push(cur);cur="";continue}cur+=c}out.push(cur);return out};
    const h=parse(lines[0]).map(x=>x.trim().toLowerCase()), wanted=new Set(tickers);
    return {rows:lines.slice(1).map(line=>Object.fromEntries(h.map((k,i)=>[k,(parse(line)[i]||"").trim()]))).filter(x=>wanted.has(String(x.symbol||"").toUpperCase()))};
  }catch(e){return {rows:[],error:e?.message||"Calendar request failed"}}
}

export async function GET(){
  const tickers=await getTickers(),stored=await getStored(),cal=await calendar(tickers);
  const rows=[],seen=new Set();
  for(const x of cal.rows){
    const ticker=String(x.symbol||"").toUpperCase(),date=x.reportDate;if(!ticker||!date||seen.has(ticker))continue;
    const d=new Date(date+"T00:00:00Z");if(Number.isNaN(d.getTime()))continue;
    rows.push({ticker,date:d.toISOString(),estimated:true,epsEstimate:num(x.estimate),epsActual:null,surprise:null,surprisePct:null,history:[],trend:[],source:"Alpha Vantage Earnings Calendar"});seen.add(ticker);
  }
  for(const ticker of tickers){if(seen.has(ticker))continue;const x=stored.get(ticker);if(x?.earnings_date){rows.push({ticker,date:x.earnings_date,estimated:x.earnings_estimated!==false,epsEstimate:null,epsActual:null,surprise:null,surprisePct:null,history:[],trend:[],source:x.earnings_source||"Synced earnings source"});seen.add(ticker)}}
  const historyErrors={};
  // History/estimates are fetched only for the first 6 active tickers per request to respect the free quota.
  // Calendar remains one request and supplies all upcoming dates.
  for(const item of rows.slice(0,6)){
    const [h,e]=await Promise.all([alpha(item.ticker,"EARNINGS"),alpha(item.ticker,"EARNINGS_ESTIMATES")]);
    if(h.data?.quarterlyEarnings?.length){
      const hist=h.data.quarterlyEarnings;
      item.history=hist.slice(0,8).map(q=>({fiscalDateEnding:q.fiscalDateEnding,reportedDate:q.reportedDate,reportedEPS:num(q.reportedEPS),estimatedEPS:num(q.estimatedEPS),surprise:num(q.surprise),surprisePercentage:num(q.surprisePercentage)}));
      const latest= item.history[0];
      if(latest){item.epsActual=latest.reportedEPS;item.epsEstimate=latest.estimatedEPS??item.epsEstimate;item.surprise=latest.surprise;item.surprisePct=latest.surprisePercentage}
    }else if(h.error)historyErrors[item.ticker]=h.error;
    if(e.data?.estimates?.length)item.trend=e.data.estimates.slice(0,8).map(q=>({fiscalDateEnding:q.fiscalDateEnding,epsEstimate:num(q.epsEstimate),epsHigh:num(q.epsHigh),epsLow:num(q.epsLow),revenueEstimate:num(q.revenueEstimate),revenueHigh:num(q.revenueHigh),revenueLow:num(q.revenueLow),analystCount:num(q.numberOfAnalysts),revisionUp:num(q.epsRevisionsUp),revisionDown:num(q.epsRevisionsDown)}));
  }
  rows.sort((a,b)=>new Date(a.date)-new Date(b.date));
  return NextResponse.json({earnings:rows,updatedAt:new Date().toISOString(),tickerCount:tickers.length,coverage:rows.length,historyCoverage:rows.filter(x=>x.history.length).length,trendCoverage:rows.filter(x=>x.trend.length).length,sourceCoverage:rows.reduce((m,x)=>(m[x.source]=(m[x.source]||0)+1,m),{}),provider:cal.rows.length?"Alpha Vantage":"stored fallback",providerError:cal.error||null,historyErrors});
}
