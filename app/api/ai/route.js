const DEFAULT_MODELS=[
  "openai/gpt-5.4-mini",
  "google/gemini-2.5-flash",
  "anthropic/claude-sonnet-4.6",
  "alibaba/qwen-3-32b"
];

function extractOpenAIText(data){
  return data?.choices?.map(c=>c?.message?.content||"").filter(Boolean).join("\n").trim()||"";
}

async function callGateway(model,prompt){
  const key=process.env.AI_GATEWAY_API_KEY;
  const oidc=process.env.VERCEL_OIDC_TOKEN;
  if(!key&&!oidc) return {ok:false,reason:"AI Gateway credentials not configured"};
  const headers={"Content-Type":"application/json"};
  if(key) headers.Authorization=`Bearer ${key}`;
  if(oidc) headers["x-vercel-oidc-token"]=oidc;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{
      method:"POST",
      headers,
      body:JSON.stringify({model,messages:[{role:"system",content:"คุณเป็นผู้ช่วยวิเคราะห์หุ้น US สำหรับแดชบอร์ดส่วนตัว ห้ามสร้างตัวเลขที่ไม่มีในข้อมูล และต้องระบุข้อมูลที่ขาดหรือขัดแย้งอย่างชัดเจน"},{role:"user",content:prompt}],temperature:0.2,max_tokens:1800}),
      signal:controller.signal
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok) return {ok:false,status:r.status,reason:d?.error?.message||`Gateway error ${r.status}`};
    const text=extractOpenAIText(d);
    if(!text) return {ok:false,status:r.status,reason:"Model returned no text"};
    return {ok:true,text,model:d?.model||model};
  }catch(e){
    return {ok:false,reason:e?.name==="AbortError"?"Model timeout":(e?.message||"Gateway request failed")};
  }finally{clearTimeout(timer)}
}

async function callLegacyGemini(prompt){
  const key=process.env.GEMINI_API_KEY;
  if(!key) return {ok:false,reason:"GEMINI_API_KEY not configured"};
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({model:"gemini-3.8-flash",input:prompt}),signal:controller.signal
    });
    clearTimeout(timer);
    const d=await r.json().catch(()=>({}));
    if(!r.ok) return {ok:false,status:r.status,reason:d?.error?.message||`Gemini API error ${r.status}`};
    const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
    return text?{ok:true,text,model:"gemini-3.8-flash"}:{ok:false,reason:"Gemini returned no text"};
  }catch(e){return {ok:false,reason:e?.message||"Gemini request failed"};}
}

export async function POST(req){
  try{
    const {ticker,data,news=[]}=await req.json();
    if(!data) return Response.json({error:"ไม่พบข้อมูลหุ้น"},{status:400});

    const prompt=`วิเคราะห์ ${ticker} โดยใช้เฉพาะข้อมูลที่ให้มา ห้ามสร้างตัวเลขเอง ตอบภาษาไทย กระชับแต่ครบ: valuation (Forward P/E, PEG, industry P/E, fair value), growth, quality, risk, buy zone และความน่าเชื่อถือของข้อมูล เพิ่มหัวข้อ "แนวโน้มราคาจากข่าว" และใช้เฉพาะตัวเลขจริงจากข่าว หากไม่มีข้อมูลพอให้บอกว่า "ยังประเมิน % จากข่าวไม่ได้" ห้ามรับประกันผลตอบแทนหรือให้คำแนะนำเฉพาะบุคคล ข้อมูลหุ้น: ${JSON.stringify(data)} ข่าวล่าสุด: ${JSON.stringify(news)}`;

    const configured=(process.env.AI_MODELS||"").split(",").map(x=>x.trim()).filter(Boolean);
    const models=[...new Set([...configured,...DEFAULT_MODELS])];
    const attempts=[];
    for(const model of models){
      const result=await callGateway(model,prompt);
      attempts.push({model,status:result.status||null,reason:result.reason||null});
      if(result.ok) return Response.json({text:result.text,model:result.model,provider:"vercel-ai-gateway",attempts});
      if(result.status===401||result.status===403) break;
    }

    const legacy=await callLegacyGemini(prompt);
    attempts.push({model:legacy.model||"gemini-3.8-flash",status:legacy.status||null,reason:legacy.reason||null});
    if(legacy.ok) return Response.json({text:legacy.text,model:legacy.model,provider:"google-direct",attempts});

    return Response.json({error:"AI ทุกช่องทางไม่พร้อมใช้งานในขณะนี้",details:attempts},{status:502});
  }catch(e){return Response.json({error:e?.message||"AI request failed"},{status:500})}
}
