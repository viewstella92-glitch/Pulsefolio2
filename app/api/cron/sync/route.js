import { NextResponse } from "next/server";

export const runtime="nodejs";

export async function GET(){
  try{
    const r=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{
      method:"POST",
      cache:"no-store"
    });
    const data=await r.json();
    return NextResponse.json(data,{status:r.status});
  }catch(e){
    return NextResponse.json({error:e?.message||"Sync failed"},{status:500});
  }
}