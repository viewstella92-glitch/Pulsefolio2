import { NextResponse } from "next/server";
export async function POST(req){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return NextResponse.json({error:"AI ยังไม่ได้เชื่อมต่อ"});
 try{
  const {earnings=[],stocks=[]}=await req.json();
  const tracked=earnings.slice(0,12).map(e=>({ticker:e.ticker,date:e.date,estimated:e.estimated,epsAverage:e.epsAverage,revenueAverage:e.revenueAverage}));
  const prompt=`You are an earnings intelligence assistant for a personal US stock dashboard. Explain which upcoming earnings events deserve attention and why, using ONLY supplied data. Rank up to 5 tickers. Mention valuation/score only when supplied. Do not predict beats/misses or invent estimates. If data is missing, say so. Concise Thai, under 160 words. DATA: ${JSON.stringify({earnings:tracked,stocks:stocks.slice(0,12).map(s=>({ticker:s.ticker,score:s.overall_score,zone:s.buy_zone,forward_pe:s.forward_pe,growth_next:s.growth_next}))})}`;
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
  const d=await r.json();if(!r.ok)return NextResponse.json({error:d.error?.message||"Gemini request failed"},{status:500});
  return NextResponse.json({text:d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"AI ไม่ได้ส่งคำตอบ"});
 }catch(e){return NextResponse.json({error:e?.message||"Earnings AI failed"},{status:500})}
}