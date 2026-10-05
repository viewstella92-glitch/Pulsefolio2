import { NextResponse } from "next/server";

export const runtime="nodejs";

async function yahooSearch(q){
  const u="https://query2.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(q)+"&quotesCount=8&newsCount=0&enableFuzzyQuery=true";
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"});
  if(!r.ok)throw new Error("Yahoo search failed");
  const d=await r.json();
  return (d.quotes||[]).filter(x=>x.quoteType==="EQUITY"&&x.exchange).map(x=>({
    ticker:x.symbol,name:x.longname||x.shortname||x.symbol,exchange:x.exchange,market:x.market,sector:x.sector||null,industry:x.industry||null
  }));
}

export async function GET(req){
  const q=new URL(req.url).searchParams.get("q")?.trim();
  if(!q)return NextResponse.json({results:[]});
  try{return NextResponse.json({results:await yahooSearch(q)});}
  catch(e){return NextResponse.json({error:e?.message||"Search failed"},{status:500});}
}

export async function POST(req){
  const body=await req.json().catch(()=>({}));
  const ticker=String(body?.ticker||"").trim().toUpperCase();
  if(!/^[A-Z.\-]{1,10}$/.test(ticker))return NextResponse.json({error:"Invalid ticker"},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:"Server database configuration is missing"},{status:500});
  try{
    const results=await yahooSearch(ticker);
    const found=results.find(x=>x.ticker===ticker);
    if(!found)return NextResponse.json({error:"ไม่พบหุ้นนี้ใน Yahoo Finance"},{status:404});
    const h={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"};
    const u=url+"/rest/v1/stock_universe";
    const ins=await fetch(u,{method:"POST",headers:h,body:JSON.stringify({ticker:found.ticker,name:found.name,sector:found.sector,industry:found.industry,active:true})});
    if(!ins.ok){
      const t=await ins.text();
      if(!/duplicate|already exists|unique/i.test(t))throw new Error(t||"Could not add stock");
    }
    const sr=await fetch(new URL("/api/stocks/search",req.url),{method:"GET"});
    await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tickers:[ticker]})});
    await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/estimate-sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tickers:[ticker]})});
    return NextResponse.json({ok:true,stock:found});
  }catch(e){return NextResponse.json({error:e?.message||"Add stock failed"},{status:500});}
}