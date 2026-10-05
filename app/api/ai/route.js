export async function POST(req){
  const key=process.env.OPENAI_API_KEY;
  if(!key) return Response.json({error:"AI ยังไม่ได้เชื่อมต่อ: กรุณาเพิ่ม OPENAI_API_KEY ใน Vercel Environment Variables"});
  const {ticker,data}=await req.json();
  if(!data) return Response.json({error:"No stock data"},{status:400});
  const prompt=`You are the investment-analysis assistant inside a personal US stock dashboard. Analyze ${ticker} using ONLY the supplied structured data. Do not invent missing numbers. Explain in Thai, concise and practical. Discuss valuation (Forward P/E, PEG, industry P/E, fair value), growth, quality, risk, buy zone, and whether PEG is reliable for this company. If data is missing, say it is missing. Do not give a guaranteed price target or personalized financial advice. Data: ${JSON.stringify(data)}`;
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-6-luna",tools:[{type:"web_search"}],input:prompt})});
    const d=await r.json();
    if(!r.ok) return Response.json({error:d.error?.message||"OpenAI request failed"},{status:500});
    return Response.json({text:d.output_text||"AI ไม่ได้ส่งคำตอบกลับมา"});
  }catch(e){return Response.json({error:e.message||"AI request failed"},{status:500})}
}