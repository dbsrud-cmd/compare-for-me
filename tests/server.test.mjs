import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApi,createGuard,readLimited} from '../server.mjs';
import {input,result,term} from './fixtures.mjs';
const env={GEMINI_API_KEY:'test-only-never-a-real-key',ACCESS_PASSWORD:'test-only-access-password',FREE_TIER_CONFIRMED:'true'};
const req=(payload=input(),headers={})=>new Request('https://example.test/api/compare',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.test','Authorization':`Bearer ${env.ACCESS_PASSWORD}`,...headers},body:JSON.stringify(payload)});
const upstream=(value=result())=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]}));
test('successful compare only calls Gemini once; returns validated sources, never key',async()=>{
  let calls=0;const api=createApi({fetchImpl:async(url,options)=>{calls++;assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:'));assert.equal(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);return upstream();}});
  const response=await api(req(),env);assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes(env.GEMINI_API_KEY));assert.ok(!text.includes(env.ACCESS_PASSWORD));assert.equal(JSON.parse(text).sources.length,9);assert.equal(calls,1);assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(response.headers.get('access-control-allow-origin'),null);
});
test('missing key/free confirmation/short password fail closed, status leaks no secrets',async()=>{
  const api=createApi({fetchImpl:()=>{throw new Error('must not call');}});
  for(const config of [{...env,GEMINI_API_KEY:''},{...env,FREE_TIER_CONFIRMED:'false'},{...env,ACCESS_PASSWORD:'short'}]){assert.equal((await api(req(),config)).status,503);const response=await api(new Request('https://example.test/api/status'),config),text=await response.text();assert.equal(JSON.parse(text).ready,false);assert.ok(!text.includes(env.GEMINI_API_KEY));}
});
test('wrong access code, cross-origin, wrong method/type and unknown route rejected before AI',async()=>{
  let calls=0;const api=createApi({fetchImpl:()=>{calls++;}});
  assert.equal((await api(req(input(),{Authorization:'Bearer incorrect'}),env)).status,401);
  assert.equal((await api(req(input(),{Origin:'https://evil.test'}),env)).status,403);
  assert.equal((await api(req(input(),{'Content-Type':'text/plain'}),env)).status,415);
  assert.equal((await api(new Request('https://example.test/api/compare'),env)).status,405);
  assert.equal((await api(new Request('https://example.test/api/unknown'),env)).status,404);assert.equal(calls,0);
});
test('malformed input, oversized body, and stream limit fail before AI',async()=>{
  let calls=0;const api=createApi({fetchImpl:()=>{calls++;}}),bad=req();
  assert.equal((await api(req({}),env)).status,400);
  const malformed=new Request(bad.url,{method:'POST',headers:bad.headers,body:'{'});assert.equal((await api(malformed,env)).status,400);
  assert.equal((await api(req(input(),{'Content-Length':'99999999'}),env)).status,413);
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(11));c.close();}});await assert.rejects(()=>readLimited(new Response(stream),10),{code:'INPUT_TOO_LARGE'});assert.equal(calls,0);
});
test('upstream key/model/service/network errors are distinguished and never echoed',async()=>{
  for(const [status,code] of [[401,'API_KEY_ERROR'],[403,'API_KEY_ERROR'],[404,'MODEL_UNAVAILABLE'],[503,'AI_BUSY'],[500,'AI_UNAVAILABLE'],[400,'AI_REQUEST_INVALID']]){
    let calls=0;const api=createApi({fetchImpl:async()=>{calls++;return new Response('secret provider detail '+env.GEMINI_API_KEY,{status});}});const response=await api(req(),env),text=await response.text();assert.equal(JSON.parse(text).error.code,code);assert.ok(!text.includes(env.GEMINI_API_KEY));assert.equal(calls,1);
  }
  const api=createApi({fetchImpl:async()=>{throw new Error('secret');}});assert.equal((await (await api(req(),env)).json()).error.code,'AI_NETWORK');
});
test('429 circuit stops follow-up requests without model switch or retry',async()=>{
  let calls=0;const api=createApi({fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}});
  for(let i=0;i<2;i++){const response=await api(req(),env);assert.equal(response.status,429);assert.equal((await response.json()).error.code,'FREE_QUOTA');}assert.equal(calls,1);
});
test('timeout aborts exactly one upstream attempt',async()=>{
  let calls=0;const api=createApi({timeoutMs:10,fetchImpl:async(url,{signal})=>{calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));});}});
  const response=await api(req(),env);assert.equal(response.status,504);assert.equal((await response.json()).error.code,'AI_TIMEOUT');assert.equal(calls,1);
});
test('bad AI JSON, incomplete output, empty result and invalid evidence never rendered',async()=>{
  const variants=[new Response('not-json'),new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS'}]})),new Response(JSON.stringify({candidates:[]})),new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{bad'}]}}]})),upstream({...result(),items:[]})];
  for(const response of variants){const api=createApi({fetchImpl:async()=>response});const r=await api(req(),env);assert.equal(r.status,502);assert.equal((await r.json()).result,undefined);}
});
test('isolate guard rejects overlapping, minute and day overflow',()=>{
  let time=86400000;const guard=createGuard(()=>time);guard.enter();assert.throws(()=>guard.enter(),{code:'REQUEST_BUSY'});guard.leave();for(let i=0;i<2;i++){guard.enter();guard.leave();}assert.throws(()=>guard.enter(),{code:'APP_RATE_LIMIT'});
  for(let i=0;i<9;i++){time+=60000;for(let j=0;j<3;j++){guard.enter();guard.leave();}}time+=60000;assert.throws(()=>guard.enter(),{code:'APP_RATE_LIMIT'});time+=86400000;guard.enter();guard.leave();
});
test('additional term question uses same API controls and has no images',async()=>{
  const api=createApi({fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.contents[0].parts.length,1);return upstream({answer:'일반 설명입니다.',uncertainty_notes:['제품 사양은 확인 필요']});}});
  const request=new Request('https://example.test/api/explain',{method:'POST',headers:req().headers,body:JSON.stringify({term,question:'RAM이 클수록 좋은가요?',level:'완전 초보',consent:true})});const response=await api(request,env);assert.equal(response.status,200);assert.equal((await response.json()).result.answer,'일반 설명입니다.');
});
test('Worker-compatible redirect mode never follows a redirect with the key',async()=>{
  let calls=0;const api=createApi({fetchImpl:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://unexpected.invalid/'}});}});
  const response=await api(req(),env);assert.equal(response.status,502);assert.equal((await response.json()).error.code,'AI_REDIRECT');assert.equal(calls,1);
});
test('auth attempt gate is bounded without keeping IPs or credentials',async()=>{
  const api=createApi();for(let i=0;i<20;i++)assert.equal((await api(req(input(),{Authorization:'wrong'}),env)).status,401);assert.equal((await api(req(),env)).status,429);
});
