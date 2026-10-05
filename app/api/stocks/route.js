export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const base=url+"/rest/v1/";
    const [u,f,a]=await Promise.all([
      fetch(base+"stock_universe?select=ticker,name,sector,industry&active=eq.true",{headers,cache:"no-store"}),
      fetch(base+"stock_fundamentals?select=*",{headers,cache:"no-store"}),
      fetch(base+"stock_analysis?select=*",{headers,cache:"no-store"})
    ]);
    const [universe,fundamentals,analysis]=await Promise.all([u.json(),f.json(),a.json()]);
    if(!u.ok||!f.ok||!a.ok) return Response.json({error:"Supabase query failed",detail:{universe,fundamentals,analysis}},{status:500});
    const fm=new Map((fundamentals||[]).map(x=>[x.ticker,x]));
    const am=new Map((analysis||[]).map(x=>[x.ticker,x]));
    const stocks=(universe||[]).map(x=>({...x,...(fm.get(x.ticker)||{}),...(am.get(x.ticker)||{})}));
    return Response.json({stocks,meta:{universe:universe?.length||0,fundamentals:fundamentals?.length||0,analysis:analysis?.length||0}});
  }catch(e){return Response.json({error:e?.message||"Stock API failed"},{status:500})}
}