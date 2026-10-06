import { NextResponse } from "next/server";

export const runtime="nodejs";
const SA="https://stockanalysis.com/stocks/";
const clean=html=>html.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\\s+/g," ").trim();
const num=v=>{const m=String(v??"").replace(/,/g,"").match(/-?\\d+(?:\\.\\d+)?/);return m?Number(m[0]):null};

async function getAnalyst(ticker){
  try{
    const [ov,fc]=await Promise.all([
      fetch(SA+encodeURIComponent(ticker)+"/",{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"}),
      fetch(SA+encodeURIComponent(ticker)+"/forecast/",{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store"})
    ]);
    if(!ov.ok||!fc.ok)return null;
    const ot=clean(await ov.text()),ft=clean(await fc.text());
    const fm=ot.match(/Forward PE\\s+([\\d,.]+)/i);
    const bm=ot.match(/Beta\\s+([\\d,.]+)/i);
    const em=ft.match(/EPS Growth\\s+([\\d,.%-]+\\s+){0,8}/i);
    const vals=em?(em[0].match(/-?\\d+(?:,\\d{3})*(?:\\.\\d+)?%/g)||[]).map(num):[];
    const forward_pe=num(fm?.[1]),beta=num(bm?.[1]),growth_next=vals.length?vals[vals.length-1]:null;
    if(!(forward_pe>0)&&growth_next==null&&!(beta>0))return null;
    return {forward_pe:forward_pe>0?forward_pe:null,growth_next,beta:beta>0?beta:null,data_quality:"stockanalysis_enriched",data_source:"StockAnalysis / S&P Global + TipRanks"};
  }catch{return null}
}

async function getTickers(base,headers){
  try{
    const r=await fetch(base+"stock_universe?select=ticker&active=eq.true",{headers,cache:"no-store"});
    if(r.ok){const rows=await r.json();const xs=rows.map(x=>String(x.ticker||"").trim().toUpperCase()).filter(Boolean);if(xs.length)return xs}
  }catch{}
  return ["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB","LEU","NVO","AVGO"];
}

export async function GET(req){
  const secret=process.env.CRON_SECRET;
  const auth=req.headers.get("authorization")||"";
  if(secret&&auth!=="Bearer "+secret)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const supabase=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!supabase||!key)return NextResponse.json({error:"Supabase environment variables are missing"},{status:500});
    const base=supabase+"/rest/v1/";
    const headers={apikey:key,Authorization:"Bearer "+key};
    const tickers=await getTickers(base,headers);
    const seed={};
    for(let i=0;i<tickers.length;i+=5){
      const batch=tickers.slice(i,i+5);
      const rows=await Promise.all(batch.map(async ticker=>[ticker,await getAnalyst(ticker)]));
      for(const [ticker,data] of rows)if(data)seed[ticker]=data;
    }
    const functions=process.env.SUPABASE_FUNCTIONS_URL||supabase.replace(/\\/$/,"")+"/functions/v1";
    const r=await fetch(functions+"/pulse-sync",{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify({tickers,seed}),cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    const e=await fetch(functions+"/estimate-sync",{method:"POST",headers,cache:"no-store"});
    const estimates=await e.json().catch(()=>({}));
    return NextResponse.json({...data,analystSeeded:Object.keys(seed).length,tickers:tickers.length,estimates},{status:r.ok&&e.ok?200:207});
  }catch(e){return NextResponse.json({error:e?.message||"Sync failed"},{status:500})}
}
