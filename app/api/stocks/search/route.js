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

export async function DELETE(req){
  const body=await req.json().catch(()=>({}));
  const ticker=String(body?.ticker||"").trim().toUpperCase();
  if(!/^[A-Z.\-]{1,10}$/.test(ticker))return NextResponse.json({error:"Invalid ticker"},{status:400});
  try{
    const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const sync=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{
      method:"POST",
      headers:{"content-type":"application/json",...(key?{"apikey":key,"Authorization":"Bearer "+key}:{})},
      body:JSON.stringify({removeTickers:[ticker]})
    });
    const text=await sync.text();
    const result=text?JSON.parse(text):null;
    if(!sync.ok||result?.failed>0)return NextResponse.json({ok:false,error:result?.errors?.[0]?.error||"ลบหุ้นไม่สำเร็จ",result},{status:502});
    return NextResponse.json({ok:true,ticker,result});
  }catch(e){return NextResponse.json({error:e?.message||"Remove stock failed"},{status:500});}
}

export async function POST(req){
  const body=await req.json().catch(()=>({}));
  const ticker=String(body?.ticker||"").trim().toUpperCase();
  if(!/^[A-Z.\-]{1,10}$/.test(ticker))return NextResponse.json({error:"Invalid ticker"},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!url)return NextResponse.json({error:"Supabase environment variables are missing"},{status:500});
  try{
    const results=await yahooSearch(ticker);
    const found=results.find(x=>x.ticker===ticker);
    if(!found)return NextResponse.json({error:"ไม่พบหุ้นนี้ใน Yahoo Finance"},{status:404});
    const sync=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tickers:[ticker],metadata:{[ticker]:found}})});
    const syncText=await sync.text();
    const syncResult=syncText ? JSON.parse(syncText) : null;
    if(!sync.ok || syncResult?.failed>0){
      return NextResponse.json({ok:false,error:syncResult?.errors?.[0]?.error||"ไม่สามารถอัปเดตข้อมูลหุ้นได้",stock:found,syncOk:sync.ok,syncResult},{status:502});
    }
    return NextResponse.json({ok:true,stock:found,syncOk:true,syncResult});
  }catch(e){return NextResponse.json({error:e?.message||"Add stock failed"},{status:500});}
}