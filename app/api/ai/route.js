export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  if(!key) return Response.json({error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"},{status:500});
  try{
    const {ticker,data,news=[]}=await req.json();
    if(!data) return Response.json({error:"ไม่พบข้อมูลหุ้น"},{status:400});

    const prompt=`คุณเป็นผู้ช่วยวิเคราะห์หุ้น US ในแดชบอร์ดส่วนตัว วิเคราะห์ ${ticker} โดยใช้เฉพาะข้อมูลที่ให้มา ห้ามสร้างตัวเลขเอง ตอบเป็นภาษาไทย กระชับ ใช้งานได้จริง ครอบคลุม valuation (Forward P/E, PEG, industry P/E, fair value), growth, quality, risk, buy zone และความน่าเชื่อถือของ PEG หากข้อมูลขาดให้ระบุว่าขาด ห้ามรับประกันผลตอบแทนหรือให้คำแนะนำเฉพาะบุคคล เพิ่มหัวข้อ "แนวโน้มราคาจากข่าว": ให้ตรวจข่าวที่แนบมา หากมีการปรับ Guidance, EPS/Revenue estimates, analyst price target หรือข่าวธุรกิจที่มีตัวเลขชัดเจน ให้คำนวณผลกระทบต่อราคาหรือ upside เฉพาะจากตัวเลขที่มีจริงเท่านั้น หากไม่มีราคาเป้าหมายหรือข้อมูลเพียงพอ ห้ามสร้างเปอร์เซ็นต์คาดการณ์ ให้บอกว่า "ยังประเมิน % จากข่าวไม่ได้" และอธิบายปัจจัยบวก/ลบแทน ข้อมูลหุ้น: ${JSON.stringify(data)} ข่าวล่าสุด: ${JSON.stringify(news)}`;

    let lastError="";
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),30000);
        const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-goog-api-key":key},
          body:JSON.stringify({model:"gemini-3.8-flash",input:prompt}),
          signal:controller.signal
        });
        clearTimeout(timer);
        const d=await r.json().catch(()=>({}));
        if(r.ok){
          const text=d.output_text||d.steps?.flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("")||"";
          if(text) return Response.json({text});
          lastError="Gemini ตอบกลับมาแต่ไม่มีข้อความ";
        }else{
          lastError=d.error?.message||`Gemini API error: ${r.status}`;
          if(![429,500,502,503,504].includes(r.status)) break;
        }
      }catch(e){
        lastError=e?.name==="AbortError"?"Gemini request timeout":(e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ");
      }
      if(attempt<3) await new Promise(r=>setTimeout(r,1500*attempt));
    }
    return Response.json({error:lastError||"Gemini request failed"},{status:502});
  }catch(e){return Response.json({error:e?.message||"เชื่อมต่อ Gemini ไม่สำเร็จ"},{status:500})}
}
