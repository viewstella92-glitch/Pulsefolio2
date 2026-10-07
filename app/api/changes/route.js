import { NextResponse } from "next/server";
import { investmentDecision } from "../../lib/investmentDecision";

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return NextResponse.json({error:"Supabase environment variables are missing"},{status:500});
  const headers={apikey:key,Authorization:"Bearer "+key};
  try{
    const base=url+"/rest/v1/";
    const [h,l,f,a]=await Promise.all([
      fetch(base+"stock_data_history?select=ticker,captured_at,price,forward_pe,peg,growth_next,overall_score,buy_zone,fair_value_base&order=captured_at.desc&limit=300",{headers,cache:"no-store"}),
      fetch(base+"stock_update_log?select=id,started_at,finished_at,status,updated_count,failed_count,message&order=id.desc&limit=1",{headers,cache:"no-store"}),
      fetch(base+"stock_fundamentals?select=*",{headers,cache:"no-store"}),
      fetch(base+"stock_analysis?select=*",{headers,cache:"no-store"})
    ]);
    const [history,logs,fundamentals,analysis]=await Promise.all([h.json(),l.json(),f.json(),a.json()]);
    if(!h.ok||!l.ok||!f.ok||!a.ok) return NextResponse.json({error:"Update history query failed"},{status:500});
    const fm=new Map((fundamentals||[]).map(x=>[x.ticker,x]));
    const am=new Map((analysis||[]).map(x=>[x.ticker,x]));
    const latestBy=new Map(),previousBy=new Map();
    for(const row of history||[]){
      if(!latestBy.has(row.ticker)) latestBy.set(row.ticker,row);
      else if(!previousBy.has(row.ticker)) previousBy.set(row.ticker,row);
    }
    const changes=[...latestBy.values()].map(x=>{
      const p=previousBy.get(x.ticker);
      const currentData={...(fm.get(x.ticker)||{}),...(am.get(x.ticker)||{})};
      const currentDecision=Object.keys(currentData).length?investmentDecision(currentData):null;
      if(!p)return {...x,current_score:currentDecision?.score??null,current_decision:currentDecision?.label??null,score_change:null,price_change_pct:null,reason:"New snapshot — ยังไม่มี snapshot ก่อนหน้าให้เปรียบเทียบ",comparison:"new_snapshot"};
      const sameModel=false;
      const scoreChange=sameModel&&x.overall_score!=null&&p.overall_score!=null?Number(x.overall_score)-Number(p.overall_score):null;
      const priceChange=x.price!=null&&p.price?((Number(x.price)/Number(p.price)-1)*100):null;
      const reasons=[];
      if(currentDecision?.blockedReasons?.length) reasons.push("ปัจจุบันมีข้อมูลที่ต้องตรวจสอบ");
      if(priceChange!=null&&Math.abs(priceChange)>=2) reasons.push(priceChange>0?"Price moved up":"Price moved down");
      if(x.buy_zone!==p.buy_zone) reasons.push((p.buy_zone||"—")+" → "+(x.buy_zone||"—"));
      if(x.forward_pe!=null&&p.forward_pe!=null&&Math.abs(Number(x.forward_pe)-Number(p.forward_pe))>=2) reasons.push("Forward P/E changed");
      if(x.peg!=null&&p.peg!=null&&Math.abs(Number(x.peg)-Number(p.peg))>=0.2) reasons.push("PEG changed");
      const comparison=currentDecision?"current score available; historical score not compared because snapshot model version is unknown":"insufficient current data";
      return {...x,current_score:currentDecision?.score??null,current_decision:currentDecision?.label??null,score_change:scoreChange,price_change_pct:priceChange,reason:reasons.length?reasons.join(" · "):"ไม่มีการเปลี่ยนแปลงที่ยืนยันได้",comparison,model_version:currentDecision?.modelVersion??null,current_data_quality:currentDecision?.dataQuality??null,current_confidence:currentDecision?.confidence??null,current_buy_ready:currentDecision?.buyReady??false,current:x,previous:p};
    }).sort((a,b)=>(Math.abs(Number(b.price_change_pct||0))-Math.abs(Number(a.price_change_pct||0))));
    return NextResponse.json({changes:changes.slice(0,12),lastUpdate:logs?.[0]||null,updatedAt:new Date().toISOString(),modelVersion:changes.find(x=>x.model_version)?.model_version||null});
  }catch(e){return NextResponse.json({error:e?.message||"Changes API failed"},{status:500})}
}
