import { NextResponse } from "next/server";

const TICKERS=["NVDA","CRM","CI","MU","ADBE","APP","INTU","NFLX","VRT","MELI","GRAB","ZTS","AZO","BLK","MA","AAPL","ARM","ALAB"];
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