import { NextResponse } from "next/server";

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const NUM_TYPES=[
  "trailingPeRatio","forwardPeRatio","trailingPegRatio","annualDilutedEPS","annualTotalRevenue",
  "annualNetIncome","annualStockholdersEquity","annualOperatingIncome","annualFreeCashFlow",
  "annualTotalDebt","annualTotalAssets"
];

const num=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);

async function yahooEstimate(ticker){
  try{
    const r=await fetch("https://query2.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(ticker)+"&quotesCount=10&newsCount=0",{headers:{"User-Agent":UA},cache:"no-store"});
    if(!r.ok)return {};
    const q=(await r.json())?.quotes?.find(x=>x.symbol===ticker&&x.quoteType==="EQUITY");
    if(!q)return {};
    const f=num(q.epsForward), cy=num(q.epsCurrentYear);
    return {eps_forward:f,eps_estimate_current:cy,growth_next:f!=null&&cy!=null&&cy!==0?(f/cy-1)*100:null,earnings_estimate_source:"Yahoo Finance quote"};
  }catch{return {}}
}

async function yahooFallback(stock){
  const ticker=stock.ticker;
  const out={...stock};
  try{
    const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?range=5d&interval=1d",{headers:{"User-Agent":UA},cache:"no-store"});
    if(r.ok){
      const m=(await r.json())?.chart?.result?.[0]?.meta||{};
      if(num(out.price)==null&&num(m.regularMarketPrice)!=null) out.price=num(m.regularMarketPrice);
      if(!out.currency&&m.currency)out.currency=m.currency;
    }
  }catch{}
  try{
    const now=Math.floor(Date.now()/1000),start=now-740*24*60*60;
    const u="https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"+encodeURIComponent(ticker)+"?symbol="+encodeURIComponent(ticker)+"&type="+NUM_TYPES.join(",")+"&period1="+start+"&period2="+now;
    const r=await fetch(u,{headers:{"User-Agent":UA},cache:"no-store"});
    if(r.ok){
      const rows=(await r.json())?.timeseries?.result||[];
      const latest={};
      for(const row of rows){
        const type=row?.meta?.type?.[0],arr=row?.[type];
        if(!type||!Array.isArray(arr)||!arr.length)continue;
        const item=arr[arr.length-1],v=item?.reportedValue?.raw??item?.reportedValue;
        if(num(v)!=null)latest[type]=num(v);
      }
      if(num(out.trailing_pe)==null)out.trailing_pe=latest.trailingPeRatio??null;
      if(num(out.forward_pe)==null)out.forward_pe=latest.forwardPeRatio??null;
      if(num(out.peg)==null)out.peg=latest.trailingPegRatio??null;
      if(num(out.eps_trailing)==null)out.eps_trailing=latest.annualDilutedEPS??null;
      if(num(out.revenue_growth)==null&&latest.annualTotalRevenue!=null)out.revenue_growth=null;
      if(num(out.free_cash_flow)==null)out.free_cash_flow=latest.annualFreeCashFlow??null;
      if(num(out.debt_to_equity)==null&&latest.annualTotalDebt!=null&&latest.annualStockholdersEquity>0)out.debt_to_equity=(latest.annualTotalDebt/latest.annualStockholdersEquity)*100;
      if(num(out.roe)==null&&latest.annualNetIncome!=null&&latest.annualStockholdersEquity>0)out.roe=(latest.annualNetIncome/latest.annualStockholdersEquity)*100;
      if(num(out.profit_margin)==null&&latest.annualNetIncome!=null&&latest.annualTotalRevenue>0)out.profit_margin=(latest.annualNetIncome/latest.annualTotalRevenue)*100;
    }
  }catch{}
  const est=await yahooEstimate(ticker);
  for(const [k,v] of Object.entries(est))if(v!=null&&v!=="")out[k]=v;
  out.data_sources=Array.from(new Set([...(Array.isArray(out.data_sources)?out.data_sources:[]),"Yahoo Finance fallback"]));
  out.data_quality_source="fallback_enriched";
  out.data_updated_at=new Date().toISOString();
  return out;
}

async function fetchAllFallback(stocks){
  const out=[];
  for(let i=0;i<stocks.length;i+=6){
    const batch=stocks.slice(i,i+6);
    const rows=await Promise.all(batch.map(yahooFallback));
    out.push(...rows);
  }
  return out;
}

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const base=url+"/rest/v1/";
    const [u,f,a,ai]=await Promise.all([
      fetch(base+"stock_universe?select=ticker,name,sector,industry&active=eq.true",{headers,cache:"no-store"}),
      fetch(base+"stock_fundamentals?select=*",{headers,cache:"no-store"}),
      fetch(base+"stock_analysis?select=*",{headers,cache:"no-store"}),
      fetch(base+"stock_ai_analysis?select=ticker,analysis_text,model,generated_at,data_quality,input_snapshot",{headers,cache:"no-store"})
    ]);
    const [universe,fundamentals,analysis,aiRows]=await Promise.all([u.json(),f.json(),a.json(),ai.json()]);
    if(!u.ok||!f.ok||!a.ok||!ai.ok) return Response.json({error:"Supabase query failed",detail:{universe,fundamentals,analysis,ai:aiRows}},{status:500});
    const fm=new Map((fundamentals||[]).map(x=>[x.ticker,x]));
    const am=new Map((analysis||[]).map(x=>[x.ticker,x]));
    const freshAI=(aiRows||[]).filter(ai=>{
      const f=fm.get(ai.ticker);
      if(!f||!ai.generated_at||!f.updated_at)return false;
      const generated=Date.parse(ai.generated_at),updated=Date.parse(f.updated_at);
      if(!Number.isFinite(generated)||!Number.isFinite(updated)||generated<updated)return false;
      const snap=ai.input_snapshot?.fundamentals;
      const currentPrice=num(f.price),snapPrice=num(snap?.price);
      if(currentPrice!=null&&snapPrice!=null&&currentPrice>0&&snapPrice>0){
        if(Math.abs(currentPrice-snapPrice)/currentPrice>0.03)return false;
      }
      return true;
    });
    const aim=new Map(freshAI.map(x=>[x.ticker,x]));
    const initial=(universe||[]).map(x=>({...x,...(fm.get(x.ticker)||{}),...(am.get(x.ticker)||{}),...(aim.get(x.ticker)||{})}));
    const needsFallback=s=>["price","forward_pe","trailing_pe","peg","beta","growth_next","revenue_growth","profit_margin","roe","free_cash_flow","debt_to_equity"].some(k=>num(s[k])==null);
    const stocks=await fetchAllFallback(initial.map(s=>needsFallback(s)?s:{...s,data_sources:Array.from(new Set([...(Array.isArray(s.data_sources)?s.data_sources:[]),"Supabase"])),data_quality_source:"supabase"}));
    const fallbackCount=stocks.filter(s=>s.data_quality_source==="fallback_enriched").length;
    return Response.json({stocks,meta:{universe:universe?.length||0,fundamentals:fundamentals?.length||0,analysis:analysis?.length||0,ai:freshAI.length,fallbackEnriched:fallbackCount},updatedAt:new Date().toISOString()});
  }catch(e){return Response.json({error:e?.message||"Stock API failed"},{status:500})}
}
