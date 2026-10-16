import { createApi,SECURITY_HEADERS } from './server.mjs';
const api=createApi();
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')) return api(request,env);
    const allowed=['/','/index.html','/app.js','/render.js','/style.css','/contract.mjs'];
    if(!allowed.includes(url.pathname) || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404,headers:SECURITY_HEADERS});
    const response=await env.ASSETS.fetch(request), headers=new Headers(response.headers);
    for(const [name,value] of Object.entries(SECURITY_HEADERS)) headers.set(name,value);
    headers.set('Strict-Transport-Security','max-age=31536000');
    return new Response(response.body,{status:response.status,headers});
  }
};
