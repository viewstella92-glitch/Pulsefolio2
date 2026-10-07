import { callGemini } from "../../lib/gemini";
export async function POST(req){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
 try{
  const {ticker,current,previous,earnings,news}=await req.json();
  const prompt=`อธิบายเป็นภาษาไทยแบบกระชับว่าทำไมคะแนนลงทุนของ ${ticker} จึงเปลี่ยน ใช้เฉพาะข้อมูล current/previous, earnings และ news ที่ให้มา เปรียบเทียบ valuation, growth, quality, risk, news, price และ buy zone ถ้าค่าใดไม่เปลี่ยนอย่าอ้างว่าเปลี่ยน ถ้าหลักฐานไม่พอให้บอก และระบุว่า earnings ที่กำลังจะมาถึงมีความสำคัญอย่างไรโดยไม่ทำนายผล ห้ามสร้างตัวเลขหรือรับประกันผลตอบแทน ไม่เกิน 130 คำ ข้อมูล: ${JSON.stringify({current,previous,earnings,news})}`;
  const result=await callGemini(prompt,key);
  if(result.ok)return Response.json({text:result.text,model:result.model});
  return Response.json({error:result.reason,details:result.attempts},{status:502});
 }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
