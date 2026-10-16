import { AppError,validateInput,string,LIMITS,LEVELS } from './contract.mjs';
import { validateResult,validateSchema,termSchema,explanationSchema,sourcesFor } from './schema.mjs';
import { MODEL,comparisonBody,explanationBody } from './prompt.mjs';

export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Cache-Control':'no-store','X-Frame-Options':'DENY'
};
function json(value,status=200,extra={}) { return new Response(JSON.stringify(value),{status,headers:{...SECURITY_HEADERS,'Content-Type':'application/json; charset=utf-8',...extra}}); }
export async function readLimited(request,maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new AppError('INPUT_TOO_LARGE','자료가 너무 큽니다. 이미지와 텍스트를 줄여 주세요.',413);
  const reader = request.body?.getReader(); if(!reader) throw new AppError('INPUT_INVALID','자료가 비어 있습니다.');
  const chunks=[]; let size=0;
  try {
    while(true) { const {value,done} = await reader.read(); if(done) break; size += value.byteLength; if(size>maxBytes) { await reader.cancel(); throw new AppError('INPUT_TOO_LARGE','자료가 너무 큽니다. 이미지와 텍스트를 줄여 주세요.',413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const data=new Uint8Array(size); let offset=0; for(const c of chunks) { data.set(c,offset); offset += c.length; }
  try { return new TextDecoder('utf-8',{fatal:true}).decode(data); } catch { throw new AppError('INPUT_INVALID','자료의 문자 형식을 확인해 주세요.'); }
}
export function createGuard(now=()=>Date.now()) {
  let minute=0, minuteCount=0, day=0, dayCount=0, busy=false, stoppedUntil=0;
  return {
    enter() {
      const time=now();
      if(time<stoppedUntil) throw new AppError('FREE_QUOTA','AI 무료 사용량 제한으로 요청이 중단되었습니다. 계정 한도를 확인한 뒤 나중에 다시 이용해 주세요.',429,Math.ceil((stoppedUntil-time)/1000));
      if(busy) throw new AppError('REQUEST_BUSY','분석 요청을 처리 중입니다. 완료 후 다시 이용해 주세요.',429,10);
      const m=Math.floor(time/60000), d=Math.floor(time/86400000);
      if(m!==minute) {minute=m;minuteCount=0;} if(d!==day) {day=d;dayCount=0;}
      if(minuteCount>=3 || dayCount>=30) throw new AppError('APP_RATE_LIMIT','앱의 요청 제한에 도달했습니다. 잠시 후 또는 다음 날 다시 이용해 주세요.',429,dayCount>=30 ? Math.ceil(((d+1)*86400000-time)/1000) : 60);
      minuteCount++;dayCount++;busy=true;
    },
    leave(){busy=false;},
    stop(){stoppedUntil=now()+3600000;}
  };
}
async function constantEqual(a,b) {
  const encode=new TextEncoder(); const [x,y] = await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(a)),crypto.subtle.digest('SHA-256',encode.encode(b))]);
  const xx=new Uint8Array(x), yy=new Uint8Array(y); let mismatch=0; for(let i=0;i<xx.length;i++) mismatch |= xx[i]^yy[i]; return mismatch===0;
}
export function ready(env) { return !!env.GEMINI_API_KEY && typeof env.ACCESS_PASSWORD==='string' && env.ACCESS_PASSWORD.length>=16 && env.FREE_TIER_CONFIRMED==='true'; }
export function createApi({fetchImpl=(...args)=>fetch(...args),timeoutMs=60000,now=()=>Date.now()}={}) {
  const guard=createGuard(now);
  // Bounded, isolate-local attempt gate; no IP addresses, documents or passwords are stored.
  let authMinute=0, authAttempts=0;
  async function callAI(body,env) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY.trim()},body:JSON.stringify(body),signal:controller.signal,redirect:'manual'});
      // Do not forward the API key to any redirect target. Use manual mode for
      // compatibility with the deployed Worker runtime as well as local Node.
      if(response.status>=300 && response.status<400) throw new AppError('AI_REDIRECT','AI 접속 주소가 예상과 달라 요청을 중단했습니다. 운영자가 연결 주소를 확인해야 합니다.',502);
      if(!response.ok) {
        if(response.status===429) {guard.stop();throw new AppError('FREE_QUOTA','AI 무료 사용량 제한에 도달했습니다. 자동 재시도 없이 요청을 중단했습니다.',429,3600);}
        if(response.status===401 || response.status===403) throw new AppError('API_KEY_ERROR','서버의 API 키 또는 프로젝트 권한을 확인해야 합니다.',503);
        if(response.status===404) throw new AppError('MODEL_UNAVAILABLE','설정된 무료 모델을 사용할 수 없습니다. 운영자가 모델 지원 여부를 확인해야 합니다.',503);
        if(response.status===503) throw new AppError('AI_BUSY','Gemini 서버가 혼잡해 지금은 분석할 수 없습니다. 잠시 후 직접 다시 시도해 주세요. 자동 재시도나 다른 모델 전환은 하지 않았습니다.',503);
        if(response.status===400) throw new AppError('AI_REQUEST_INVALID','Gemini가 요청을 거절했습니다. 운영자가 요청 형식과 API 키 설정을 확인해야 합니다. 서버 혼잡으로 확인된 오류는 아닙니다.',502);
        throw new AppError('AI_UNAVAILABLE','AI 서비스 오류가 발생했습니다. 요청은 자동 재시도하지 않습니다.',502);
      }
      let data;
      try { data=JSON.parse(await readLimited(response,256*1024)); } catch(e) {if(controller.signal.aborted) throw e; throw new AppError('AI_INVALID','AI 응답을 읽지 못했습니다. 결과를 표시하지 않았습니다.',502);}
      const candidate=data.candidates?.[0];
      if(!candidate || candidate.finishReason!=='STOP') throw new AppError('AI_INCOMPLETE','AI가 답변을 완료하지 못했거나 자료를 처리하지 못했습니다. 자료를 줄이거나 텍스트로 보충해 주세요.',502);
      const text=candidate.content?.parts?.filter(p=>typeof p.text==='string' && p.thought!==true).map(p=>p.text).join('');
      if(!text) throw new AppError('AI_INVALID','AI가 분석 결과를 반환하지 않았습니다.',502);
      try {return JSON.parse(text);} catch {throw new AppError('AI_INVALID','AI가 올바른 JSON 결과를 반환하지 않았습니다.',502);}
    } catch(e) {
      if(e instanceof AppError) throw e;
      if(controller.signal.aborted) throw new AppError('AI_TIMEOUT','AI 응답 시간이 초과되었습니다. 자동 재시도하지 않았습니다.',504);
      throw new AppError('AI_NETWORK','AI 서비스에 연결하지 못했습니다. 자동 재시도하지 않았습니다.',502);
    } finally {clearTimeout(timer);}
  }
  return async function api(request,env) {
    const url=new URL(request.url);
    try {
      if(url.pathname==='/api/status' && request.method==='GET') return json({ready:ready(env),model:MODEL,mode:'real-api-only',limits:{perMinute:3,perDay:30,scope:'서버 인스턴스별 제한. 전체 계정 잔여량이 아닙니다.'}});
      if(!['/api/compare','/api/explain'].includes(url.pathname)) return json({error:{code:'NOT_FOUND',message:'요청한 경로가 없습니다.'}},404);
      if(request.method!=='POST') return json({error:{code:'METHOD',message:'POST 요청만 허용됩니다.'}},405,{'Allow':'POST'});
      if(url.protocol!=='https:' && !(env.LOCAL_DEV==='true' && ['127.0.0.1','localhost'].includes(url.hostname))) throw new AppError('HTTPS_REQUIRED','보안 연결에서만 이용할 수 있습니다.',403);
      if(request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site') throw new AppError('ORIGIN','이 사이트에서 직접 요청해 주세요.',403);
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AppError('INPUT_INVALID','JSON 요청만 허용됩니다.',415);
      if(!ready(env)) throw new AppError('SETUP_REQUIRED','아직 AI 연결 전입니다. 운영자가 무료 계정과 서버 비밀 환경변수를 설정해야 합니다.',503);
      const minute=Math.floor(now()/60000); if(minute!==authMinute) {authMinute=minute;authAttempts=0;}
      if(++authAttempts>20) throw new AppError('AUTH_RATE_LIMIT','이용 확인 요청이 많습니다. 1분 후 다시 시도해 주세요.',429,60);
      const auth=request.headers.get('authorization') || '';
      if(auth.length>600 || !await constantEqual(auth,`Bearer ${env.ACCESS_PASSWORD}`)) throw new AppError('ACCESS_DENIED','사이트 이용 암호를 확인해 주세요. Gemini API 키를 입력하는 칸이 아닙니다.',401);
      let raw; try { raw=JSON.parse(await readLimited(request,url.pathname==='/api/compare'?LIMITS.requestBytes:16000)); } catch(e) {if(e instanceof AppError) throw e; throw new AppError('INPUT_INVALID','올바른 JSON 자료가 아닙니다.');}
      let input,body;
      if(url.pathname==='/api/compare') {input=validateInput(raw);body=comparisonBody(input);}
      else {
        if(!raw || typeof raw!=='object' || raw.consent!==true || !LEVELS.includes(raw.level)) throw new AppError('INPUT_INVALID','질문 입력과 전송 동의를 확인해 주세요.');
        validateSchema(raw.term,termSchema);
        input={term:raw.term,question:string(raw.question,500,'추가 질문'),level:raw.level};body=explanationBody(input);
      }
      guard.enter();
      try {
        const result=await callAI(body,env);
        if(url.pathname==='/api/compare') return json({result:validateResult(result,input),sources:sourcesFor(input),meta:{model:MODEL,web_search:false}});
        return json({result:validateSchema(result,explanationSchema),meta:{model:MODEL,web_search:false}});
      } finally {guard.leave();}
    } catch(e) {
      const error=e instanceof AppError ? e : new AppError('SERVER_ERROR','요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',500);
      return json({error:{code:error.code,message:error.message,retry_after:error.retryAfter} },error.status,error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});
    }
  };
}
