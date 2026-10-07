export const dynamic="force-dynamic";
export const maxDuration=60;

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const NUM_TYPES=[
  "trailingPeRatio","forwardPeRatio","trailingPegRatio","annualDilutedEPS","annualTotalRevenue",
  "annualNetIncome","annualStockholdersEquity","annualOperatingIncome","annualFreeCashFlow",
  "annualTotalDebt","annualTotalAssets"
];
const TIMEOUT_MS=8000;

const yahooFallbackCache=new Map();
const YAHOO_FALLBACK_CACHE_MS=30*60*1000;

const num=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);

// fetch ที่มี timeout กันคำขอค้าง
const tfetch=(u,o={})=>fetch(u,{...o,signal:AbortSignal.timeout(TIMEOUT_MS)});

async function yahooEstimate(ticker){
  try{
    const r=await tfetch("https://query2.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(ticker)+"&quotesCount=10&newsCount=0",{headers:{"User-Agent":UA},cache:"no-store"});
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
    const r=await tfetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?range=5d&interval=1d",{headers:{"User-Agent":UA},cache:"no-store"});
    if(r.ok){
      const m=(await r.json())?.chart?.result?.[0]?.meta||{};
      if(num(out.price)==null&&num(m.regularMarketPrice)!=null) out.price=num(m.regularMarketPrice);
      if(!out.currency&&m.currency)out.currency=m.currency;
    }
  }catch{}
  try{
    const now=Math.floor(Date.now()/1000),start=now-740*24*60*60;
    const u="https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"+encodeURIComponent(ticker)+"?symbol="+encodeURIComponent(ticker)+"&type="+NUM_TYPES.join(",")+"&period1="+start+"&period2="+now;
    const r=await tfetch(u,{headers:{"User-Agent":UA},cache:"no-store"});
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

function markSupabase(stock){
  return {
    ...stock,
    data_sources:Array.from(new Set([...(Array.isArray(stock.data_sources)?stock.data_sources:[]),"Supabase"])),
    data_quality_source:"supabase"
  };
}

// เรียก Yahoo เฉพาะหุ้นที่ข้อมูลขาดจริง (needs(s) เป็น true) ที่เหลือใช้ข้อมูลจาก Supabase ตามเดิม
async function fetchAllFallback(stocks,needs){
  const out=[];
  let fallbackCount=0;
  for(let i=0;i<stocks.length;i+=6){
    const batch=stocks.slice(i,i+6);
    const rows=await Promise.all(batch.map(async s=>{
      if(!needs(s))return {stock:markSupabase(s),usedFallback:false};
      const ticker=s.ticker;
      const cached=yahooFallbackCache.get(ticker);
      if(cached&&Date.now()-cached.at<YAHOO_FALLBACK_CACHE_MS)return {stock:cached.data,usedFallback:false};
      const data=await yahooFallback(s);
      yahooFallbackCache.set(ticker,{data,at:Date.now()});
      return {stock:data,usedFallback:true};
    }));
    for(const row of rows){out.push(row.stock);if(row.usedFallback)fallbackCount++;}
  }
  return {stocks:out,fallbackCount};
}

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const base=url+"/rest/v1/";
    const [u,f,a,ai]=await Promise.all([
      tfetch(base+"stock_universe?select=ticker,name,sector,industry&active=eq.true",{headers,cache:"no-store"}),
      tfetch(base+"stock_fundamentals?select=*",{headers,cache:"no-store"}),
      tfetch(base+"stock_analysis?select=*",{headers,cache:"no-store"}),
      tfetch(base+"stock_ai_analysis?select=ticker,analysis_text,model,generated_at,data_quality,input_snapshot",{headers,cache:"no-store"})
    ]);
    const [universe,fundamentals,analysis,aiRows]=await Promise.all([u.json(),f.json(),a.json(),ai.json()]);
    if(!u.ok||!f.ok||!a.ok||!ai.ok) return Response.json({error:"Supabase query failed",detail:{universe,fundamentals,analysis,ai:aiRows}},{status:500});
    const fm=new Map((fundamentals||[]).map(x=>[x.ticker,x]));
    const am=new Map((analysis||[]).map(x=>[x.ticker,x]));
    const freshAI=(aiRows||[]).filter(row=>{
      const fund=fm.get(row.ticker);
      if(!fund||!row.generated_at||!fund.updated_at)return false;
      const generated=Date.parse(row.generated_at),updated=Date.parse(fund.updated_at);
      if(!Number.isFinite(generated)||!Number.isFinite(updated)||generated<updated)return false;
      const snap=row.input_snapshot?.fundamentals;
      const currentPrice=num(fund.price),snapPrice=num(snap?.price);
      if(currentPrice!=null&&snapPrice!=null&&currentPrice>0&&snapPrice>0){
        if(Math.abs(currentPrice-snapPrice)/currentPrice>0.03)return false;
      }
      return true;
    });
    const aim=new Map(freshAI.map(x=>[x.ticker,x]));
    const initial=(universe||[]).map(x=>({...x,...(fm.get(x.ticker)||{}),...(am.get(x.ticker)||{}),...(aim.get(x.ticker)||{})}));
    const needsFallback=s=>["price","forward_pe","trailing_pe","peg","growth_next","profit_margin","roe","free_cash_flow","debt_to_equity"].some(k=>num(s[k])==null);
    const {stocks,fallbackCount}=await fetchAllFallback(initial,needsFallback);
    return Response.json({stocks,meta:{universe:universe?.length||0,fundamentals:fundamentals?.length||0,analysis:analysis?.length||0,ai:freshAI.length,fallbackEnriched:fallbackCount},updatedAt:new Date().toISOString()});
  }catch(e){return Response.json({error:e?.message||"Stock API failed"},{status:500})}
}
