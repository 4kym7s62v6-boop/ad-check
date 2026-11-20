'use strict';
const $=id=>document.getElementById(id);
let mode='url',current=null;
function switchMode(to){mode=to;$('urlMode').hidden=to!=='url';$('textMode').hidden=to!=='text';$('urlTab').classList.toggle('active',to==='url');$('textTab').classList.toggle('active',to==='text');$('urlTab').setAttribute('aria-selected',to==='url');$('textTab').setAttribute('aria-selected',to==='text');$('error').hidden=true;}
$('urlTab').addEventListener('click',()=>switchMode('url'));
$('textTab').addEventListener('click',()=>switchMode('text'));
$('form').addEventListener('submit',async e=>{
  e.preventDefault();$('error').hidden=true;$('result').hidden=true;
  const data=mode==='url'?{mode,url:$('url').value.trim()}:{mode:'text',text:$('adtext').value.trim()};
  if(mode==='url'&&!/^https?:\/\//i.test(data.url))return showError('http:// 또는 https://로 시작하는 광고 링크를 입력해 주세요.');
  if(mode==='text'&&data.text.length<45)return showError('45자 이상의 광고 문구를 입력해 주세요.');
  $('loading').hidden=false;$('submitBtn').disabled=true;
  try{const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await res.json();if(!res.ok)throw Error(result.error||'분석에 실패했습니다.');if(result.status!=='ok')throw Error(result.reason||'분석할 수 없습니다.');current=result;render(result);}
  catch(err){showError(err.message+(mode==='url'?' 아래의 “문구로 분석” 탭에 광고 문구를 붙여넣어 다시 시도해 주세요.':''));}
  finally{$('loading').hidden=true;$('submitBtn').disabled=false;}
});
function showError(msg){$('error').textContent=msg;$('error').hidden=false;}
function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function render(r){$('result').hidden=false;$('score').textContent=r.score+'%';$('grade').textContent=r.grade;$('summary').textContent=r.summary;$('source').textContent=`출처: ${r.source} · ${new Date(r.analyzedAt).toLocaleString('ko-KR')}`;const accent=r.score>=85?'#ec7777':r.score>=70?'#ed9c69':r.score>=55?'#e9bf69':r.score>=35?'#9cb8e0':'#76cdb1';$('ring').style.setProperty('--percent',r.score);$('ring').style.setProperty('--accent',accent);
  const area=$('findings');area.replaceChildren();if(!r.findings.length)area.append(el('p','muted','설정된 의심 표현이 발견되지 않았습니다. 실제 광고 내용과 별도로 사실 확인이 필요합니다.'));
  for(const f of r.findings){const box=el('div','finding');box.append(el('h4','',f.title));for(const quote of f.excerpts)box.append(el('p','quote',quote));area.append(box);}
  const warningArea=$('warnings');warningArea.replaceChildren();for(const warning of r.warnings)warningArea.append(el('p','warning',warning));$('previewBox').hidden=!r.preview;$('preview').textContent=r.preview||'';$('result').scrollIntoView({behavior:'smooth',block:'start'});
}
function getHistory(){try{return JSON.parse(localStorage.getItem('adcheck-history')||'[]');}catch{return [];}}
function setHistory(items){try{localStorage.setItem('adcheck-history',JSON.stringify(items));}catch{showError('브라우저 저장 공간이 부족하여 기록을 저장하지 못했습니다.');}}
$('saveBtn').addEventListener('click',()=>{if(!current)return;const records=getHistory();records.unshift({...current,id:Date.now()});setHistory(records.slice(0,20));renderHistory();$('saveBtn').textContent='✓ 저장 완료';setTimeout(()=>$('saveBtn').textContent='기록 저장',1400);});
$('clearBtn').addEventListener('click',()=>{if(confirm('모든 분석 기록을 삭제할까요?')){setHistory([]);renderHistory();}});
function renderHistory(){const box=$('history');box.replaceChildren();const items=getHistory();if(!items.length){box.append(el('p','muted','아직 저장한 기록이 없어요.'));return;}
 for(const item of items){const row=el('div','history-row');const left=el('div');left.append(el('div','history-title',item.title||'광고 분석'));left.append(el('div','history-meta',new Date(item.analyzedAt).toLocaleString('ko-KR')+' · '+item.source));const right=el('div','history-actions');right.append(el('strong','',item.score+'% · '+item.grade));const open=el('button','','보기');open.addEventListener('click',()=>{current=item;render(item);});const del=el('button','','삭제');del.addEventListener('click',()=>{setHistory(getHistory().filter(x=>x.id!==item.id));renderHistory();});right.append(open,del);row.append(left,right);box.append(row);}
}
renderHistory();
