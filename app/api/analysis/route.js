export async function GET(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key) return Response.json({error:"Supabase environment variables are missing"},{status:500});
 const r=await fetch(url+"/rest/v1/stock_analysis?select=ticker,valuation_score,growth_score,quality_score,risk_score,news_score,overall_score,buy_zone,explanation&order=overall_score.desc",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
 const data=await r.json();
 return Response.json(data,{status:r.ok?200:500});
}