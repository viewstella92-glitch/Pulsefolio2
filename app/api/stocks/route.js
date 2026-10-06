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
      if(!f||!ai.generated_at||!f.updated_at) return false;
      const generated=Date.parse(ai.generated_at), updated=Date.parse(f.updated_at);
      if(!Number.isFinite(generated)||!Number.isFinite(updated)||generated<updated) return false;
      const snap=ai.input_snapshot?.fundamentals;
      const currentPrice=Number(f.price), snapPrice=Number(snap?.price);
      if(Number.isFinite(currentPrice)&&Number.isFinite(snapPrice)&&currentPrice>0&&snapPrice>0){
        const drift=Math.abs(currentPrice-snapPrice)/currentPrice;
        if(drift>0.03) return false;
      }
      return true;
    });
    const aim=new Map(freshAI.map(x=>[x.ticker,x]));
    const stocks=(universe||[]).map(x=>({...x,...(fm.get(x.ticker)||{}),...(am.get(x.ticker)||{}),...(aim.get(x.ticker)||{})}));
    return Response.json({stocks,meta:{universe:universe?.length||0,fundamentals:fundamentals?.length||0,analysis:analysis?.length||0,ai:freshAI.length}});
  }catch(e){return Response.json({error:e?.message||"Stock API failed"},{status:500})}
}
