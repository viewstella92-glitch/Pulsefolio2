import { NextResponse } from "next/server";

export const runtime="nodejs";

export async function GET(){
  try{
    const r=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{
      method:"POST",
      cache:"no-store"
    });
    const data=await r.json();
    const e=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/estimate-sync",{
      method:"POST",
      cache:"no-store"
    });
    const estimates=await e.json().catch(()=>({}));
    return NextResponse.json({...data,estimates},{status:r.ok&&e.ok?200:207});
  }catch(e){
    return NextResponse.json({error:e?.message||"Sync failed"},{status:500});
  }
}