'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {analyze,grade}=require('./analyzer');const {validateUrl,textFromHtml}=require('./server');
test('등급 경계',()=>{assert.equal(grade(85),'매우 확실');assert.equal(grade(84),'확실');assert.equal(grade(70),'확실');assert.equal(grade(69),'보통');assert.equal(grade(55),'보통');assert.equal(grade(54),'불확실');assert.equal(grade(35),'불확실');assert.equal(grade(34),'매우 불확실');});
test('짧은 텍스트 판정 불가',()=>assert.equal(analyze('안녕하세요').status,'unavailable'));
test('강한 표현 탐지',()=>{const r=analyze('누구나 반드시 효과 보장! 단 3일 만에 완치 가능합니다. 전문가 추천, 세계 1위의 특별한 상품입니다. 지금 구매 마감!');assert.equal(r.status,'ok');assert.ok(r.score>20);assert.ok(r.findings.length>=2);});
test('HTML 본문 추출',()=>{const r=textFromHtml('<title>광고</title><script>가짜 광고</script><p>실제 광고 문구입니다.</p>');assert.ok(r.text.includes('실제 광고'));assert.ok(!r.text.includes('가짜 광고'));});
test('내부 주소 차단',async()=>{await assert.rejects(validateUrl('http://127.0.0.1/'));await assert.rejects(validateUrl('http://localhost/'));});
