import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root} from './catalog.mjs';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
export async function startServer({port=0}={}){
 const directory=path.join(root,'dist');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  try{
   const host=req.headers.host||'';if(!/^127\.0\.0\.1:\d+$/.test(host)){res.writeHead(403);res.end('Loopback host required');return;}
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(pathname==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('User-agent: *\nDisallow: /\n');return;}
   let file=path.resolve(directory,'.'+pathname);
   if(!file.startsWith(directory+path.sep)&&file!==directory)throw Error('Outside build');
   if((await stat(file)).isDirectory())file=path.join(file,'index.html');
   const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
