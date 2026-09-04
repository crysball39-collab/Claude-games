/* =============================================================================
   Test harness. Serves the game over http, drives it in a real browser and
   hands back a page plus a few helpers. Needs playwright and a chromium build:

     npm install -D playwright && npx playwright install chromium
     node tools/verify.mjs
   ========================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const CHROME = process.env.CHROMIUM_PATH || undefined;

export async function boot({ port = 8210, width = 900, height = 560, shots = path.join(ROOT, '.shots') } = {}) {
  const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
    const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);});
  await new Promise(r=>server.listen(port,r));
  fs.mkdirSync(shots,{recursive:true});
  const browser=await chromium.launch({ executablePath: CHROME,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const logs=[];
  page.on('console',m=>{ if(m.type()==='error') logs.push('[err] '+m.text()); });
  page.on('pageerror',e=>logs.push('[pageerror] '+e.message+'\n'+(e.stack||'').split('\n').slice(1,4).join('\n')));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});
  await page.waitForSelector('#menu-screen.active',{timeout:30000});
  await page.click('#btn-maps'); await page.waitForTimeout(120);
  await page.click('.map-card'); await page.waitForTimeout(120);
  await page.click('#btn-play');
  await page.waitForFunction(()=>!document.querySelector('#map-screen').classList.contains('active'),{timeout:150000});
  await page.waitForTimeout(1200);
  const shot=(n)=>page.screenshot({path:`${shots}/${n}.png`});
  const ev=(fn,...a)=>page.evaluate(fn,...a);
  const hideHud=()=>ev(()=>{document.querySelector('#hud').style.display='none';});
  const showHud=()=>ev(()=>{document.querySelector('#hud').style.display='';});
  const close=async()=>{ await browser.close(); server.close(); };
  return { page, shot, ev, logs, close, hideHud, showHud };
}
