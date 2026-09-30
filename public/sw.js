const SHELL="kpi-bakul-shell-v2";
const RUNTIME="kpi-bakul-runtime-v2";
const PRECACHE=["/offline.html","/manifest.webmanifest","/kpi-app-icon.svg","/kpi-icon-192.png","/kpi-icon-512.png","/bakul-sayur-logo.svg"];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL);
    await Promise.allSettled(PRECACHE.map(async url=>{
      try{
        const response=await fetch(url,{cache:"reload"});
        if(response.ok) await cache.put(url,response.clone());
      }catch{}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>![SHELL,RUNTIME].includes(key)).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

function isAuthPath(path){
  return path.startsWith("/login")||path.startsWith("/register")||path.startsWith("/auth/");
}

function cacheableResponse(response){
  if(!response||!response.ok)return false;
  try{
    const path=new URL(response.url).pathname;
    return !isAuthPath(path);
  }catch{return false}
}

async function cachePrivateUrl(url){
  try{
    const parsed=new URL(url,self.location.origin);
    if(parsed.origin!==self.location.origin||isAuthPath(parsed.pathname))return;
    const request=new Request(parsed.pathname+parsed.search,{credentials:"include"});
    const response=await fetch(request);
    if(cacheableResponse(response)){
      const runtime=await caches.open(RUNTIME);
      await runtime.put(request,response.clone());
    }
  }catch{}
}

self.addEventListener("message",event=>{
  if(event.data?.type==="CLEAR_PRIVATE"){
    event.waitUntil((async()=>{await caches.delete(RUNTIME);await caches.open(RUNTIME)})());
  }
  if(event.data?.type==="CACHE_CURRENT"&&event.data?.url){
    event.waitUntil(cachePrivateUrl(event.data.url));
  }
  if(event.data?.type==="SKIP_WAITING"){
    event.waitUntil(self.skipWaiting());
  }
});

async function navigationNetworkFirst(request){
  const runtime=await caches.open(RUNTIME);
  try{
    const response=await fetch(request);
    if(cacheableResponse(response)) await runtime.put(request,response.clone());
    return response;
  }catch{
    const cached=await runtime.match(request);
    if(cached)return cached;
    const dashboard=await runtime.match("/dashboard")||await runtime.match("/dashboard?source=pwa");
    if(dashboard)return dashboard;
    return (await caches.match("/offline.html"))||Response.error();
  }
}

async function sameOriginNetworkFirst(request){
  const runtime=await caches.open(RUNTIME);
  try{
    const response=await fetch(request);
    if(cacheableResponse(response)) await runtime.put(request,response.clone());
    return response;
  }catch{
    return (await runtime.match(request))||Response.error();
  }
}

async function staticStaleWhileRevalidate(request){
  const cache=await caches.open(SHELL);
  const cached=await cache.match(request);
  const network=fetch(request).then(async response=>{
    if(response.ok) await cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||await network||Response.error();
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(isAuthPath(url.pathname)){
    event.respondWith(fetch(request));
    return;
  }

  if(request.mode==="navigate"){
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if(
    url.pathname.startsWith("/_next/static/")||
    url.pathname==="/manifest.webmanifest"||
    url.pathname.endsWith(".svg")||
    url.pathname.endsWith(".png")||
    url.pathname.endsWith(".ico")||
    url.pathname.endsWith(".woff2")
  ){
    event.respondWith(staticStaleWhileRevalidate(request));
    return;
  }

  event.respondWith(sameOriginNetworkFirst(request));
});
