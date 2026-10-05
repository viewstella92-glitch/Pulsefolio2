export async function POST(req){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return Response.json({error:"AI ยังไม่ได้เชื่อมต่อ"});
 try{
  const {ticker,current,previous,earnings,news}=await req.json();
  const prompt=`Explain in concise Thai why the investment score for ${ticker} changed. Use ONLY the supplied current/previous structured data, earnings and news. Compare valuation, growth, quality, risk, news, price and buy zone. If a metric did not change, don't pretend it did. If evidence is missing, say so. Also state whether an upcoming earnings event could be important, without predicting the result. No invented numbers, no guaranteed returns, no personalized advice. Under 130 Thai words. DATA: ${JSON.stringify({current,previous,earnings,news})}`;
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({model:"gemini-3.8-flash",input:prompt})
  });
  const d=await r.json();
  if(!r.ok)return Response.json({error:d.error?.message||"Gemini request failed"},{status:500});
  return Response.json({text:const text=d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||d.output_text||"AI ไม่ได้ส่งคำตอบ";});
 }catch(e){return Response.json({error:e?.message||"AI change analysis failed"},{status:500})}
}
