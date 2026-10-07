const GEMINI_MODELS=[
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

async function callGemini(model,prompt,key){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({model,input:prompt}),
      signal:controller.signal
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok) return {ok:false,status:r.status,reason:d?.error?.message||`Gemini ${model} error: ${r.status}`};
    const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
    return text?{ok:true,text,model}:{ok:false,status:r.status,reason:"Gemini returned no text"};
  }catch(e){
    return {ok:false,reason:e?.name==="AbortError"?"timeout":(e?.message||"request failed")};
  }finally{clearTimeout(timer)}
}

export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key) return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
  try{
    const {ticker,data,news=[]}=await req.json();
    if(!data) return Response.json({error:"ไม่พบข้อมูลหุ้น"},{status:400});
    const prompt=`คุณเป็นผู้ช่วยวิเคราะห์หุ้น US ในแดชบอร์ดส่วนตัว วิเคราะห์ ${ticker} โดยใช้เฉพาะข้อมูลที่ให้มา ห้ามสร้างตัวเลขเอง ตอบเป็นภาษาไทย กระชับ ใช้งานได้จริง ครอบคลุม valuation (Forward P/E, PEG, industry P/E, fair value), growth, quality, risk, buy zone และความน่าเชื่อถือของข้อมูล หากข้อมูลขาดหรือขัดแย้งให้ระบุชัดเจน เพิ่มหัวข้อ "แนวโน้มราคาจากข่าว": ใช้เฉพาะตัวเลขจริงจากข่าว หากไม่มีข้อมูลพอให้บอกว่า "ยังประเมิน % จากข่าวไม่ได้" ห้ามรับประกันผลตอบแทนหรือให้คำแนะนำเฉพาะบุคคล ข้อมูลหุ้น: ${JSON.stringify(data)} ข่าวล่าสุด: ${JSON.stringify(news)}`;

    const configured=(process.env.GEMINI_MODELS||"").split(",").map(x=>x.trim()).filter(Boolean);
    const models=[...new Set([...configured,...GEMINI_MODELS])];
    const attempts=[];
    for(const model of models){
      const result=await callGemini(model,prompt,key);
      attempts.push({model,status:result.status||null,reason:result.reason||null});
      if(result.ok) return Response.json({text:result.text,model:result.model,provider:"google-gemini",attempts});
      // 401/403 usually means the key/project cannot access the remaining models either.
      if(result.status===401||result.status===403) break;
    }
    return Response.json({error:"Gemini ทุกโมเดลที่ตั้งไว้ไม่พร้อมใช้งานในขณะนี้",details:attempts},{status:502});
  }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
