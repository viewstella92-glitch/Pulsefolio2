export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key)return Response.json({error:"AI ยังไม่ได้เชื่อมต่อ"});
  try{
    const {stocks=[],changes=[],news=[]}=await req.json();
    const top=stocks.slice(0,8).map(s=>({ticker:s.ticker,name:s.name,score:s.overall_score,zone:s.buy_zone,price:s.price,forward_pe:s.forward_pe,peg:s.peg,growth_next:s.growth_next,fair_value:s.fair_value_base}));
    const prompt=`You are the AI market brief inside a personal US stock dashboard. Write a concise Thai brief with 3 sections: "ภาพรวม", "หุ้นที่น่าสนใจ", "สิ่งที่เปลี่ยน". Use ONLY supplied data. Never invent numbers. Mention when data is missing. Do not give guaranteed returns or personalized financial advice. Keep it under 180 Thai words. Data: ${JSON.stringify({top,changes:changes.slice(0,8),news:news.slice(0,8).map(n=>({ticker:n.ticker,title:n.title}))})}`;
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({model:"gemini-3.8-flash",input:prompt})
    });
    const d=await r.json();
    if(!r.ok)return Response.json({error:d.error?.message||"Gemini request failed"},{status:500});
    return Response.json({text:const text=d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||d.output_text||"AI ไม่ได้ส่งคำตอบกลับมา";});
  }catch(e){return Response.json({error:e?.message||"AI brief failed"},{status:500})}
}
