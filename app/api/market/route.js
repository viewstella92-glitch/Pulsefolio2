import { NextResponse } from "next/server";

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return NextResponse.json({error:"Supabase environment variables are missing"},{status:500});
  try{
    const q=new URL(url+"/rest/v1/stock_universe");
    q.searchParams.set("select","ticker,name");
    q.searchParams.set("active","eq.true");
    const sr=await fetch(q,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    const universe=await sr.json();
    if(!sr.ok) return NextResponse.json({error:"Unable to load stock universe"},{status:500});
    const quotes=await Promise.all((universe||[]).map(async s=>{
      try{
        const u="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(s.ticker)+"?range=1d&interval=5m";
        const r=await fetch(u,{headers:{"User-Agent":UA},next:{revalidate:60}});
        const d=await r.json(); const m=d?.chart?.result?.[0]?.meta||{};
        const price=Number(m.regularMarketPrice);
        const previous=Number(m.chartPreviousClose??m.previousClose);
        return {ticker:s.ticker,price:Number.isFinite(price)?price:null,previous:Number.isFinite(previous)?previous:null,change:Number.isFinite(price)&&Number.isFinite(previous)?Number((price-previous).toFixed(4)):null,changePct:Number.isFinite(price)&&previous?Number(((price/previous-1)*100).toFixed(2)):null,currency:m.currency||"USD",marketTime:m.regularMarketTime?m.regularMarketTime*1000:null};
      }catch{return {ticker:s.ticker,price:null,previous:null,change:null,changePct:null,currency:"USD",marketTime:null};}
    }));
    return NextResponse.json({quotes,updatedAt:new Date().toISOString()});
  }catch(e){return NextResponse.json({error:e.message||"Market data unavailable"},{status:502});}
}