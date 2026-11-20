'use strict';
const http=require('node:http');
const dns=require('node:dns').promises;
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const {analyze}=require('./analyzer');
const ROOT=path.join(__dirname,'public');
const PORT=Number(process.env.PORT)||3000;
const MAX_BODY=120000;
const MAX_HTML=1000000;
function send(res,status,body,ct='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':ct,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(typeof body==='string'?body:JSON.stringify(body));
}
function readJson(req){return new Promise((resolve,reject)=>{
  let size=0,chunks=[];
  req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(new Error('요청 용량을 초과했습니다.'));req.destroy();return;}chunks.push(c);});
  req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('잘못된 요청입니다.'));}});
  req.on('error',reject);
});}
function isForbiddenIp(ip){
  if(!ip)return true;
  if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0||p[0]===198&&(p[1]===18||p[1]===19)||p[0]===192&&p[1]===0&&p[2]===2||p[0]===198&&p[1]===51&&p[2]===100||p[0]===203&&p[1]===0&&p[2]===113||p[0]===255;}
  const lower=ip.toLowerCase();
  if(lower.startsWith('::ffff:')){const mapped=lower.slice(7); if(net.isIP(mapped)===4)return isForbiddenIp(mapped);}
  return lower==='::'||lower==='::1'||lower.startsWith('fc')||lower.startsWith('fd')||lower.startsWith('fe8')||lower.startsWith('fe9')||lower.startsWith('fea')||lower.startsWith('feb')||lower.startsWith('ff')||lower.startsWith('2001:db8:');
}
async function validateUrl(raw){
  let u;try{u=new URL(raw);}catch{throw new Error('올바른 http 또는 https URL을 입력해 주세요.');}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&& !['80','443'].includes(u.port))throw new Error('일반 HTTP/HTTPS 웹 주소만 지원합니다.');
  if(u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))throw new Error('내부 네트워크 주소는 분석할 수 없습니다.');
  const addresses=await dns.lookup(u.hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(x=>isForbiddenIp(x.address)))throw new Error('보안상 접근할 수 없는 주소입니다.');
  return u;
}
function decodeEntities(s){return s.replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(Math.min(parseInt(n,16),0x10ffff)));}
function textFromHtml(html){
  const title=decodeEntities((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/\s+/g,' ').trim().slice(0,140);
  const desc=decodeEntities((html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)||html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)||[])[1]||'');
  const cleaned=html.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style|svg|noscript|template|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<\/(?:p|h[1-6]|div|li|article|section|br|tr)>/gi,'\n').replace(/<[^>]*>/g,' ');
  const body=decodeEntities(cleaned).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  return {text:[title,desc,body].filter(Boolean).join('\n').slice(0,55000),title};
}
async function fetchAd(raw){
  let next=raw;
  for(let i=0;i<4;i++){
    const u=await validateUrl(next);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    let response;
    try{response=await fetch(u.href,{signal:controller.signal,redirect:'manual',headers:{'User-Agent':'AdCheckEducationalBot/1.0 (+ad-analysis; no personal data)','Accept':'text/html, text/plain;q=0.9'}});}catch(e){clearTimeout(timer);throw new Error(e.name==='AbortError'?'링크 응답 시간이 초과되었습니다.':'광고 페이지에 연결하지 못했습니다. 접근이 제한되었을 수 있습니다.');}
    if([301,302,303,307,308].includes(response.status)){
      clearTimeout(timer);const loc=response.headers.get('location');await response.body?.cancel();if(!loc)throw new Error('잘못된 이동 주소입니다.');next=new URL(loc,u.href).href;continue;
    }
    if(!response.ok){clearTimeout(timer);await response.body?.cancel();throw new Error(`광고 페이지 응답 오류 (${response.status}). 로그인이나 접근 제한이 있을 수 있습니다.`);}
    const type=response.headers.get('content-type')||'';
    if(!/text\/html|text\/plain/i.test(type)){clearTimeout(timer);await response.body?.cancel();throw new Error('HTML 또는 일반 텍스트 광고 페이지만 지원합니다.');}
    const reader=response.body.getReader();let size=0,chunks=[];let truncated=false;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_HTML){truncated=true;chunks.push(value.slice(0,Math.max(0,MAX_HTML-(size-value.length))));await reader.cancel();break;}chunks.push(value);}}finally{clearTimeout(timer);}
    const bytes=Buffer.concat(chunks);
    let encoding=/charset\s*=\s*([a-z0-9_-]+)/i.exec(type)?.[1]||'utf-8';
    let html;try{html=new TextDecoder(encoding).decode(bytes);}catch{html=new TextDecoder().decode(bytes);}
    const data=type.includes('text/plain')?{text:html,title:''}:textFromHtml(html);
    if(data.text.length<45)throw new Error('페이지에서 분석할 광고 문구를 충분히 추출하지 못했습니다. 광고 문구를 직접 입력해 주세요.');
    return {...data,truncated,source:u.origin+u.pathname};
  }
  throw new Error('페이지 이동 횟수가 너무 많아 분석을 중단했습니다.');
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='POST'&&req.url==='/api/analyze'){
      const data=await readJson(req);
      if(data.mode==='text'){
        if(typeof data.text!=='string')return send(res,400,{error:'광고 문구를 입력해 주세요.'});
        return send(res,200,analyze(data.text,{source:'직접 입력',title:'직접 입력한 광고'}));
      }
      if(data.mode==='url'){
        if(typeof data.url!=='string'||data.url.length>2000)return send(res,400,{error:'광고 URL을 확인해 주세요.'});
        const ad=await fetchAd(data.url);
        return send(res,200,{...analyze(ad.text,{title:ad.title||'웹 광고 분석',source:ad.source,truncated:ad.truncated}),preview:ad.text.slice(0,1100)});
      }
      return send(res,400,{error:'분석 방식을 선택해 주세요.'});
    }
    if(req.method!=='GET')return send(res,405,{error:'허용되지 않은 요청입니다.'});
    const url=new URL(req.url,'http://localhost');
    const wanted=url.pathname==='/'?'/index.html':url.pathname;
    const file=path.resolve(ROOT,'.'+wanted);
    if(!file.startsWith(ROOT+path.sep))return send(res,403,{error:'접근할 수 없습니다.'});
    const ext=path.extname(file);if(!mime[ext])return send(res,404,{error:'찾을 수 없습니다.'});
    fs.readFile(file,(err,content)=>err?send(res,404,{error:'찾을 수 없습니다.'}):send(res,200,content,mime[ext]));
  }catch(e){if(!res.headersSent)send(res,400,{error:e.message||'처리 중 오류가 발생했습니다.'});}
});
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`AdCheck running on http://localhost:${PORT}`));
module.exports={server,validateUrl,textFromHtml};
