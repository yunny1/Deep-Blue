export interface SubseaCostInputs { routeLengthKm:number; designCapacityTbps?:number; cableCostDeepPerKm?:number; shoreEndKmEachSide?:number; shoreMultiplier?:number; repeaterSpacingKm?:number; repeaterUnitCost?:number; shipDayRateUsd?:number; layRateDeepKmPerDay?:number; layRateShoreKmPerDay?:number; delayFactor?:number; mobilizationFixedUsd?:number; landingStations?:number; landingStationCostUsd?:number; jurisdictions?:number; permitPerJurisdictionUsd?:number; surveyFixedUsd?:number; pmInsurancePct?:number; contingencyPct?:number; riskPremiumPct?:number; }
export interface CostBreakdown { cable:number; repeaters:number; marine:number; landingStations:number; permits:number; survey:number; pmInsurance:number; contingency:number; riskPremium:number; }
export interface SubseaCostOutput { capexTotalUsd:number; repeaterCount:number; breakdown:CostBreakdown; unitMetrics:{usdPerKm:number|null;usdPerTbps:number|null}; scenarios:{low:number;base:number;high:number}; opex:{fixedOpexPerYear:number;expectedRepairPerYear:number;totalOpexPerYear:number}; params:{routeLengthKm:number;shoreKm:number;deepKm:number;repeaterSpacingKm:number;landingStations:number;jurisdictions:number;contingencyPct:number;riskPremiumPct:number}; }
export const INDUSTRY_BENCHMARKS = {
  cablePerKm:{min:6000,max:20000,unit:'USD/km',source:'TeleGeography'},
  repeaterSpacing:{min:60,max:80,unit:'km',source:'TeleGeography'},
  repeaterCost:{value:200000,unit:'USD',source:'TeleGeography'},
  totalCapexPerKm:{min:20000,max:40000,unit:'USD/km',source:'World Bank / TRAI'},
  shipDayRate:{value:150000,unit:'USD/day',source:'Briglauer et al.'},
  layRate:{min:100,max:150,unit:'km/day',source:'JRC'},
  landingStation:{min:5000000,max:25000000,unit:'USD',source:'TeleGeography'},
  contingency:{value:7,unit:'%',source:'World Bank'},
  opexPct:{max:6,unit:'% CAPEX/yr',source:'Salience Consulting'},
  repairCost:{min:1000000,max:3000000,unit:'USD/event',source:'ICPC'},
  globalFaults:{min:150,max:200,unit:'events/yr',source:'ITU'},
};
export const SENSITIVITY_ITEMS = [
  {param:'cableCostDeepPerKm',label:'Cable body $/km',labelZh:'电缆本体 $/km',pctChange:20,capexImpact:11,source:'TeleGeography'},
  {param:'landingStationCostUsd',label:'Landing station',labelZh:'登陆站',pctChange:33,capexImpact:5.6,source:'TeleGeography'},
  {param:'riskPremiumPct',label:'Risk premium',labelZh:'风险溢价',pctChange:100,capexImpact:4.5,source:'NDB / OECD'},
  {param:'contingencyPct',label:'Contingency',labelZh:'预备费',pctChange:50,capexImpact:3.3,source:'World Bank'},
  {param:'repeaterSpacingKm',label:'Repeater spacing',labelZh:'中继器间距',pctChange:15,capexImpact:2.5,source:'TeleGeography'},
  {param:'shipDayRateUsd',label:'Ship day rate',labelZh:'船日费',pctChange:20,capexImpact:1.3,source:'Briglauer et al.'},
];
export function estimateSubseaCapex(input:SubseaCostInputs):SubseaCostOutput{
  const L=input.routeLengthKm;const cDeep=input.cableCostDeepPerKm??15000;const shoreEach=input.shoreEndKmEachSide??50;const shoreMul=input.shoreMultiplier??2.0;
  const repSpace=input.repeaterSpacingKm??70;const repCost=input.repeaterUnitCost??200000;const shipRate=input.shipDayRateUsd??150000;
  const layDeep=input.layRateDeepKmPerDay??120;const layShore=input.layRateShoreKmPerDay??30;const delay=input.delayFactor??1.3;const mobil=input.mobilizationFixedUsd??5000000;
  const nLS=input.landingStations??2;const lsCost=input.landingStationCostUsd??15000000;const nJur=input.jurisdictions??2;const permCost=input.permitPerJurisdictionUsd??2000000;
  const survey=input.surveyFixedUsd??5000000;const pmPct=input.pmInsurancePct??0.05;const contPct=input.contingencyPct??0.07;const riskPct=input.riskPremiumPct??0.10;
  const Lshore=Math.min(L,2*shoreEach);const Ldeep=Math.max(0,L-Lshore);
  const cCable=Ldeep*cDeep+Lshore*cDeep*shoreMul;const nRep=Math.max(0,Math.ceil(L/repSpace)-1);const cRep=nRep*repCost;
  const daysDeep=layDeep>0?Ldeep/layDeep:0;const daysShore=layShore>0?Lshore/layShore:0;const cMarine=(daysDeep+daysShore)*shipRate*delay+mobil;
  const cLS=nLS*lsCost;const cPerm=nJur*permCost;const subtotal=cCable+cRep+cMarine+cLS+cPerm+survey;
  const cPM=subtotal*pmPct;const sub2=subtotal+cPM;const cCont=sub2*contPct;const sub3=sub2+cCont;const cRisk=sub3*riskPct;const total=sub3+cRisk;
  const fixedOpex=total*0.03;const expectedRepairs=L*(175/1500000)*2000000;const D=input.designCapacityTbps??0;
  return{capexTotalUsd:total,repeaterCount:nRep,breakdown:{cable:cCable,repeaters:cRep,marine:cMarine,landingStations:cLS,permits:cPerm,survey,pmInsurance:cPM,contingency:cCont,riskPremium:cRisk},
    unitMetrics:{usdPerKm:L>0?total/L:null,usdPerTbps:D>0?total/D:null},scenarios:{low:Math.round(total*0.75),base:Math.round(total),high:Math.round(total*1.35)},
    opex:{fixedOpexPerYear:Math.round(fixedOpex),expectedRepairPerYear:Math.round(expectedRepairs),totalOpexPerYear:Math.round(fixedOpex+expectedRepairs)},
    params:{routeLengthKm:L,shoreKm:Lshore,deepKm:Ldeep,repeaterSpacingKm:repSpace,landingStations:nLS,jurisdictions:nJur,contingencyPct:contPct*100,riskPremiumPct:riskPct*100}};
}
export function formatUsd(usd:number):string{if(usd>=1e9)return`$${(usd/1e9).toFixed(1)}B`;if(usd>=1e6)return`$${(usd/1e6).toFixed(0)}M`;return`$${(usd/1e3).toFixed(0)}K`;}
