const UA=process.env.SEC_USER_AGENT||"Pulsefolio/1.0 contact@example.com";
const n=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
const pickLatest=(facts,keys)=>{for(const key of keys){const arr=facts?.[key]?.units?.USD||facts?.[key]?.units?.shares||facts?.[key]?.units?.USD_SHARES||facts?.[key]?.units?.["USD/shares"]||facts?.[key]?.units?.["USD/shares"]||[];if(!arr.length)continue;const a=arr.filter(x=>x.form==="10-K"||x.form==="10-Q"||x.form==="20-F"||x.form==="40-F").sort((a,b)=>String(b.end).localeCompare(String(a.end)));if(a.length)return {value:n(a[0].val),asOf:a[0].end}}return null};
const yahoo=async ticker=>{try{const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?range=5d&interval=1d",{headers:{"User-Agent":"Mozilla/5.0"},cache:"no-store",signal:AbortSignal.timeout(8000)});const m=(await r.json())?.chart?.result?.[0]?.meta;if(!r.ok||!m)return null;return {price:n(m.regularMarketPrice),currency:m.currency||"USD",asOf:new Date((m.regularMarketTime||Date.now()/1000)*1000).toISOString()}}catch{return null}};
export async function getVerified(ticker){
ticker=String(ticker||"").trim().toUpperCase();
if(!ticker)return {ok:false,reason:"ไม่มี ticker"};
try{
const sr=await fetch("https://www.sec.gov/files/company_tickers.json",{headers:{"User-Agent":UA},cache:"no-store",signal:AbortSignal.timeout(10000)});
if(!sr.ok)return {ok:false,ticker,reason:"SEC company ticker lookup failed"};
const companies=await sr.json();const item=Object.values(companies).find(x=>String(x.ticker||"").toUpperCase()===ticker);
if(!item)return {ok:false,ticker,reason:"ไม่พบ ticker ใน SEC"};
const cik=String(item.cik_str).padStart(10,"0");
const fr=await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json",{headers:{"User-Agent":UA},cache:"no-store",signal:AbortSignal.timeout(12000)});
if(!fr.ok)return {ok:false,ticker,reason:"SEC companyfacts unavailable"};
const data=await fr.json(),facts=data.facts?.["us-gaap"]||{},price=await yahoo(ticker);
const revenue=pickLatest(facts,["Revenues","RevenueFromContractWithCustomerExcludingAssessedTax","SalesRevenueNet"]);
const netIncome=pickLatest(facts,["NetIncomeLoss"]);
const eps=pickLatest(facts,["EarningsPerShareDiluted"]);
const fcfA=pickLatest(facts,["NetCashProvidedByUsedInOperatingActivities"]);
const capex=pickLatest(facts,["PaymentsToAcquirePropertyPlantAndEquipment"]);
const fcf=fcfA&&capex?{value:fcfA.value-Math.abs(capex.value),asOf:fcfA.asOf}:null;
const shares=pickLatest(facts,["EntityCommonStockSharesOutstanding"]);
const marketCap=price?.price&&shares?.value?{value:price.price*shares.value,asOf:price.asOf}:null;
const pe=price?.price&&eps?.value&&eps.value>0?price.price/eps.value:null;
const fcfYield=marketCap?.value&&fcf?.value!=null?(fcf.value/marketCap.value)*100:null;
return {ok:true,ticker,name:data.entityName||ticker,price:price?.price??null,metrics:{revenueTtm:revenue,netIncomeTtm:netIncome,epsDilutedTtm:eps,freeCashFlowTtm:fcf},valuation:{trailingPE:pe,fcfYield:fcfYield},derived:{marketCap:marketCap,fcfYield:fcfYield},trust:{level:"high",sources:["SEC EDGAR Company Facts",price?"Yahoo Finance price":"SEC"],warnings:price?[]:["ไม่มีราคาตลาดจาก Yahoo"]}};
}catch(e){return {ok:false,ticker,reason:e?.message||"verified data failed"}}
}