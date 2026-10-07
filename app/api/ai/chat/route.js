import { callGemini } from "../../../lib/gemini";
export const maxDuration=60;

export async function POST(req){
  const key=process.env.GEMINI_API_KEY;
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!key||!supabaseUrl||!supabaseKey){
    return Response.json({error:"AI/Supabase environment variables are missing"},{status:500});
  }

  try{
    const body=await req.json().catch(()=>({}));
    const question=typeof body?.question==="string"
      ? body.question
      : typeof body?.message==="string"
        ? body.message
        : "";
    if(!question.trim())return Response.json({error:"กรุณาระบุคำถาม"},{status:400});
    if(question.length>4000)return Response.json({error:"คำถามยาวเกินไป"},{status:400});

    const history=Array.isArray(body?.history)
      ? body.history.slice(-4).map(x=>({
          role:x?.role==="assistant"?"assistant":"user",
          text:String(x?.text??x?.content??"").slice(0,1200)
        })).filter(x=>x.text.trim())
      : [];

    const headers={apikey:supabaseKey,Authorization:"Bearer "+supabaseKey};
    const base=supabaseUrl+"/rest/v1/";

    const [f,a,n,b,state]=await Promise.all([
      fetch(base+"stock_fundamentals?select=ticker,name,price,trailing_pe,forward_pe,peg,growth_current,growth_next,growth_long,revenue_growth,roe,profit_margin,free_cash_flow,debt_to_equity,beta,industry_forward_pe,fair_value_low,fair_value_base,fair_value_high,updated_at,data_source,data_quality,eps_estimate_current,eps_estimate_7d,eps_estimate_30d,eps_estimate_60d,eps_estimate_90d,earnings_revision_score",{headers,cache:"no-store"}),
      fetch(base+"stock_analysis?select=ticker,valuation_score,growth_score,quality_score,risk_score,news_score,overall_score,buy_zone,explanation,updated_at",{headers,cache:"no-store"}),
      fetch(base+"stock_news?select=ticker,title,source,summary,sentiment,category,impact_score,published_at&order=published_at.desc&limit=60",{headers,cache:"no-store"}),
      fetch(base+"daily_market_briefing?select=briefing_date,briefing_text,generated_at&order=briefing_date.desc&limit=3",{headers,cache:"no-store"}),
      fetch(base+"pulsefolio_state?id=eq.1&select=watchlist,portfolio",{headers,cache:"no-store"})
    ]);

    const [fundamentals,analysis,news,briefings,stateRows]=await Promise.all([
      f.json().catch(()=>[]),
      a.json().catch(()=>[]),
      n.json().catch(()=>[]),
      b.json().catch(()=>[]),
      state.json().catch(()=>[])
    ]);

    if(!f.ok||!a.ok||!n.ok||!b.ok||!state.ok){
      return Response.json({error:"โหลดข้อมูลจาก Supabase ไม่สำเร็จ"},{status:500});
    }

    const knownTickers=new Set(
      (fundamentals||[])
        .map(x=>String(x.ticker||"").trim().toUpperCase())
        .filter(Boolean)
    );
    const tickerMatches=[...question.matchAll(/(?<![A-Za-z])\$?([A-Z]{1,5}(?:[.-][A-Z]{1,3})?)(?![A-Za-z])/g)].map(m=>m[1]).filter(t=>knownTickers.has(t));
    const tickers=[...new Set(tickerMatches)];

    const stateRow=stateRows?.[0]||{watchlist:[],portfolio:{}};
    const portfolioState={
      watchlist:Array.isArray(stateRow.watchlist)?stateRow.watchlist:[],
      portfolio:stateRow.portfolio&&typeof stateRow.portfolio==="object"?stateRow.portfolio:{}
    };
    const mine=[...new Set([...Object.keys(portfolioState.portfolio),...portfolioState.watchlist])].map(x=>String(x).toUpperCase());
    const wantsMine=/พอร์ต|ถืออยู่|ติดตาม|portfolio|watchlist/i.test(question);
    const scope=tickers.length?tickers:(wantsMine&&mine.length?mine:[]);
    const filterByTicker=(rows)=>scope.length
      ? (rows||[]).filter(x=>scope.includes(String(x.ticker||"").toUpperCase()))
      : (rows||[]);

    const filteredFundamentals=filterByTicker(fundamentals);
    const filteredAnalysis=filterByTicker(analysis);
    const filteredNews=filterByTicker(news).map(x=>({
      ...x,
      summary:String(x.summary||"").slice(0,200)
    }));

    const historyText=history.length
      ? history.map(x=>`${x.role==="assistant"?"AI":"ผู้ใช้"}: ${x.text}`).join("\n")
      : "ไม่มีประวัติบทสนทนา";

    const scopeText=scope.length
      ? `ใช้ Fundamentals / Analysis / News เฉพาะหุ้นในขอบเขตนี้: ${scope.join(", ")}`
      : "ไม่พบ ticker หรือขอบเขตพอร์ต/รายการติดตามที่ตรงกับข้อมูล จึงใช้ข้อมูลหุ้นทั้งหมดที่มี";

    const prompt=`คุณคือ AI Analyst ของ Pulsefolio ตอบจากข้อมูลที่แนบเท่านั้น
ห้ามสร้างตัวเลขหรือเติมข้อมูลที่ไม่มี ห้ามถือว่า null/— เป็นศูนย์
ถ้าข้อมูลสำคัญไม่พอให้บอกว่าไม่พอ
ตอบภาษาไทย กระชับ มีเหตุผล และแยกข้อเท็จจริงจากการตีความ
เมื่อพูดถึงตัวเลขให้ยึดข้อมูลล่าสุดที่แนบมา และระบุวันที่/แหล่งเมื่อมี
ห้ามรับประกันผลตอบแทนและไม่ให้คำแนะนำเฉพาะบุคคล

คำถามปัจจุบัน:
${question}

ประวัติบทสนทนาล่าสุด:
${historyText}

ขอบเขตข้อมูล:
${scopeText}

WATCHLIST / PORTFOLIO ของผู้ใช้:
${JSON.stringify(portfolioState)}

FUNDAMENTALS:
${JSON.stringify(filteredFundamentals)}

ANALYSIS:
${JSON.stringify(filteredAnalysis)}

NEWS (summary ถูกจำกัดไม่เกิน 200 ตัวอักษรต่อข่าว):
${JSON.stringify(filteredNews)}

DAILY MARKET BRIEF:
${JSON.stringify(briefings||[])}`;

    const result=await callGemini(prompt,key,{budgetMs:55000,perModelMs:20000});
    if(!result.ok)return Response.json({error:result.reason,details:result.attempts},{status:502});
    return Response.json({text:result.text,model:result.model,attempts:result.attempts});
  }catch(e){
    return Response.json({error:e?.message||"AI chat failed"},{status:500});
  }
}
