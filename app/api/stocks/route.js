export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const q=new URL(url+"/rest/v1/stock_universe");
  q.searchParams.set("select","ticker,name,sector,industry,stock_fundamentals(*),stock_analysis(*)");
  q.searchParams.set("active","eq.true");
  const r=await fetch(q,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
  const raw=await r.json();
  if(!r.ok) return Response.json({error:"Supabase query failed",detail:raw},{status:500});
  const stocks=(raw||[]).map(x=>({...x,...(x.stock_fundamentals?.[0]||{}),...(x.stock_analysis?.[0]||{})}));
  return Response.json({stocks});
}