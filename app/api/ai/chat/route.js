export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!key||!supabaseUrl||!supabaseKey)return Response.json({error:"AI/Supabase environment variables are missing"},{status:500});
  try{
    const {question}=await req.json();
    if(!question||typeof question!=="string")return Response.json({error:"กรุณาระบุคำถาม"},{status:400});
    const headers={apikey:supabaseKey,Authorization:"Bearer "+supabaseKey};
    const base=supabaseUrl+"/rest/v1/";
    const [f,a,n,b]=await Promise.all([
      fetch(base+"stock_fundamentals?select=*",{headers,cache:"no-store"}),
      fetch(base+"stock_analysis?select=*",{headers,cache:"no-store"}),
      fetch(base+"stock_news?select=ticker,title,source,summary,sentiment,category,impact_score,published_at&order=published_at.desc&limit=60",{headers,cache:"no-store"}),
      fetch(base+"daily_market_briefing?select=briefing_date,briefing_text,generated_at&order=briefing_date.desc&limit=3",{headers,cache:"no-store"})
    ]);
    const [fundamentals,analysis,news,briefings]=await Promise.all([f.json(),a.json(),n.json(),b.json()]);
    if(!f.ok||!a.ok||!n.ok||!b.ok)return Response.json({error:"โหลดข้อมูลจาก Supabase ไม่สำเร็จ"},{status:500});
    const prompt=`คุณคือ AI Analyst ของ Pulsefolio ตอบคำถามเกี่ยวกับหุ้นสหรัฐจากข้อมูลฐานข้อมูลที่แนบเท่านั้น ห้ามสร้างราคา P/E Growth หรือสถิติใด ๆ เอง หากข้อมูลไม่พอให้บอกตรง ๆ ระบุ ticker และวันที่ของข้อมูลเมื่อเกี่ยวข้อง ตอบภาษาไทย กระชับแต่มีเหตุผล ห้ามรับประกันผลตอบแทนและไม่ให้คำแนะนำเฉพาะบุคคล
คำถาม: ${question}
FUNDAMENTALS: ${JSON.stringify(fundamentals)}
ANALYSIS: ${JSON.stringify(analysis)}
NEWS: ${JSON.stringify(news)}
DAILY BRIEFINGS: ${JSON.stringify(briefings)}`;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
        method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({model:"gemini-3.8-flash",input:prompt}),signal:controller.signal
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return Response.json({error:d.error?.message||`Gemini API error: ${r.status}`},{status:502});
      const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
      if(!text)return Response.json({error:"AI ไม่ได้ส่งข้อความกลับมา"},{status:502});
      return Response.json({text});
    }finally{clearTimeout(timer)}
  }catch(e){return Response.json({error:e?.message||"AI chat failed"},{status:500})}
}