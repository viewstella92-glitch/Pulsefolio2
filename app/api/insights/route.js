export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key}; const base=url+"/rest/v1/";
  try{
    const [h,u,f,e]=await Promise.all([
      fetch(base+"stock_data_history?select=ticker,captured_at,price,forward_pe,peg,growth_next,overall_score,buy_zone,fair_value_base&order=captured_at.desc&limit=5000",{headers,cache:"no-store"}),
      fetch(base+"stock_universe?select=ticker,name,sector,industry&active=eq.true",{headers,cache:"no-store"}),
      fetch(base+"stock_fundamentals?select=ticker,price,forward_pe,growth_next,revenue_growth,profit_margin,roe,free_cash_flow,debt_to_equity,industry_forward_pe,fair_value_low,fair_value_base,fair_value_high",{headers,cache:"no-store"}),
      fetch(base+"stock_estimates_history?select=ticker,captured_at,period,eps_current,revenue_current,growth_eps_next,growth_revenue_next&order=captured_at.desc&limit=5000",{headers,cache:"no-store"})
    ]);
    const [history,universe,fundamentals,estimates]=await Promise.all([h.json(),u.json(),f.json(),e.json()]);
    if(!h.ok||!u.ok||!f.ok||!e.ok) return Response.json({error:"Supabase query failed",detail:{history,universe,fundamentals}},{status:500});
    const groups={NVDA:"Semiconductor",MU:"Semiconductor",ARM:"Semiconductor",ALAB:"Semiconductor",VRT:"Infrastructure/AI",CRM:"Software",ADBE:"Software",APP:"Software/Internet",INTU:"Software",NFLX:"Internet/Media",MELI:"Internet/Commerce",GRAB:"Internet/Commerce",ZTS:"Healthcare",CI:"Healthcare",AZO:"Consumer/Retail",AAPL:"Consumer/Technology",BLK:"Financials",MA:"Financials"};
    const byTicker=new Map((fundamentals||[]).map(x=>[x.ticker,x])); const byGroup={};
    for(const s of universe||[]){const g=groups[s.ticker]||s.industry||s.sector||"General";(byGroup[g]??=[]).push(s.ticker)}
    const rows=(history||[]).reduce((m,x)=>{(m[x.ticker]??=[]).push(x);return m},{}); const estimateRows=(estimates||[]).reduce((m,x)=>{(m[x.ticker]??=[]).push(x);return m},{});
    const result={};
    for(const s of universe||[]){
      const ticker=s.ticker, f=byTicker.get(ticker)||{}, es=(estimateRows[ticker]||[]).sort((a,b)=>new Date(a.captured_at)-new Date(b.captured_at)), hs=(rows[ticker]||[]).sort((a,b)=>new Date(a.captured_at)-new Date(b.captured_at));
      const peVals=hs.map(x=>Number(x.forward_pe)).filter(x=>x>0&&x<200), sorted=[...peVals].sort((a,b)=>a-b);
      const currentPE=Number(f.forward_pe); const percentile=currentPE>0&&sorted.length?Math.round(sorted.filter(x=>x<=currentPE).length/sorted.length*100):null;
      const recent=hs.slice(-6), rev=recent.map(x=>Number(x.growth_next)).filter(Number.isFinite), first=rev[0],last=rev[rev.length-1], revisionDelta=rev.length>=2?last-first:null;
      const epsRev=es.length>=2&&Number(es[0].eps_current)>0&&Number(es.at(-1).eps_current)>0?((Number(es.at(-1).eps_current)/Number(es[0].eps_current)-1)*100):null; const revenueRev=es.length>=2&&Number(es[0].revenue_current)>0&&Number(es.at(-1).revenue_current)>0?((Number(es.at(-1).revenue_current)/Number(es[0].revenue_current)-1)*100):null; const revisionTrend=epsRev!=null?(epsRev>2?"ปรับ EPS ประมาณการขึ้น":epsRev<-2?"ปรับ EPS ประมาณการลง":"EPS ประมาณการทรงตัว"):(revisionDelta==null?"ยังมีข้อมูลไม่พอ":revisionDelta>2?"ปรับประมาณการขึ้น":revisionDelta<-2?"ปรับประมาณการลง":"ประมาณการทรงตัว");
      const group=groups[ticker]||s.industry||s.sector||"General", peerTickers=byGroup[group]||[], peers=peerTickers.map(t=>byTicker.get(t)).filter(Boolean);
      const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null, peerPE=peers.map(x=>Number(x.forward_pe)).filter(x=>x>0&&x<200), peerGrowth=peers.map(x=>Number(x.growth_next)).filter(Number.isFinite), peerRev=peers.map(x=>Number(x.revenue_growth)).filter(Number.isFinite);
      const peerAvgPE=avg(peerPE),peerAvgGrowth=avg(peerGrowth),peerAvgRevenue=avg(peerRev);
      const growth=Number(f.growth_next); const cycle=Number.isFinite(growth)&&peerAvgGrowth!=null?(growth>peerAvgGrowth*1.15?"ขยายตัวเด่น":growth<peerAvgGrowth*.85?"ชะลอกว่ากลุ่ม":"ใกล้เคียงกลุ่ม"):"ยังประเมินวัฏจักรไม่ได้";
      result[ticker]={industry:group,historyCount:hs.length,historical:{min:sorted[0]??null,median:sorted.length?sorted[Math.floor(sorted.length/2)]:null,max:sorted.at(-1)??null,percentile},revision:{trend:revisionTrend,delta:revisionDelta,values:rev,epsDelta:epsRev,revenueDelta:revenueRev,estimateCount:es.length},peers:{tickers:peerTickers,avgForwardPE:peerAvgPE,avgGrowth:peerAvgGrowth,avgRevenueGrowth:peerAvgRevenue,currentPE:currentPE||null,currentGrowth:Number.isFinite(growth)?growth:null},industryCycle:cycle};
    }
    return Response.json({insights:result,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"s-maxage=300, stale-while-revalidate=600"}});
  }catch(e){return Response.json({error:e?.message||"Insights API failed"},{status:500})}
}