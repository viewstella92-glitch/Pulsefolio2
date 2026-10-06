export async function POST(req){
  const key=process.env.GEMINI_API_KEY,supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!key||!supabaseUrl||!supabaseKey)return Response.json({error:"AI/Supabase environment variables are missing"},{status:500});
  try{
    const body=await req.json().catch(()=>({}));
    const question=typeof body?.question==="string"?body.question:typeof body?.message==="string"?body.message:"";
    if(!question.trim())return Response.json({error:"กรุณาระบุคำถาม"},{status:400});
    if(question.length>4000)return Response.json({error:"คำถามยาวเกินไป"},{status:400});
    const headers={apikey:supabaseKey,Authorization:"Bearer "+supabaseKey},base=supabaseUrl+"/rest/v1/";
    const [f,a,n,b]=await Promise.all([
      fetch(base+"stock_fundamentals?select=ticker,name,price,trailing_pe,forward_pe,peg,growth_current,growth_next,growth_long,revenue_growth,roe,profit_margin,free_cash_flow,debt_to_equity,beta,industry_forward_pe,fair_value_low,fair_value_base,fair_value_high,updated_at,data_source,data_quality,eps_estimate_current,eps_estimate_7d,eps_estimate_30d,eps_estimate_60d,eps_estimate_90d,earnings_revision_score",{headers,cache:"no-store"}),
      fetch(base+"stock_analysis?select=ticker,valuation_score,growth_score,quality_score,risk_score,news_score,overall_score,buy_zone,explanation,updated_at",{headers,cache:"no-store"}),
      fetch(base+"stock_news?select=ticker,title,source,summary,sentiment,category,impact_score,published_at&order=published_at.desc&limit=60",{headers,cache:"no-store"}),
      fetch(base+"daily_market_briefing?select=briefing_date,briefing_text,generated_at&order=briefing_date.desc&limit=3",{headers,cache:"no-store"})
    ]);
    const [fundamentals,analysis,news,briefings]=await Promise.all([f.json(),a.json(),n.json(),b.json()]);
    if(!f.ok||!a.ok||!n.ok||!b.ok)return Response.json({error:"โหลดข้อมูลจาก Supabase ไม่สำเร็จ"},{status:500});
    const prompt=`คุณคือ AI Analyst ของ Pulsefolio ตอบจากข้อมูลที่แนบเท่านั้น ห้ามสร้างตัวเลขหรือเติมข้อมูลที่ไม่มี ห้ามถือว่า null/— เป็นศูนย์ หากข้อมูลสำคัญไม่พอให้บอกว่าไม่พอ และระบุแหล่ง/วันที่เมื่อเกี่ยวข้อง ตอบภาษาไทย กระชับ มีเหตุผล ห้ามรับประกันผลตอบแทนและไม่ให้คำแนะนำเฉพาะบุคคล
คำถาม: ${question}
FUNDAMENTALS: ${JSON.stringify(fundamentals)}
ANALYSIS: ${JSON.stringify(analysis)}
NEWS: ${JSON.stringify(news)}
DAILY BRIEFINGS: ${JSON.stringify(briefings)}`;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({model:"gemini-3.8-flash",input:prompt}),signal:controller.signal});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return Response.json({error:d.error?.message||`Gemini API error: ${r.status}`},{status:502});
      const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
      if(!text)return Response.json({error:"AI ไม่ได้ส่งข้อความกลับมา"},{status:502});
      return Response.json({text});
    }finally{clearTimeout(timer)}
  }catch(e){return Response.json({error:e?.message||"AI chat failed"},{status:500})}
}