export async function POST(req){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
 try{
  const {ticker,current,previous,earnings,news}=await req.json();
  const prompt=`อธิบายเป็นภาษาไทยแบบกระชับว่าทำไมคะแนนลงทุนของ ${ticker} จึงเปลี่ยน ใช้เฉพาะข้อมูล current/previous, earnings และ news ที่ให้มา เปรียบเทียบ valuation, growth, quality, risk, news, price และ buy zone ถ้าค่าใดไม่เปลี่ยนอย่าอ้างว่าเปลี่ยน ถ้าหลักฐานไม่พอให้บอก และระบุว่า earnings ที่กำลังจะมาถึงมีความสำคัญอย่างไรโดยไม่ทำนายผล ห้ามสร้างตัวเลขหรือรับประกันผลตอบแทน ไม่เกิน 130 คำ ข้อมูล: ${JSON.stringify({current,previous,earnings,news})}`;
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({model:"gemini-3.8-flash",input:prompt})});
  const d=await r.json();
  if(!r.ok)return Response.json({error:d.error?.message||`Gemini API error: ${r.status}`},{status:500});
  const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
  if(!text)return Response.json({error:"Gemini ตอบกลับมาแต่ไม่มีข้อความ",detail:{status:d.status,steps:d.steps?.length||0}},{status:502});
  return Response.json({text});
 }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
