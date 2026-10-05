export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key)return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
  try{
    const {stocks=[],changes=[],news=[]}=await req.json();
    const top=stocks.slice(0,8).map(s=>({ticker:s.ticker,name:s.name,score:s.overall_score,zone:s.buy_zone,price:s.price,forward_pe:s.forward_pe,peg:s.peg,growth_next:s.growth_next,fair_value:s.fair_value_base}));
    const prompt=`คุณเป็นผู้ช่วยสรุปตลาดในแดชบอร์ดหุ้น US เขียนสรุปภาษาไทยกระชับ 3 หัวข้อ: "ภาพรวม", "หุ้นที่น่าสนใจ", "สิ่งที่เปลี่ยน" ใช้เฉพาะข้อมูลที่ให้ ห้ามสร้างตัวเลขเอง ถ้าข้อมูลขาดให้บอก ห้ามรับประกันผลตอบแทนหรือให้คำแนะนำเฉพาะบุคคล ไม่เกิน 180 คำ ข้อมูล: ${JSON.stringify({top,changes:changes.slice(0,8),news:news.slice(0,8).map(n=>({ticker:n.ticker,title:n.title}))})}`;
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({model:"gemini-3.8-flash",input:prompt})});
    const d=await r.json();
    if(!r.ok)return Response.json({error:d.error?.message||`Gemini API error: ${r.status}`},{status:500});
    const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
    if(!text)return Response.json({error:"Gemini ตอบกลับมาแต่ไม่มีข้อความ",detail:{status:d.status,steps:d.steps?.length||0}},{status:502});
    return Response.json({text});
  }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
