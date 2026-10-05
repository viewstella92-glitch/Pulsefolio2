import { NextResponse } from "next/server";

export const runtime="nodejs";

async function yahooSearch(q){
  const u="https://query2.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(q)+"&quotesCount=8&newsCount=0&enableFuzzyQuery=true";
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"});
  if(!r.ok)throw new Error("Yahoo search failed");
  const d=await r.json();
  return (d.quotes||[]).filter(x=>x.quoteType==="EQUITY"&&x.exchange).map(x=>({
    ticker:x.symbol,name:x.longname||x.shortname||x.symbol,exchange:x.exchange,market:x.market,sector:x.sector||null,industry:x.industry||null,
    price:x.regularMarketPrice??null,trailing_pe:x.trailingPE??null,forward_pe:x.forwardPE??null,peg:x.pegRatio??null,beta:x.beta??null,
    eps_current:x.epsCurrentYear??null,eps_next:x.epsForward??null,eps_trailing:x.epsTrailingTwelveMonths??null,
    growth_current:(x.epsCurrentYear!=null&&x.epsTrailingTwelveMonths)?x.epsCurrentYear/x.epsTrailingTwelveMonths-1:null,
    growth_next:(x.epsForward!=null&&x.epsCurrentYear)?x.epsForward/x.epsCurrentYear-1:null,data_quality:"search_verified"
  }));
}

async function enrichStock(found){
  const t=found.ticker;
  try{
    const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(t)+"?range=5d&interval=1d",{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"});
    if(r.ok){const q=(await r.json())?.chart?.result?.[0];const p=q?.meta?.regularMarketPrice??q?.meta?.previousClose;if(p!=null)found.price=p;}
  }catch{}
  try{
    const now=Math.floor(Date.now()/1000),start=now-370*24*60*60;
    const types=["trailingPeRatio","forwardPeRatio","trailingPegRatio","annualDilutedEPS","trailingDilutedEPS"];
    const u="https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"+encodeURIComponent(t)+"?symbol="+encodeURIComponent(t)+"&type="+types.join(",")+"&period1="+start+"&period2="+now;
    const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"});
    if(r.ok){const rows=(await r.json())?.timeseries?.result||[];for(const row of rows){const type=row?.meta?.type?.[0],a=row?.[type];if(!a?.length)continue;const v=a[a.length-1]?.reportedValue?.raw??a[a.length-1]?.reportedValue;if(type==="trailingPeRatio"&&found.trailing_pe==null)found.trailing_pe=v;if(type==="forwardPeRatio"&&found.forward_pe==null)found.forward_pe=v;if(type==="trailingPegRatio"&&found.peg==null)found.peg=v;if(type==="annualDilutedEPS"&&found.eps_current==null)found.eps_current=v;if(type==="trailingDilutedEPS"&&found.eps_trailing==null)found.eps_trailing=v;}}
  }catch{}
  if(found.growth_current==null&&found.eps_current!=null&&found.eps_trailing)found.growth_current=found.eps_current/found.eps_trailing-1;
  if(found.growth_next==null&&found.eps_next!=null&&found.eps_current)found.growth_next=found.eps_next/found.eps_current-1;
  return found;
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
    let found=results.find(x=>x.ticker===ticker);
    if(!found)return NextResponse.json({error:"ไม่พบหุ้นนี้ใน Yahoo Finance"},{status:404});
    found=await enrichStock(found);
    const sync=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tickers:[ticker],metadata:{[ticker]:found},seed:{[ticker]:found}})});
    const syncText=await sync.text();
    const syncResult=syncText ? JSON.parse(syncText) : null;
    if(!sync.ok || syncResult?.failed>0){
      return NextResponse.json({ok:false,error:syncResult?.errors?.[0]?.error||"ไม่สามารถอัปเดตข้อมูลหุ้นได้",stock:found,syncOk:sync.ok,syncResult},{status:502});
    }
    return NextResponse.json({ok:true,stock:found,syncOk:true,syncResult});
  }catch(e){return NextResponse.json({error:e?.message||"Add stock failed"},{status:500});}
}