import { NextResponse } from "next/server";
export async function POST(req){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return NextResponse.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
 try{
  const {earnings=[],stocks=[]}=await req.json();
  const tracked=earnings.slice(0,12).map(e=>({ticker:e.ticker,date:e.date,estimated:e.estimated,epsAverage:e.epsAverage,revenueAverage:e.revenueAverage}));
  const prompt=`คุณเป็นผู้ช่วยวิเคราะห์ Earnings สำหรับแดชบอร์ดหุ้น US อธิบายว่าการประกาศงบตัวไหนควรจับตาและเพราะอะไร ใช้เฉพาะข้อมูลที่ให้มา จัดอันดับได้สูงสุด 5 หุ้น ใช้ score/valuation เมื่อมีข้อมูล ห้ามทำนายว่าจะ beat/miss และห้ามสร้างตัวเลข ถ้าข้อมูลขาดให้บอก ตอบภาษาไทยกระชับ ไม่เกิน 160 คำ ข้อมูล: ${JSON.stringify({earnings:tracked,stocks:stocks.slice(0,12).map(s=>({ticker:s.ticker,score:s.overall_score,zone:s.buy_zone,forward_pe:s.forward_pe,growth_next:s.growth_next}))})}`;
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({model:"gemini-3.8-flash",input:prompt})});
  const d=await r.json();
  if(!r.ok)return NextResponse.json({error:d.error?.message||`Gemini API error: ${r.status}`},{status:500});
  const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
  if(!text)return NextResponse.json({error:"Gemini ตอบกลับมาแต่ไม่มีข้อความ",detail:{status:d.status,steps:d.steps?.length||0}},{status:502});
  return NextResponse.json({text});
 }catch(e){return NextResponse.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
