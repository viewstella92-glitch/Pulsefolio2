export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return Response.json({error:"Supabase environment variables are missing"},{status:500});
  try{
    const r=await fetch(url+"/rest/v1/pulsefolio_state?id=eq.1&select=id,watchlist,portfolio,updated_at",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    const rows=await r.json().catch(()=>[]);
    if(!r.ok)return Response.json({error:"โหลดข้อมูลพอร์ตไม่สำเร็จ"},{status:500});
    const row=rows?.[0]||{watchlist:[],portfolio:{}};
    return Response.json({state:{watchlist:Array.isArray(row.watchlist)?row.watchlist:[],portfolio:row.portfolio&&typeof row.portfolio==="object"?row.portfolio:{},updated_at:row.updated_at||null}});
  }catch(e){return Response.json({error:e?.message||"State API failed"},{status:500})}
}

function normalize(body){
  const watchlist=Array.isArray(body?.watchlist)
    ? [...new Set(body.watchlist.map(x=>String(x).trim().toUpperCase()).filter(x=>/^[A-Z.\-]{1,10}$/.test(x)))]
    : [];
  const portfolio={};
  if(body?.portfolio&&typeof body.portfolio==="object"&&!Array.isArray(body.portfolio)){
    for(const [ticker,p] of Object.entries(body.portfolio)){
      const t=String(ticker).trim().toUpperCase(),qty=Number(p?.qty),avg=Number(p?.avg);
      if(/^[A-Z.\-]{1,10}$/.test(t)&&Number.isFinite(qty)&&qty>0&&Number.isFinite(avg)&&avg>0)portfolio[t]={qty,avg};
    }
  }
  return {watchlist,portfolio};
}

export async function PUT(req){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return Response.json({error:"Supabase environment variables are missing"},{status:500});
  try{
    const body=await req.json().catch(()=>({})),state=normalize(body);
    const r=await fetch(url+"/rest/v1/pulsefolio_state?on_conflict=id",{
      method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify({id:1,watchlist:state.watchlist,portfolio:state.portfolio,updated_at:new Date().toISOString()})
    });
    const data=await r.json().catch(()=>[]);
    if(!r.ok)return Response.json({error:"บันทึกข้อมูลพอร์ตไม่สำเร็จ",detail:data},{status:500});
    return Response.json({ok:true,state:{...state,updated_at:data?.[0]?.updated_at||new Date().toISOString()}});
  }catch(e){return Response.json({error:e?.message||"State API failed"},{status:500})}
}