export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key) return Response.json({error:"AI ยังไม่ได้เชื่อมต่อ: กรุณาเพิ่ม GEMINI_API_KEY ใน Vercel Environment Variables"});
  const {ticker,data}=await req.json();
  if(!data) return Response.json({error:"No stock data"},{status:400});
  const prompt=`You are the investment-analysis assistant inside a personal US stock dashboard. Analyze ${ticker} using ONLY the supplied structured data. Do not invent missing numbers. Explain in Thai, concise and practical. Discuss valuation (Forward P/E, PEG, industry P/E, fair value), growth, quality, risk, buy zone, and whether PEG is reliable for this company. If data is missing, say it is missing. Do not give a guaranteed price target or personalized financial advice. Data: ${JSON.stringify(data)}`;
  try{
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
    const d=await r.json();
    if(!r.ok) return Response.json({error:d.error?.message||"Gemini request failed"},{status:500});
    const text=d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"AI ไม่ได้ส่งคำตอบกลับมา";
    return Response.json({text});
  }catch(e){return Response.json({error:e.message||"AI request failed"},{status:500})}
}