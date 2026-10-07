import { callGemini } from "../../../lib/gemini";

export const maxDuration=60;

export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key)return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
  try{
    const {stocks=[],changes=[],news=[]}=await req.json();
    const top=stocks.slice(0,8).map(s=>({ticker:s.ticker,name:s.name,score:s.investmentDecision?.score,zone:s.investmentDecision?.label,price:s.price,forward_pe:s.forward_pe,peg:s.peg,growth_next:s.growth_next,fair_value:s.fair_value_base}));
    const prompt=`คุณเป็นผู้ช่วยสรุปตลาดในแดชบอร์ดหุ้น US เขียนสรุปภาษาไทยกระชับ 3 หัวข้อ: "ภาพรวม", "หุ้นที่น่าสนใจ", "สิ่งที่เปลี่ยน" ใช้เฉพาะข้อมูลที่ให้ ห้ามสร้างตัวเลขเอง ถ้าข้อมูลขาดให้บอก ห้ามรับประกันผลตอบแทนหรือให้คำแนะนำเฉพาะบุคคล ไม่เกิน 180 คำ ข้อมูล: ${JSON.stringify({top,changes:changes.slice(0,8),news:news.slice(0,8).map(n=>({ticker:n.ticker,title:n.title}))})}`;
    const result=await callGemini(prompt,key);
    if(result.ok)return Response.json({text:result.text,model:result.model});
    return Response.json({error:result.reason,details:result.attempts},{status:502});
  }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
