'use strict';

// 이 점수는 통계적 허위광고 확률이 아닌 규칙 기반 '의심 신호 지수'입니다.
const rules = [
  {id:'absolute', title:'효과·결과의 절대적 보장', weight:20, patterns:[/100\s*%\s*(?:보장|효과|완치|성공|환불|확실)/gi,/(?:무조건|반드시|절대로|누구나|모든 사람|완벽하게|확실히).{0,24}(?:효과|성공|완치|개선|합격|수익|보장|해결)/gi,/(?:guaranteed|100% effective|works for everyone|never fails)/gi]},
  {id:'miracle', title:'비현실적인 효과·즉시 변화', weight:19, patterns:[/(?:단\s*)?\d+\s*(?:일|시간|분|주)\s*(?:만에|내에).{0,30}(?:완치|치료|제거|감량|살\s*빠|수익|합격|해결)/gi,/(?:즉시|하룻밤|단숨에|기적(?:의|처럼)?).{0,22}(?:개선|변화|효과|치료|완성|해결)/gi,/(?:miracle cure|overnight results|instant weight loss)/gi]},
  {id:'medical', title:'검증이 필요한 건강·의학적 단정', weight:17, patterns:[/(?:암|당뇨|치매|아토피|고혈압|탈모).{0,20}(?:완치|치료|낫는다|고친다|없앤다)/gi,/(?:부작용\s*(?:0|제로|없음|없이)|약\s*없이\s*완치|병원\s*갈\s*필요\s*없)/gi,/(?:cures cancer|no side effects|clinically proven to cure)/gi]},
  {id:'money', title:'수익·금전적 성과의 보장', weight:19, patterns:[/(?:원금|수익|투자금|월\s*수입|연\s*수익).{0,25}(?:보장|확정|무위험|안전)/gi,/(?:하루|매일|한\s*달|월).{0,20}\d[\d,]*(?:만|천)?\s*원.{0,18}(?:벌|수익|가능|보장)/gi,/(?:risk.free returns|guaranteed profit|double your money)/gi]},
  {id:'authority', title:'출처 확인이 필요한 권위·인증 주장', weight:12, patterns:[/(?:전문가|의사|교수|연구진|정부|식약처).{0,20}(?:인증|추천|보증|검증|인정)/gi,/(?:임상\s*시험|과학적으로\s*입증|특허\s*받은|공식\s*인증)/gi,/(?:doctor recommended|scientifically proven|government approved)/gi]},
  {id:'urgency', title:'과도한 긴급 구매 유도', weight:9, patterns:[/(?:지금|오늘|단\s*하루|곧).{0,18}(?:구매|마감|품절|종료|주문)/gi,/(?:마지막\s*기회|선착순\s*\d+\s*명|품절\s*임박|놓치면\s*후회)/gi,/(?:limited time only|act now|last chance)/gi]},
  {id:'price', title:'가격·혜택 관련 강한 표현', weight:9, patterns:[/(?:무조건\s*무료|완전\s*무료|평생\s*무료|추가\s*비용\s*0원)/gi,/(?:최저가\s*보장|전액\s*환불\s*보장|공짜로\s*드립니다)/gi,/(?:absolutely free|lowest price guaranteed)/gi]},
  {id:'superlative', title:'비교 근거가 필요한 최상급 주장', weight:9, patterns:[/(?:국내|세계|업계|대한민국)\s*(?:1\s*위|최고|유일|최초)/gi,/(?:유일무이|압도적\s*1\s*위|단연\s*최고|비교\s*불가)/gi,/(?:world.s best|number one in the world|only product that)/gi]},
];

function grade(score){
  if(score>=85)return '매우 확실';
  if(score>=70)return '확실';
  if(score>=55)return '보통';
  if(score>=35)return '불확실';
  return '매우 불확실';
}
function tidy(s){return String(s||'').replace(/\s+/g,' ').trim();}
function analyze(raw, meta={}){
  const text=tidy(raw).slice(0,55000);
  if(text.length<45) return {status:'unavailable',reason:'광고 문구가 너무 짧아 분석할 수 없습니다. 45자 이상의 실제 광고 문구를 입력해 주세요.'};
  let findings=[];
  for(const rule of rules){
    const examples=[];
    for(const pattern of rule.patterns){
      pattern.lastIndex=0;
      for(const match of text.matchAll(pattern)){
        const start=Math.max(0,match.index-35),end=Math.min(text.length,match.index+match[0].length+38);
        const excerpt=(start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
        if(!examples.includes(excerpt))examples.push(excerpt);
        if(examples.length>=2)break;
      }
      if(examples.length>=2)break;
    }
    if(examples.length)findings.push({id:rule.id,title:rule.title,weight:rule.weight,excerpts:examples});
  }
  // No external fact checking is performed. More distinct risk types => higher heuristic index.
  const total=findings.reduce((s,f)=>s+f.weight,0);
  const score=Math.min(100,Math.round(total*0.98));
  const meaningful=Math.min(text.length,3000);
  const warnings=[];
  if(meta.truncated)warnings.push('페이지 내용이 길어 일부만 분석했습니다.');
  if(meaningful<100)warnings.push('분석할 수 있는 문구가 적어 결과의 대표성이 낮을 수 있습니다.');
  warnings.push('실제 광고의 진실성·법적 위반 여부를 검증하지 않았습니다. 표현상의 의심 신호만 계산합니다.');
  return {status:'ok',score,grade:grade(score),method:'규칙 기반 의심 신호 지수 (통계적 확률 아님)',findings,warnings,scannedChars:text.length,summary:findings.length?`서로 다른 ${findings.length}개 유형의 주의 표현을 발견했습니다. 표시된 문구와 실제 제품 근거를 비교해 보세요.`:'설정된 과장 표현 패턴을 발견하지 못했습니다. 이는 광고가 사실이거나 안전하다는 뜻은 아닙니다.',source:meta.source||'직접 입력',title:meta.title||'광고 문구 분석',analyzedAt:new Date().toISOString()};
}
module.exports={analyze,grade};
