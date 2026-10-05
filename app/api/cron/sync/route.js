import { NextResponse } from "next/server";

export const runtime="nodejs";

export async function GET(req){
  const secret=process.env.CRON_SECRET;
  const auth=req.headers.get("authorization")||"";
  if(!secret || auth !== "Bearer "+secret) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const r=await fetch("https://ailjqgahjjnlhlabooip.supabase.co/functions/v1/pulse-sync",{
      method:"POST",
      headers:{"x-pulse-sync-secret":secret},
      cache:"no-store"
    });
    const data=await r.json();
    return NextResponse.json(data,{status:r.status});
  }catch(e){
    return NextResponse.json({error:e?.message||"Sync failed"},{status:500});
  }
}