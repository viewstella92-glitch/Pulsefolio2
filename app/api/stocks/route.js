import yahooFinance from "yahoo-finance2";

const yahooCache=new Map();
const YAHOO_CACHE_MS=10*60*1000;
async function yahooEnrich(stocks){
  const now=Date.now();
  return await Promise.all(stocks.map(async s=>{
    const cached=yahooCache.get(s.ticker);
    if(cached&&now-cached.at<YAHOO_CACHE_MS)return {...s,...cached.data};
    try{
      const q=await yahooFinance.quote(s.ticker);
      let trend=null,history=[];
      try{const qs=await yahooFinance.quoteSummary(s.ticker,{modules:["earningsTrend","earningsHistory"]});trend=qs?.earningsTrend?.trend||null;history=qs?.earningsHistory?.history||[]}catch{}
      const d={
        price:q?.regularMarketPrice??s.price,
        trailing_pe:q?.trailingPE??s.trailing_pe,
        forward_pe:q?.forwardPE??s.forward_pe,
        peg:q?.pegRatio??s.peg,
        beta:q?.beta??s.beta,
        growth_current:q?.earningsGrowth!=null?(Math.abs(q.earningsGrowth)<=2?q.earningsGrowth*100:q.earningsGrowth):s.growth_current,
        revenue_growth:q?.revenueGrowth!=null?(Math.abs(q.revenueGrowth)<=2?q.revenueGrowth*100:q.revenueGrowth):s.revenue_growth,
        roe:q?.returnOnEquity!=null?(Math.abs(q.returnOnEquity)<=2?q.returnOnEquity*100:q.returnOnEquity):s.roe,
        profit_margin:q?.profitMargins!=null?(Math.abs(q.profitMargins)<=2?q.profitMargins*100:q.profitMargins):s.profit_margin,
        free_cash_flow:q?.freeCashflow??s.free_cash_flow,
        debt_to_equity:q?.debtToEquity??s.debt_to_equity,
        growth_next:(()=>{const v=trend?.find(x=>x.period==="+1y")?.earningsEstimate?.growth?.raw??trend?.find(x=>x.period==="+1y")?.earningsEstimate?.growth??s.growth_next;return v==null?null:(Math.abs(Number(v))<=2?Number(v)*100:Number(v))})(),
        eps_estimate_current:(trend?.find(x=>x.period==="0y")?.earningsEstimate?.avg?.raw??trend?.find(x=>x.period==="0y")?.earningsEstimate?.avg??q?.epsCurrentYear??s.eps_estimate_current),
        eps_estimate_next:(trend?.find(x=>x.period==="+1y")?.earningsEstimate?.avg?.raw??trend?.find(x=>x.period==="+1y")?.earningsEstimate?.avg??s.eps_estimate_next),
        earnings_revision_score:(()=>{const x=trend?.find(x=>x.period==="+1y")||trend?.find(x=>x.period==="0y");const a=x?.epsRevisions;const u7=a?.upLast7days?.raw??a?.upLast7days,d7=a?.downLast7days?.raw??a?.downLast7days,u30=a?.upLast30days?.raw??a?.upLast30days,d30=a?.downLast30days?.raw??a?.downLast30days;return [u7,d7,u30,d30].some(v=>v!=null)?Math.max(0,Math.min(100,50+(u7||0)*6-(d7||0)*8+(u30||0)*3-(d30||0)*4)):s.earnings_revision_score})()
      };
      yahooCache.set(s.ticker,{at:now,data:d});
      return {...s,...d,data_quality:"yahoo_finance2"};
    }catch{return s}
  }));
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
      fetch(base+"stock_ai_analysis?select=ticker,analysis_text,model,generated_at,data_quality",{headers,cache:"no-store"})
    ]);
    const [universe,fundamentals,analysis,aiRows]=await Promise.all([u.json(),f.json(),a.json(),ai.json()]);
    if(!u.ok||!f.ok||!a.ok||!ai.ok) return Response.json({error:"Supabase query failed",detail:{universe,fundamentals,analysis,ai:aiRows}},{status:500});
    const fm=new Map((fundamentals||[]).map(x=>[x.ticker,x]));
    const am=new Map((analysis||[]).map(x=>[x.ticker,x]));
    const aim=new Map((aiRows||[]).map(x=>[x.ticker,x]));
    const stocks=(universe||[]).map(x=>({...x,...(fm.get(x.ticker)||{}),...(am.get(x.ticker)||{}),...(aim.get(x.ticker)||{})}));
    const enriched=await yahooEnrich(stocks); return Response.json({stocks:enriched,meta:{universe:universe?.length||0,fundamentals:fundamentals?.length||0,analysis:analysis?.length||0,ai:aiRows?.length||0}});
  }catch(e){return Response.json({error:e?.message||"Stock API failed"},{status:500})}
}
