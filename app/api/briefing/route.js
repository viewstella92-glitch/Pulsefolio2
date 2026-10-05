export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const r=await fetch(url+"/rest/v1/daily_market_briefing?select=*&order=briefing_date.desc&limit=7",{headers,cache:"no-store"});
    const data=await r.json();
    if(!r.ok)return Response.json({error:"Briefing query failed",detail:data},{status:500});
    return Response.json({briefings:data||[]});
  }catch(e){return Response.json({error:e?.message||"Briefing API failed"},{status:500})}
}