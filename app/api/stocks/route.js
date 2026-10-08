import { getVerified, yahooPrice } from "../../lib/edgar";

export const dynamic="force-dynamic";
export const maxDuration=60;

const TIMEOUT_MS=8000;
const num=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
const tfetch=(u,o={})=>fetch(u,{...o,signal:AbortSignal.timeout(TIMEOUT_MS)});

async function enrichWithVerified(stock){
  const out={...stock};
  const src={};
  const fill=(k,v,label)=>{
    if(num(v)==null)return;
    const old=num(out[k]);
    if(old!=null&&Math.abs(old-num(v))>Math.max(Math.abs(num(v))*0.03,0.01)){
      out.data_quality_details={
        ...(out.data_quality_details||{}),
        ["conflict_"+k]:{previous:old,verified:num(v),detected_at:new Date().toISOString()}
      };
    }
    out[k]=num(v);
    src[k]=label;
  };

  const v=await Promise.race([getVerified(out.ticker),new Promise(r=>setTimeout(()=>r({ok:false,ticker:out.ticker,reason:"หมดเวลาดึงข้อมูลจาก SEC"}),10000))]);
  if(v.ok){
    const secDate=v.metrics?.epsDilutedTtm?.asOf||v.metrics?.revenueTtm?.asOf||"?";
    const sec="SEC EDGAR (งบ "+secDate+")";
    const px="Yahoo Finance"+(v.price?.asOf?" "+v.price.asOf:"");

    fill("price",v.price?.value,px);
    fill("trailing_pe",v.valuation?.peTtm,"ราคา Yahoo ÷ EPS TTM จาก "+sec);
    fill("eps_trailing",v.metrics?.epsDilutedTtm?.value,sec);
    fill("free_cash_flow",v.metrics?.freeCashFlowTtm?.value,sec+" CFO − CapEx");
    fill("profit_margin",v.derived?.netMarginPct,sec);
    fill("roe",v.derived?.roePct,sec);
    // Supabase ใช้หน่วย debt/equity เป็นเปอร์เซ็นต์ตาม pipeline เดิม
    fill("debt_to_equity",v.derived?.debtToEquity!=null?v.derived.debtToEquity*100:null,sec);
    fill("revenue_growth",v.derived?.revenueGrowth?.pct,sec+" ปีงบเทียบปีงบ");
    fill("market_cap",v.valuation?.marketCap,"ราคา Yahoo × จำนวนหุ้นจาก SEC");

    out.verified_trust=v.trust?.level||null;
    out.verified_warnings=v.trust?.warnings||[];
    out.verified_fetched_at=v.fetchedAt||null;
  }else{
    out.verified_trust="ต่ำ";
    out.verified_warnings=[v.reason||"ไม่มีข้อมูลที่ตรวจสอบได้"];
    try{
      const p=await yahooPrice(out.ticker);
      fill("price",p.price,"Yahoo Finance"+(p.time?" "+p.time:""));
    }catch{}
  }

  const filled=Object.keys(src).length>0;
  out.fallback_field_sources=src;
  out.data_sources=Array.from(new Set([
    ...(Array.isArray(out.data_sources)?out.data_sources:[]),
    filled?"SEC EDGAR / Yahoo (เติมฟิลด์ที่ขาด)":"Supabase"
  ]));
  out.data_quality_source=filled?"fallback_enriched":"supabase";
  if(filled)out.data_updated_at=new Date().toISOString();
  return out;
}

async function enrichAll(stocks,needs){
  const out=[];
  let enriched=0;
  for(let i=0;i<stocks.length;i+=6){
    const batch=stocks.slice(i,i+6);
    const rows=await Promise.all(batch.map(async s=>{
      if(!needs(s))return {stock:{...s,data_quality_source:"supabase"},used:false};
      const stock=await enrichWithVerified(s);
      return {stock,used:stock.data_quality_source==="fallback_enriched"};
    }));
    for(const row of rows){out.push(row.stock);if(row.used)enriched++;}
  }
  return {stocks:out,enriched};
}

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return Response.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};

  try{
    const base=url+"/rest/v1/";
    const [u,f,a,ai]=await Promise.all([
      tfetch(base+"stock_universe?select=ticker,name,sector,industry&active=eq.true",{headers,cache:"no-store"}),
      tfetch(base+"stock_fundamentals?select=*",{headers,cache:"no-store"}),
      tfetch(base+"stock_analysis?select=*",{headers,cache:"no-store"}),
      tfetch(base+"stock_ai_analysis?select=ticker,analysis_text,model,generated_at,data_quality,input_snapshot",{headers,cache:"no-store"})
    ]);

    const [universe,fundamentals,analysis,aiRows]=await Promise.all([
      u.json(),f.json(),a.json(),ai.json()
    ]);

    if(!u.ok||!f.ok||!a.ok||!ai.ok){
      return Response.json({error:"Supabase query failed",detail:{universe,fundamentals,analysis,ai:aiRows}},{status:500});
    }

    const fm=new Map((fundamentals||[]).map(x=>[x.ticker,x]));
    const am=new Map((analysis||[]).map(x=>[x.ticker,x]));

    const freshAI=(aiRows||[]).filter(row=>{
      const fund=fm.get(row.ticker);
      if(!fund||!row.generated_at||!fund.updated_at)return false;
      const generated=Date.parse(row.generated_at),updated=Date.parse(fund.updated_at);
      if(!Number.isFinite(generated)||!Number.isFinite(updated)||generated<updated)return false;

      const snap=row.input_snapshot?.fundamentals;
      const currentPrice=num(fund.price),snapPrice=num(snap?.price);
      if(currentPrice!=null&&snapPrice!=null&&currentPrice>0&&snapPrice>0){
        if(Math.abs(currentPrice-snapPrice)/currentPrice>0.03)return false;
      }
      return true;
    });

    const aim=new Map(freshAI.map(x=>[x.ticker,x]));
    const initial=(universe||[]).map(x=>({
      ...x,
      ...(fm.get(x.ticker)||{}),
      ...(am.get(x.ticker)||{}),
      ...(aim.get(x.ticker)||{})
    }));

    // เติมเฉพาะข้อมูลที่ไม่มีจริง ๆ:
    // SEC/Yahoo verified เติม trailing fundamentals;
    // Forward PE / PEG / growth_next จะยังเป็น null หาก Supabase ไม่มี
    // เพื่อไม่ให้ระบบสร้างค่าประมาณแทนข้อมูลจริง
    const needsFallback=s=>[
      "price",
      "trailing_pe",
      "profit_margin",
      "roe",
      "free_cash_flow",
      "debt_to_equity",
      "revenue_growth",
      "market_cap"
    ].some(k=>num(s[k])==null);

    const {stocks,enriched}=await enrichAll(initial,needsFallback);

    return Response.json({
      stocks,
      meta:{
        universe:universe?.length||0,
        fundamentals:fundamentals?.length||0,
        analysis:analysis?.length||0,
        ai:freshAI.length,
        fallbackEnriched:enriched
      },
      updatedAt:new Date().toISOString()
    });
  }catch(e){
    return Response.json({error:e?.message||"Stock API failed"},{status:500});
  }
}
