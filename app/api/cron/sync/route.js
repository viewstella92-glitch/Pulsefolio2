import { NextResponse } from "next/server";
export const runtime="nodejs";
export async function GET(req){
  const secret=process.env.CRON_SECRET;
  const auth=req.headers.get("authorization")||"";
  if(secret&&auth!=="Bearer "+secret)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const base=process.env.SUPABASE_FUNCTIONS_URL||"https://ailjqgahjjnlhlabooip.supabase.co/functions/v1";
    const headers=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}:{};
    const r=await fetch(base+"/pulse-sync",{method:"POST",headers,cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    const e=await fetch(base+"/estimate-sync",{method:"POST",headers,cache:"no-store"});
    const estimates=await e.json().catch(()=>({}));
    return NextResponse.json({...data,estimates},{status:r.ok&&e.ok?200:207});
  }catch(e){return NextResponse.json({error:e?.message||"Sync failed"},{status:500})}
}