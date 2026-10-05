export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const r=await fetch(url+"/rest/v1/stock_alerts?select=*&order=created_at.desc&limit=100",{headers,cache:"no-store"});
    const data=await r.json();
    if(!r.ok)return Response.json({error:"Alerts query failed",detail:data},{status:500});
    return Response.json({alerts:data||[]});
  }catch(e){return Response.json({error:e?.message||"Alerts API failed"},{status:500})}
}