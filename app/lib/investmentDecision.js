const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const n=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
function weighted(items){const v=items.filter(([,x])=>x!=null);const w=v.reduce((a,[,,z])=>a+z,0);return w?v.reduce((a,[,x,z])=>a+x*z,0)/w:null}
function profile(s){const t=((s.industry||"")+" "+(s.sector||"")).toLowerCase();if(/financial|bank|insurance|asset management/.test(t))return "Financials";if(/health|pharma|biotech|medical/.test(t))return "Healthcare";if(/semiconductor|chip|memory/.test(t))return "Semiconductor";if(/software|internet|technology|tech/.test(t))return "Technology";if(/retail|consumer|restaurant|automotive/.test(t))return "Consumer";return "General"}
export function investmentDecision(s){
const industry=profile(s),growthF=n(s.growth_next),growthH=n(s.growth_current),revenue=n(s.revenue_growth),margin=n(s.profit_margin),roe=n(s.roe),fcf=n(s.free_cash_flow),debtRaw=n(s.debt_to_equity),debt=debtRaw!=null&&debtRaw>=0?debtRaw:null,beta=n(s.beta),peF=n(s.forward_pe),peT=n(s.trailing_pe),pe=peF??peT,industryPe=n(s.industry_forward_pe),price=n(s.price),low=n(s.fair_value_low),base=n(s.fair_value_base),high=n(s.fair_value_high),revision=n(s.earnings_revision_score),news=n(s.news_score),peg=n(s.peg);
const growth=growthF??growthH,hasForwardGrowth=growthF!=null,hasForwardPE=peF!=null;
const growthScore=growth==null?null:clamp(50+growth*1.7),revenueScore=revenue==null?null:clamp(50+revenue*1.5),marginScore=margin==null?null:clamp(45+margin*1.7),roeScore=roe==null?null:clamp(50+roe*1.15),fcfScore=fcf==null?null:(fcf>0?78:18),debtScore=debt==null?null:(industry==="Financials"?62:clamp(92-debt*.30));
const quality=weighted([["revenue",revenueScore,.22],["margin",marginScore,.22],["roe",roeScore,.22],["fcf",fcfScore,.22],["debt",debtScore,.12]]),growthScoreFinal=weighted([["eps",growthScore,.65],["revenue",revenueScore,.35]]);
let valuation=null;
if(pe!=null&&pe>0&&growth!=null&&growth>0){const ratio=pe/growth;valuation=ratio<=.8?95:ratio<=1.1?88:ratio<=1.5?78:ratio<=2?65:ratio<=2.5?50:34}else if(peg!=null&&peg>0){valuation=peg<.8?92:peg<1.1?85:peg<1.5?76:peg<2?63:peg<2.5?50:34}else if(pe!=null&&pe>0){valuation=pe<15?80:pe<22?70:pe<30?60:pe<45?47:30}
if(valuation!=null&&industryPe!=null&&industryPe>0&&pe>0){const rel=pe/industryPe;valuation=clamp(valuation+(rel<.8?7:rel<1?-2:rel>1.5?-10:rel>1.2?-5:0))}
const fairUpside=price>0&&base>0?((base/price)-1)*100:null;
if(valuation!=null&&fairUpside!=null)valuation=clamp(valuation+(fairUpside>=25?10:fairUpside>=10?6:fairUpside<=-25?-12:fairUpside<0?-6:0));
const expectedReturn=fairUpside!=null?clamp(50+fairUpside*1.15):null,bearReturn=price>0&&low>0?((low/price)-1)*100:null,baseReturn=fairUpside,bullReturn=price>0&&high>0?((high/price)-1)*100:null;
let risk=beta==null?null:(beta<=.9?84:beta<=1.2?76:beta<=1.5?67:beta<=2?55:40);
if(risk!=null){if(growth!=null&&growth<0)risk-=18;if(revenue!=null&&revenue<0)risk-=14;if(margin!=null&&margin<0)risk-=20;if(fcf!=null&&fcf<0)risk-=15;if(debt!=null&&debt>150&&industry!=="Financials")risk-=12;risk=clamp(risk)}
const modifiers=weighted([["revision",revision==null?null:clamp(revision),.6],["news",news==null?null:clamp(news),.4]]),parts=[[quality,.20],[growthScoreFinal,.25],[valuation,.25],[expectedReturn,.20],[risk,.10]],valid=parts.filter(([,v])=>v!=null);
let score=valid.length?valid.reduce((a,[v])=>a+v,0)/valid.length:null;
const coverage=[growth,revenue,margin,roe,fcf,debt,pe,beta,base].filter(v=>v!=null).length/9;
const missingPenalty=(hasForwardGrowth?0:8)+(hasForwardPE?0:7)+(base!=null?0:7)+(beta!=null?0:4)+(coverage<.67?8:coverage<.78?4:0);
if(score!=null)score=clamp(score-missingPenalty);
const confidence=coverage>=.88&&hasForwardGrowth&&hasForwardPE&&beta!=null&&base!=null?"สูง":coverage>=.67?"กลาง":"ต่ำ";
let label=score==null?"ข้อมูลไม่ครบ":score>=82?"น่าลงทุนมาก":score>=70?"น่าลงทุน":score>=55?"รอจังหวะ":score>=42?"ความเสี่ยงสูง":"ควรหลีกเลี่ยง";
if(!hasForwardGrowth||!hasForwardPE||base==null||confidence==="ต่ำ")label=score!=null&&score>=70&&base!=null?"น่าลงทุน":"รอจังหวะ";
if(base==null&&score!=null&&score>=55)label="รอจังหวะ";
if(risk!=null&&risk<45)label="ควรหลีกเลี่ยง";
if(growth!=null&&growth<0&&revenue!=null&&revenue<0)label="ควรหลีกเลี่ยง";
if(fairUpside!=null&&fairUpside<-25)label="รอจังหวะ";
const warnings=[],positives=[];
if(!hasForwardGrowth)warnings.push("ยังไม่มี EPS Growth คาดการณ์ จึงลดความมั่นใจ");
if(!hasForwardPE)warnings.push("ยังไม่มี Forward P/E");
if(base==null)warnings.push("ยังไม่มี Fair Value Base ที่ตรวจสอบได้ จึงยังไม่ยืนยันจังหวะซื้อ");
if(low==null||high==null)warnings.push("ยังไม่มี Fair Value ครบ Bear/Bull จึงไม่สร้างราคาเป้าหมายขึ้นมาเอง");
if(beta==null)warnings.push("ยังไม่มี Beta ที่ยืนยันได้");
if(industryPe==null)warnings.push("ยังไม่มี P/E ของอุตสาหกรรมสำหรับเทียบ");
if(debtRaw!=null&&debtRaw<0)warnings.push("Debt/Equity ผิดปกติ จึงไม่นำมาคะแนน");
if(growth!=null&&growth>=15)positives.push("Growth แข็งแรง");
if(revenue!=null&&revenue>=10)positives.push("รายได้เติบโตดี");
if(roe!=null&&roe>=15)positives.push("ROE ดี");
if(fcf!=null&&fcf>0)positives.push("สร้าง Free Cash Flow");
if(fairUpside!=null&&fairUpside>=15)positives.push("ราคายังมี Upside จาก Fair Value Base");
if(revision!=null&&revision>=65)positives.push("ประมาณการ EPS มีแรงปรับขึ้น");
if(revision!=null&&revision<40)warnings.push("ประมาณการ EPS ถูกปรับลง");
const opportunity=score==null?null:clamp(score*.75+(expectedReturn!=null?expectedReturn*.25:0));
return {score,label,industry,business:quality,growth:growthScoreFinal,valuation,expectedReturn,risk,coverage,confidence,opportunity,fairUpside,bearReturn,baseReturn,bullReturn,revision,positives,warnings,growthBasis:hasForwardGrowth?"forecast":"historical",peBasis:hasForwardPE?"Forward P/E":"Trailing P/E",modifier:modifiers};
}
