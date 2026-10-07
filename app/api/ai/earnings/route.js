import { NextResponse } from "next/server";
import { callGemini } from "../../../lib/gemini";
export async function POST(req){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return NextResponse.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
 try{
  const {earnings=[],stocks=[]}=await req.json();
  const tracked=earnings.slice(0,12).map(e=>({ticker:e.ticker,date:e.date,estimated:e.estimated,epsAverage:e.epsAverage,revenueAverage:e.revenueAverage}));
  const prompt=`คุณเป็นผู้ช่วยวิเคราะห์ Earnings สำหรับแดชบอร์ดหุ้น US อธิบายว่าการประกาศงบตัวไหนควรจับตาและเพราะอะไร ใช้เฉพาะข้อมูลที่ให้มา จัดอันดับได้สูงสุด 5 หุ้น ใช้ score/valuation เมื่อมีข้อมูล ห้ามทำนายว่าจะ beat/miss และห้ามสร้างตัวเลข ถ้าข้อมูลขาดให้บอก ตอบภาษาไทยกระชับ ไม่เกิน 160 คำ ข้อมูล: ${JSON.stringify({earnings:tracked,stocks:stocks.slice(0,12).map(s=>({ticker:s.ticker,score:s.overall_score,zone:s.buy_zone,forward_pe:s.forward_pe,growth_next:s.growth_next}))})}`;
  const result=await callGemini(prompt,key);
  if(result.ok)return NextResponse.json({text:result.text,model:result.model});
  return NextResponse.json({error:result.reason,details:result.attempts},{status:502});
 }catch(e){return NextResponse.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
