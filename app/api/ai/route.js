import { callGemini } from "../../lib/gemini";

export const maxDuration=60;

export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key) return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
  try{
    const {ticker,data,news=[]}=await req.json();
    if(!data) return Response.json({error:"ไม่พบข้อมูลหุ้น"},{status:400});
    const prompt=`คุณเป็นผู้ช่วยวิเคราะห์หุ้น US ในแดชบอร์ดส่วนตัว วิเคราะห์ ${ticker} โดยใช้เฉพาะข้อมูลที่ให้มา ห้ามสร้างตัวเลขเอง ตอบเป็นภาษาไทย กระชับ ใช้งานได้จริง ครอบคลุม valuation (Forward P/E, PEG, industry P/E, fair value), growth, quality, risk, buy zone และความน่าเชื่อถือของข้อมูล หากข้อมูลขาดหรือขัดแย้งให้ระบุชัดเจน เพิ่มหัวข้อ "แนวโน้มราคาจากข่าว": ใช้เฉพาะตัวเลขจริงจากข่าว หากไม่มีข้อมูลพอให้บอกว่า "ยังประเมิน % จากข่าวไม่ได้" ห้ามรับประกันผลตอบแทนหรือให้คำแนะนำเฉพาะบุคคล ข้อมูลหุ้น: ${JSON.stringify(data)} ข่าวล่าสุด: ${JSON.stringify(news)}`;
    const result=await callGemini(prompt,key,{budgetMs:55000,perModelMs:20000});
    if(result.ok)return Response.json({text:result.text,model:result.model,provider:"google-gemini",attempts:result.attempts});
    return Response.json({error:result.reason,details:result.attempts},{status:502});
  }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
