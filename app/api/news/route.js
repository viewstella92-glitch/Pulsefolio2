import { NextResponse } from "next/server";

const FALLBACK_TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];
async function getTickers(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return FALLBACK_TICKERS;
  try{
    const r=await fetch(url+"/rest/v1/stock_universe?select=ticker&active=eq.true",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    if(!r.ok)return FALLBACK_TICKERS;
    const rows=await r.json();
    const tickers=rows.map(x=>x.ticker).filter(Boolean);
    return tickers.length?tickers:FALLBACK_TICKERS;
  }catch{return FALLBACK_TICKERS}
}
function clean(s=""){return s.replace(/<[^>]*>/g,"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();}
function tag(xml,name){const m=xml.match(new RegExp("<"+name+"[^>]*>([\\s\\S]*?)</"+name+">","i"));return m?clean(m[1]):"";}
async function feed(ticker){
  const urls=[
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s="+ticker+"&region=US&lang=en-US",
    "https://news.google.com/rss/search?q="+ticker+"%20stock&hl=en-US&gl=US&ceid=US:en"
  ];
  for(const u of urls) try{
    const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"},next:{revalidate:300}});
    if(!r.ok) continue;
    const xml=await r.text(); const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,4);
    const out=items.map(x=>{const b=x[1];return {ticker,title:tag(b,"title"),url:tag(b,"link"),source:tag(b,"source"),publishedAt:tag(b,"pubDate"),summary:tag(b,"description")}}).filter(x=>x.title);
    if(out.length)return out;
  }catch{}
  return [];
}
export async function GET(){
  const all=(await Promise.all(TICKERS.map(feed))).flat().sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt)).slice(0,40);
  return NextResponse.json({news:all,updatedAt:new Date().toISOString()});
}