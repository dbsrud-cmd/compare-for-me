import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createApi,SECURITY_HEADERS} from './server.mjs';
const env={LOCAL_DEV:'true'};
for(const key of ['GEMINI_API_KEY','ACCESS_PASSWORD','FREE_TIER_CONFIRMED']) if(process.env[key]) env[key]=process.env[key];
try {
  // Keep the recommended secret file outside the OneDrive project folder.
  const configPath=process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA,'CompareHelper','.dev.vars') : new URL('.dev.vars',import.meta.url);
  const vars=await readFile(configPath,'utf8');
  for(const line of vars.split(/\r?\n/)) {
    if(!line.trim() || line.trimStart().startsWith('#')) continue;
    const match=/^([A-Z_]+)=(.*)$/.exec(line.trim());
    if(!match || !['GEMINI_API_KEY','ACCESS_PASSWORD','FREE_TIER_CONFIRMED'].includes(match[1])) throw new Error('Invalid local configuration');
    let value=match[2].trim(); if((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value=value.slice(1,-1);
    env[match[1]]=value;
  }
} catch(e) { if(e.code!=='ENOENT') { console.error('Local configuration could not be loaded. Check .dev.vars format.');process.exit(1); } }
const api=createApi();
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/render.js':'render.js','/style.css':'style.css','/contract.mjs':'contract.mjs'};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const port=Number(process.env.PORT || 8765);
if(!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Invalid port');
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(req.headers.host!==`127.0.0.1:${port}` && req.headers.host!==`localhost:${port}`) {res.writeHead(403,SECURITY_HEADERS);res.end();return;}
    if(url.pathname.startsWith('/api/')) {
      const method=req.method;
      const request=new Request(`http://${req.headers.host}${req.url}`,{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:req,duplex:'half'}:{})});
      const response=await api(request,env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } else if(Object.hasOwn(files,url.pathname) && ['GET','HEAD'].includes(req.method)) {
      const name=files[url.pathname],data=await readFile(new URL(name,import.meta.url));
      res.writeHead(200,{...SECURITY_HEADERS,'Content-Type':types[name.split('.').at(-1)]});res.end(req.method==='HEAD'?undefined:data);
    } else {res.writeHead(404,SECURITY_HEADERS);res.end('Not found');}
  } catch {res.writeHead(500,SECURITY_HEADERS);res.end('Local server error');}
});
server.requestTimeout=75000;server.headersTimeout=15000;
server.listen(port,'127.0.0.1',()=>console.log(`Local preview: http://127.0.0.1:${port}\nAI: ${env.GEMINI_API_KEY && env.FREE_TIER_CONFIRMED==='true'?'configuration present (not verified)':'not connected; no demo results'}\nPress Ctrl+C to stop.`));
