const DEFAULT_MODEL="gemini-3.8-flash";
const DEFAULT_FALLBACKS=["gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"];

export const GEMINI_MODEL=process.env.GEMINI_MODEL?.trim()||DEFAULT_MODEL;
export const GEMINI_MODELS=[...new Set([GEMINI_MODEL,...(process.env.GEMINI_FALLBACK_MODELS||"").split(",").map(x=>x.trim()).filter(Boolean),...DEFAULT_FALLBACKS])];

export async function callGemini(prompt,key,{budgetMs=55000,perModelMs=20000}={}){
  const deadline=Date.now()+budgetMs;
  const attempts=[];
  for(const model of GEMINI_MODELS){
    const remaining=deadline-Date.now();
    if(remaining<3000){attempts.push({model,status:null,reason:"skipped: time budget exhausted"});break;}
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.min(perModelMs,remaining));
    try{
      const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({model,input:prompt}),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      const reason=data?.error?.message||("Gemini "+model+" error: "+response.status);
      attempts.push({model,status:response.status,reason:response.ok?null:reason});
      if(response.ok){
        const text=data.output_text||data.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
        if(text)return {ok:true,text,model,attempts};
        return {ok:false,status:response.status,reason:"Gemini returned no text",attempts};
      }
      if(response.status===401||response.status===403)break;
    }catch(e){attempts.push({model,status:null,reason:e?.name==="AbortError"?"timeout":(e?.message||"request failed")});}
    finally{clearTimeout(timer)}
  }
  return {ok:false,reason:"Gemini ทุกโมเดลที่ตั้งไว้ไม่พร้อมใช้งานในขณะนี้",attempts};
}