/*
 * Behavioural tests for the arcade rules: ghost targeting (including the two
 * documented targeting quirks), scatter/chase phase lengths, ghost-house
 * release limits, the tunnel, scoring, and the per-level speed table.
 *
 *   npm install playwright
 *   node test/run-tests.js
 *
 * Set CHROMIUM_PATH to use a browser that is already on the machine.
 */
const { chromium } = require('playwright');
/* A glyph the font lacks renders as nothing at all, silently. Scan the source
   for every string that reaches the bitmap font and check coverage first. */
function auditFont() {
  const fs = require('fs'), path = require('path');
  const root = path.resolve(__dirname, '..');
  const font = fs.readFileSync(path.join(root, 'js/font.js'), 'utf8');
  const glyphs = new Set();
  for (const m of font.matchAll(/^\s*'(.)':\s*\[/gm)) glyphs.add(m[1]);
  for (const m of font.matchAll(/GLYPHS\['(.)'\]/g)) glyphs.add(m[1]);

  const src = ['js/game.js', 'js/mods.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const lits = new Set();
  for (const m of src.matchAll(/\b(?:Font|F)\.(?:draw|drawRight|drawCentered)\(\s*ctx\s*,\s*'([^']*)'/g)) lits.add(m[1]);
  for (const m of src.matchAll(/lines:\s*\[([^\]]*)\]/g))
    for (const q of m[1].matchAll(/'([^']*)'/g)) lits.add(q[1]);
  for (const m of src.matchAll(/(?:blurb|name|who|text):\s*'([^']*)'/g)) lits.add(m[1]);

  const missing = new Set();
  for (const s of lits) for (const ch of s.toUpperCase()) if (!glyphs.has(ch)) missing.add(ch);
  return { count: lits.size, missing: [...missing] };
}

(async () => {
  const fontAudit = auditFont();
  const b = await chromium.launch(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { /* blocked */ } });
  await p.reload();
  await p.waitForTimeout(300);
  const out = await p.evaluate(() => {
    const g=window.pacmanGame, M=window.Maze;
    const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+'  '+n+(d?'   '+d:''));
    const run=n=>{for(let i=0;i<n;i++) g.update(1/60);};

    // --- maze structure (arcade checksums) ---
    ok('maze is 28 x 31 tiles', M.LAYOUT.length===31 && M.LAYOUT.every(r=>r.length===28));
    let nd=0, ne=0;
    M.LAYOUT.forEach(r=>{ for(const ch of r){ if(ch==='.') nd++; if(ch==='o') ne++; } });
    ok('240 dots and 4 energizers (244 total)', nd===240&&ne===4, nd+' + '+ne);
    let asym=0;
    M.LAYOUT.forEach(r=>{ for(let c=0;c<14;c++) if(r[c]!==r[27-c]) asym++; });
    ok('maze is left-right symmetric', asym===0, asym+' mismatched cells');
    // every dot reachable from Pac-Man's start tile
    (function(){
      const seen=new Set(['13,23']); const st=[[13,23]];
      const walk=(c,r)=> r>=0&&r<31 && (c<0||c>27 ? true : (M.LAYOUT[r][c]!=='#'&&M.LAYOUT[r][c]!=='-'));
      while(st.length){ const [c,r]=st.pop();
        for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
          let nc=c+dc; const nr=r+dr;
          if(nc<0) nc=27; if(nc>27) nc=0;
          if(!walk(nc,nr)) continue;
          const k=nc+','+nr; if(seen.has(k)) continue; seen.add(k); st.push([nc,nr]);
        } }
      let unreachable=0;
      for(let r=0;r<31;r++) for(let c=0;c<28;c++){
        const ch=M.LAYOUT[r][c];
        if((ch==='.'||ch==='o') && !seen.has(c+','+r)) unreachable++;
      }
      ok('every dot is reachable', unreachable===0, unreachable+' unreachable');
    })();
    ok('energizers at the four arcade tiles',
       M.LAYOUT[3][1]==='o'&&M.LAYOUT[3][26]==='o'&&M.LAYOUT[23][1]==='o'&&M.LAYOUT[23][26]==='o');
    ok('ghost-house door at row 12, cols 13-14',
       M.LAYOUT[12][13]==='-'&&M.LAYOUT[12][14]==='-');
    ok('wall glyphs traced from the arcade capture',
       window.MazeTiles.glyphs.length===33 && window.MazeTiles.tilemap.length===31);

    // --- tunnel wrap ---
    g.reset(1,true); g.state='playing';
    g.pac.x=8; g.pac.y=14*8+4; g.pac.dir='left'; g.pac.want='left';
    let wrapped=false, prev=g.pac.x;
    for(let i=0;i<200;i++){ g.update(1/60); if(g.pac.x>prev+50) wrapped=true; prev=g.pac.x; }
    ok('tunnel wraps left->right', wrapped, 'x='+g.pac.x.toFixed(1));

    // --- level clear ---
    g.reset(1,true); g.state='playing';
    for(let r=0;r<31;r++) for(let c=0;c<28;c++) if(g.dots[r][c]){ g.dots[r][c]=0; g.dotsRemaining--; }
    g.dots[23][12]=1; g.dotsRemaining=1; g.pac.x=12*8+4; g.pac.y=23*8+4; g.pac.dir='left'; g.pac.want='left';
    run(30);
    ok('level clear triggers', g.state==='levelclear', 'state='+g.state);
    run(60*4);
    ok('advances to level 2', g.level===2 && g.state==='ready', 'level='+g.level+' state='+g.state);
    ok('dots refilled on new level', g.dotsRemaining===244, 'dots='+g.dotsRemaining);

    // --- ghost house release (level 1: inky 30 dots, clyde 60) ---
    g.reset(1,true); g.state='playing';
    ok('pinky leaves immediately (limit 0)', g.ghosts[1].dotLimit===0);
    ok('inky limit 30 on level 1', g.ghosts[2].dotLimit===30);
    ok('clyde limit 60 on level 1', g.ghosts[3].dotLimit===60);
    g.reset(3,false);
    ok('inky/clyde limit 0 from level 3', g.ghosts[2].dotLimit===0 && g.ghosts[3].dotLimit===0);

    // --- ghost targeting ---
    g.reset(1,true); g.state='playing'; g.mode='chase'; g.phaseIndex=1;
    g.pac.x=13*8+4; g.pac.y=20*8+4; g.pac.dir='left';
    const t=n=>g.ghostTarget(g.ghosts.find(x=>x.name===n));
    const bt=t('blinky');
    ok('blinky targets pac tile', bt.c===13&&bt.r===20, JSON.stringify(bt));
    const pt=t('pinky');
    ok('pinky targets 4 ahead', pt.c===9&&pt.r===20, JSON.stringify(pt));
    g.pac.dir='up';
    const pu=t('pinky');
    ok('pinky up-overflow bug (4 up AND 4 left)', pu.c===9&&pu.r===16, JSON.stringify(pu));
    g.pac.dir='left';
    g.ghosts[0].x=13*8+4; g.ghosts[0].y=11*8+4;   // blinky at (13,11)
    const it=t('inky');
    // pac(13,20) dir left -> 2 ahead = (11,20); vector from blinky(13,11) doubled
    ok('inky = 2*(2-ahead) - blinky', it.c===9&&it.r===29, JSON.stringify(it));
    const clyde=g.ghosts[3]; clyde.x=13*8+4; clyde.y=21*8+4;   // 1 tile from pac
    const ct=t('clyde');
    ok('clyde scatters when within 8 tiles', ct.c===clyde.scatter.c&&ct.r===clyde.scatter.r, JSON.stringify(ct));
    clyde.x=1*8+4; clyde.y=1*8+4;
    const ct2=t('clyde');
    ok('clyde chases when far', ct2.c===13&&ct2.r===20, JSON.stringify(ct2));

    // --- scatter/chase phases (level 1) ---
    // Dying restarts the phase clock, so suspend collisions to time the cycle.
    g.reset(1,true); g.state='playing';
    const realCollide = g.collisionCheck; g.collisionCheck = function(){};
    const modes=[]; let last=null;
    for(let i=0;i<60*64;i++){ g.update(1/60); if(g.mode!==last){ modes.push([g.mode, +(i/60).toFixed(1)]); last=g.mode; } }
    g.collisionCheck = realCollide;
    ok('phase order scatter->chase->scatter...',
       modes[0][0]==='scatter'&&modes[1][0]==='chase'&&modes[2][0]==='scatter',
       JSON.stringify(modes.slice(0,5)));
    ok('first scatter is 7s on level 1', Math.abs(modes[1][1]-7)<0.2, 'switch at '+modes[1][1]+'s');
    ok('first chase is 20s', Math.abs(modes[2][1]-27)<0.3, 'switch at '+modes[2][1]+'s');
    ok('second scatter is 7s', Math.abs(modes[3][1]-34)<0.3, 'switch at '+modes[3][1]+'s');

    // --- eaten ghost returns home and re-emerges ---
    g.reset(1,true); g.state='playing';
    const bl=g.ghosts[0]; bl.state='eaten'; bl.frightened=false;
    let sawEntering=false, backNormal=false;
    for(let i=0;i<60*25;i++){ g.update(1/60);
      if(bl.state==='entering'||bl.state==='house') sawEntering=true;
      if(sawEntering && bl.state==='normal') backNormal=true; }
    ok('eaten ghost re-enters house', sawEntering, 'state='+bl.state);
    ok('eaten ghost returns to play', backNormal, 'state='+bl.state);

    // --- scoring ---
    g.reset(1,true); g.state='playing'; g.score=0;
    g.ghostsEaten=0; g.frightTimer=6;
    g.ghosts.forEach(x=>{x.frightened=true; x.state='normal';});
    const vals=[];
    for(const gh of g.ghosts){ gh.x=g.pac.x; gh.y=g.pac.y; const s0=g.score; g.collisionCheck(); vals.push(g.score-s0); }
    ok('ghost chain scores 200/400/800/1600', JSON.stringify(vals)==='[200,400,800,1600]', JSON.stringify(vals));

    // --- extra life at 10000 ---
    g.reset(1,true); const lv=g.lives; g.addScore(10000);
    ok('extra life at 10000', g.lives===lv+1, 'lives='+g.lives);

    // --- speed table ---
    g.reset(1,true);
    ok('L1 pac 80%, ghost 75%', g.spec.pacSpeed===0.80&&g.spec.ghostSpeed===0.75);
    g.reset(5,false);
    ok('L5 pac 100%, ghost 95%, fright 2s', g.spec.pacSpeed===1.00&&g.spec.ghostSpeed===0.95&&g.spec.frightTime===2);
    g.reset(21,false);
    ok('L21 pac drops to 90%', g.spec.pacSpeed===0.90);
    g.reset(19,false);
    ok('L19 has no frightened time', g.spec.frightTime===0);

    // --- no-up tiles ---
    ok('ghost no-up tiles', M.isNoUpTile(12,11)&&M.isNoUpTile(15,11)&&M.isNoUpTile(12,23)&&M.isNoUpTile(15,23)&&!M.isNoUpTile(13,11));

    // --- fruit ---
    g.reset(1,true); g.state='playing';
    ok('level 1 fruit is cherry', g.spec.fruit==='cherry');
    g.reset(3,false); ok('level 3 fruit is orange', g.spec.fruit==='orange');
    g.reset(13,false); ok('level 13 fruit is key', g.spec.fruit==='key');

    /* ---------------- mods ---------------- */
    const MO = window.Mods;

    // title screen menu
    g.state='title'; g.titleIndex=0;
    g.menuAction('down');
    ok('title menu moves down', g.titleIndex===1);
    g.titleIndex=3;                              // 1 PLAYER / 2 PLAYER / AI MODE / MODS
    g.menuAction('select');
    ok('MODS opens the mod menu', g.state==='mods', 'state='+g.state);
    ok('menu lists installed and downloadable',
       MO.menu.rows.some(r=>r.kind==='mod') && MO.menu.rows.some(r=>r.kind==='dl'));

    // enable / disable
    MO.state.enabled.rampage = false;
    MO.menu.index = MO.menu.rows.findIndex(r=>r.kind==='mod' && r.id==='rampage');
    MO.handleInput(g,'select');
    ok('mod can be enabled', MO.isOn('rampage'));
    MO.handleInput(g,'select');
    ok('mod can be disabled', !MO.isOn('rampage'));
    MO.state.enabled.rampage = true;

    // storage accounting
    ok('storage totals enabled mods', MO.storageUsed()===128, MO.storageUsed()+'K');

    // Rampage Pac progression
    g.startModdedGame(1);
    ok('level 1 is untouched', !g.pacAngry && !g.pacArmed && !g.ghostsFlee);
    g.startModdedGame(2);
    ok('level 2 gives him brows', g.pacAngry && !g.pacArmed);
    g.startModdedGame(3);
    ok('level 3 starts a cutscene', !!g.cutscene && g.state==='ready');
    run(60*7);
    ok('cutscene arms him before it ends', g.pacArmed, 'armed='+g.pacArmed);
    run(60*3);
    ok('cutscene ends with the ghosts fleeing', g.ghostsFlee);
    ok('play begins after the cutscene', g.state==='playing', 'state='+g.state);

    // shooting
    const gh = g.ghosts[0];
    gh.state='normal'; gh.frightened=false;
    g.pac.dir='right'; gh.x=g.pac.x+24; gh.y=g.pac.y;
    g.shootCooldown=0;
    const s0=g.score;
    MO.shoot(g);
    ok('shotgun downs a ghost in line', gh.state==='eaten', 'ghost='+gh.state);
    ok('shooting scores', g.score>s0, s0+' -> '+g.score);
    const s1=g.score;
    MO.shoot(g);
    ok('shotgun has a cooldown', g.score===s1);

    // fleeing ghosts cannot kill him
    const g2=g.ghosts[1]; g2.state='normal'; g2.frightened=false;
    g2.x=g.pac.x; g2.y=g.pac.y;
    const lives=g.lives; g.collisionCheck();
    ok('fleeing ghosts are harmless', g.lives===lives && g.state==='playing');

    // level 3 clear ends the demo
    g.state='levelclear'; g.stateTime=3.2; g.update(1/60);
    ok('level 3 ends the mod demo', g.state==='moddemoend', 'state='+g.state);
    MO.handleInput(g,'select');
    ok('demo end returns to the mod menu', g.state==='mods', 'state='+g.state);

    // dev menu
    MO.dev.unlocked=true; MO.dev.level=5; MO.dev.speed=2; MO.dev.god=true;
    g.startModdedGame(MO.dev.level);
    ok('dev sets the level', g.level===5, 'level='+g.level);
    ok('dev sets the speed scale', g.speedScale===2, 'scale='+g.speedScale);
    ok('dev godmode is applied', g.godmode===true);
    g.state='playing'; g.ghostsFlee=false;
    const g3=g.ghosts[2]; g3.state='normal'; g3.frightened=false;
    g3.x=g.pac.x; g3.y=g.pac.y;
    const lives2=g.lives; g.collisionCheck();
    ok('godmode survives a ghost', g.lives===lives2 && g.state==='playing');
    MO.dev.unlocked=false; MO.dev.god=false; MO.dev.speed=1;
    MO.state.enabled.rampage=false;


    /* ---------------- extra ghosts ---------------- */
    const EG = window.ExtraGhosts;
    const wrapC = c => ((c % 28) + 28) % 28;
    // baseline: nothing enabled -> the original four, unchanged
    EG.ROSTER.forEach(d=>EG.setOn(d.id,false));
    g.reset(1,true);
    ok('no extras -> four ghosts', g.ghosts.length===4, 'n='+g.ghosts.length);
    ok('ghosts[0] is still Blinky', g.ghosts[0].name==='blinky');

    // enable all four
    EG.ROSTER.forEach(d=>EG.setOn(d.id,true));
    g.reset(1,true);
    ok('all extras -> eight ghosts', g.ghosts.length===8, 'n='+g.ghosts.length);
    ok('originals keep their order and names',
       ['blinky','pinky','inky','clyde'].every((n,i)=>g.ghosts[i].name===n));
    ok('extras start outside the house waiting',
       g.ghosts.slice(4).every(x=>x.state==='waiting'), g.ghosts.slice(4).map(x=>x.state).join(','));
    ok('extras start on walkable tiles',
       g.ghosts.slice(4).every(x=>!M.isWall(wrapC(Math.floor(x.x/8)), Math.floor(x.y/8))));

    // arbitrary combinations
    EG.ROSTER.forEach(d=>EG.setOn(d.id,false));
    EG.setOn('lumo',true); g.reset(1,true);
    ok('lumo only -> five ghosts', g.ghosts.length===5 && g.ghosts[4].ai==='lumo');
    EG.setOn('grimm',true); EG.setOn('lumo',false); EG.setOn('nox',true); g.reset(1,true);
    ok('grimm + nox -> six ghosts',
       g.ghosts.length===6 && g.ghosts[4].ai==='grimm' && g.ghosts[5].ai==='nox');

    // ---- chase rules are genuinely different ----
    EG.ROSTER.forEach(d=>EG.setOn(d.id,true));
    g.reset(1,true); g.state='playing'; g.mode='chase'; g.phaseIndex=1;
    g.ghosts.forEach(x=>{ if(x.state==='waiting') x.state='normal'; });
    g.pac.x=6*8+4; g.pac.y=5*8+4; g.pac.dir='right';      // long open corridor
    const T={};
    g.ghosts.forEach(x=>{ T[x.name]=g.ghostTarget(x); });
    const key=o=>o.c+','+o.r;
    // Two rules can coincide for one instant; what matters is that they are
    // different functions. Sample a spread of positions and directions and
    // require every pair to disagree most of the time.
    const SPOTS=[[6,5],[13,20],[21,8],[1,29],[26,17],[9,11],[16,26],[6,14]];
    const DIRS=['left','right','up','down'];
    const names=['blinky','pinky','inky','clyde','lumo','vexa','grimm','nox'];
    const samples={}; names.forEach(n=>samples[n]=[]);
    for (const [pcx,pcy] of SPOTS) for (const d of DIRS) {
      if (M.isWall(pcx,pcy)) continue;
      g.pac.x=pcx*8+4; g.pac.y=pcy*8+4; g.pac.dir=d;
      g.globalTime += 3;                       // moves Nox through his cycle
      names.forEach(n=>{
        const gh=g.ghosts.find(x=>x.name===n);
        samples[n].push(key(g.ghostTarget(gh)));
      });
    }
    const total=samples.lumo.length;
    // Only pairs involving a new ghost are policed. Blinky and Clyde coincide
    // by design on the real arcade - Clyde targets Pac-Man directly whenever he
    // is more than eight tiles away - and that behaviour must not change.
    const EXTRA_NAMES=['lumo','vexa','grimm','nox'];
    let worstPair=null, worstAgree=0;
    for (let i=0;i<names.length;i++) for (let j=i+1;j<names.length;j++) {
      if (!EXTRA_NAMES.includes(names[i]) && !EXTRA_NAMES.includes(names[j])) continue;
      let same=0;
      for (let k=0;k<total;k++) if (samples[names[i]][k]===samples[names[j]][k]) same++;
      if (same>worstAgree) { worstAgree=same; worstPair=names[i]+'/'+names[j]; }
    }
    ok('every new ghost is a distinct rule from all seven others',
       worstAgree < total*0.5,
       'closest pair '+worstPair+' agreed on '+worstAgree+' of '+total+' scenarios');
    // Put Pac-Man back where the per-ghost assertions below expect him.
    g.pac.x=6*8+4; g.pac.y=5*8+4; g.pac.dir='right';
    g.ghosts.forEach(x=>{ T[x.name]=g.ghostTarget(x); });
    const extras=['lumo','vexa','grimm','nox'].map(n=>key(T[n]));
    // Nox deliberately mixes direct pursuit with a short lead, so he may match
    // Blinky momentarily; what matters is that he alternates.
    const noxG=g.ghosts.find(x=>x.ai==='nox');
    noxG.x=2*8+4; noxG.y=29*8+4; noxG.stalk='hunt';
    const noxTargets=new Set();
    const t0=g.globalTime;
    for (let i=0;i<8;i++){ g.globalTime=t0+i*3; noxTargets.add(key(g.ghostTarget(noxG))); }
    g.globalTime=t0;
    ok('nox alternates between pursuit and a lead', noxTargets.size>1,
       [...noxTargets].join(' '));
    ok('the three positional extras never sit on pac himself',
       !['lumo','vexa','grimm'].map(n=>key(T[n])).includes(key(T.blinky)),
       'blinky='+key(T.blinky));
    ok('no extra copies pinky (4 ahead)',
       !extras.includes(key(T.pinky)), 'pinky='+key(T.pinky));

    // lumo projects along the real corridor and closes in when near
    const lumo=g.ghosts.find(x=>x.ai==='lumo');
    const lt=g.ghostTarget(lumo);
    ok('lumo aims down the corridor ahead', lt.r===5 && lt.c>6, JSON.stringify(lt));
    ok('lumo target is a real corridor tile', !M.isWall(wrapC(lt.c), lt.r));
    lumo.x=g.pac.x+16; lumo.y=g.pac.y;
    const lt2=g.ghostTarget(lumo);
    ok('lumo switches to direct pursuit up close',
       lt2.c===Math.floor(g.pac.x/8) && lt2.r===5, JSON.stringify(lt2));

    // grimm targets a junction, not pac
    const grimm=g.ghosts.find(x=>x.ai==='grimm');
    const gt=g.ghostTarget(grimm);
    const exits=(c,r)=>[[1,0],[-1,0],[0,1],[0,-1]].filter(([dc,dr])=>M.isWalkable(wrapC(c+dc),r+dr)).length;
    ok('grimm targets a junction or corridor end',
       exits(gt.c,gt.r)>=3 || !M.isWalkable(wrapC(gt.c+1),gt.r),
       JSON.stringify(gt)+' exits='+exits(gt.c,gt.r));
    ok('grimm does not target pac himself',
       !(gt.c===Math.floor(g.pac.x/8)&&gt.r===5), JSON.stringify(gt));

    // vexa flanks off the axis
    const vexa=g.ghosts.find(x=>x.ai==='vexa');
    vexa.x=200; vexa.y=200;                    // make sure it is not the closest
    const vt=g.ghostTarget(vexa);
    ok('vexa aims off the row pac runs along',
       vt.r!==5, JSON.stringify(vt));

    // nox hysteresis
    const nox=g.ghosts.find(x=>x.ai==='nox');
    nox.stalk='hunt'; nox.x=g.pac.x+16; nox.y=g.pac.y;
    g.ghostTarget(nox);
    ok('nox breaks off when crowded', nox.stalk==='back', 'stalk='+nox.stalk);
    const away=g.ghostTarget(nox);
    ok('nox repositions away from pac', away.c>14, JSON.stringify(away));
    nox.x=1*8+4; nox.y=29*8+4;                 // far off, and a real corridor
    g.ghostTarget(nox);
    ok('nox resumes hunting once clear', nox.stalk==='hunt', 'stalk='+nox.stalk);

    // ---- scatter patrols stay in their quadrant ----
    g.mode='scatter'; g.phaseIndex=0;
    const QUAD={lumo:[1,13,1,14],vexa:[14,26,1,14],grimm:[1,13,15,29],nox:[14,26,15,29]};
    let outside=0, seen={};
    for (const name of ['lumo','vexa','grimm','nox']) {
      const gh=g.ghosts.find(x=>x.ai===name); seen[name]=new Set();
      const q=QUAD[name];
      for (let i=0;i<40;i++) {
        gh.patrolIndex=i%5;
        const t=g.ghostTarget(gh);
        seen[name].add(t.c+','+t.r);
        if (t.c<q[0]||t.c>q[1]||t.r<q[2]||t.r>q[3]) outside++;
        if (M.isWall(wrapC(t.c),t.r)) outside+=100;
      }
    }
    ok('every scatter waypoint is inside its own quadrant and walkable',
       outside===0, 'violations='+outside);
    ok('each ghost patrols several points, not one corner',
       Object.values(seen).every(s=>s.size>=4),
       Object.entries(seen).map(([k,v])=>k+':'+v.size).join(' '));
    const allPts=Object.values(seen).flatMap(s=>[...s]);
    ok('the four patrol routes do not overlap', new Set(allPts).size===allPts.length);

    // patrol advances as the ghost arrives
    const l2=g.ghosts.find(x=>x.ai==='lumo');
    l2.patrolIndex=0;
    const first=g.ghostTarget(l2);
    l2.x=first.c*8+4; l2.y=first.r*8+4;
    const second=g.ghostTarget(l2);
    ok('reaching a waypoint advances the patrol',
       second.c!==first.c || second.r!==first.r,
       JSON.stringify(first)+' -> '+JSON.stringify(second));

    // ---- frightened / eaten ----
    g.mode='chase'; g.phaseIndex=1;
    const fr=g.ghosts.find(x=>x.ai==='vexa');
    fr.state='normal'; fr.frightened=true;
    const dirsSeen=new Set();
    for (let i=0;i<80;i++){ fr.dir='left'; g.decideGhost(fr); dirsSeen.add(fr.dir); }
    ok('frightened extras use the core random walk, not their AI', dirsSeen.size>1,
       'dirs='+[...dirsSeen].join(','));
    fr.frightened=false;
    fr.state='eaten';
    const et=g.ghostTarget(fr);
    ok('eaten extras head for the ghost house', et.c===13&&et.r===11, JSON.stringify(et));

    // full eaten round trip
    const rt=g.ghosts.find(x=>x.ai==='nox');
    // Suspend collisions: a death would rebuild the roster and orphan `rt`.
    const ghostCollide=g.collisionCheck; g.collisionCheck=function(){};
    rt.state='eaten'; rt.frightened=false;
    let sawHouse=false, back=false;
    for(let i=0;i<60*30;i++){ g.update(1/60);
      if(rt.state==='entering'||rt.state==='house') sawHouse=true;
      if(sawHouse && rt.state==='normal') back=true; }
    ok('eaten extra reaches the house', sawHouse, 'state='+rt.state);
    ok('eaten extra returns to play', back, 'state='+rt.state);
    g.collisionCheck=ghostCollide;

    // ---- release schedule ----
    g.reset(1,true); g.state='playing';
    ok('extras hold before their dot count',
       g.ghosts.slice(4).every(x=>x.state==='waiting'));
    g.dotsEaten=90; EG.releaseWaiting(g,false);
    ok('extras enter play once enough dots are eaten',
       g.ghosts.slice(4).every(x=>x.state==='normal'),
       g.ghosts.slice(4).map(x=>x.state).join(','));


    return R;
  });

  /* ---- modes, chat and two-player: a second pass, because matchmaking is
     asynchronous and the block above is synchronous. ---- */
  const more = await p.evaluate(async () => {
    const g=window.pacmanGame, MP=window.Multiplayer, MO=window.Mods, A=window.Autopilot;
    const R=[]; const ok=(n,c,d)=>R.push((c?'PASS':'FAIL')+'  '+n+(d?'   '+d:''));
    const run=n=>{for(let i=0;i<n;i++) g.update(1/60);};
    // ---------- AI mode ----------
    g.startAiGame();
    ok('AI mode starts one player under autopilot', g.playerCount===1 && g.autoPlay);
    g.state='playing'; g.stateTime=0;
    const startDots=g.dotsRemaining;
    let deaths=0, prevLives=g.lives, cleared=0;
    for (let i=0;i<60*90;i++){                 // 90 simulated seconds, played out properly
      g.update(1/60);
      if (g.lives<prevLives){ deaths++; }
      prevLives=g.lives;
      g.lives=Math.max(g.lives,3);             // keep it alive so the run continues
      if (g.state==='levelclear') cleared++;
    }
    const eaten=startDots-g.dotsRemaining+cleared*244;
    ok('autopilot actually plays', eaten>150, 'ate '+eaten+' dots, cleared '+cleared+' level(s) in 90s');
    ok('autopilot survives reasonably', deaths<=6, deaths+' deaths in 90s');

    // it should not steer into a wall
    ok('autopilot never sits inside a wall',
       !window.Maze.isWall(((Math.floor(g.pac.x/8)%28)+28)%28, Math.floor(g.pac.y/8)));

    // ---------- two player ----------
    MP.startTwoPlayer(g);
    ok('2P opens the matching screen', g.state==='matching', 'state='+g.state);
    ok('lobby search starts', MP.state.phase==='searching', MP.state.phase);
    await new Promise(r=>setTimeout(r,2000));
    ok('empty lobby falls back to a CPU opponent',
       MP.state.phase==='nobody' || MP.state.phase==='playing', MP.state.phase);
    ok('opponent has a handle', !!(MP.state.bot && MP.state.bot.handle), MP.state.bot && MP.state.bot.handle);
    for(let i=0;i<120;i++) g.update(1/60);
    ok('match begins', MP.state.phase==='playing', MP.state.phase);
    ok('two players on the board', g.players.length===2, 'n='+g.players.length);
    ok('player two is the bot', g.players[1].auto===true && g.players[1].bow===true);
    ok('player one is not on autopilot', g.players[0].auto===false);

    g.state='playing'; g.stateTime=0;
    const s1=g.score, s2=g.score2;
    run(60*25);
    ok('both players score independently',
       g.score>s1 && g.score2>s2, 'p1 '+s1+'->'+g.score+'  p2 '+s2+'->'+g.score2);

    // per-player death does not stop the round
    const p2=g.players[1];
    g.lives2=3; p2.deadTimer=0; p2.out=false;
    const livesBefore=g.lives2;
    g.die(p2);
    ok('a caught player dies alone', g.state==='playing' && p2.deadTimer>0, 'state='+g.state);
    ok('only that player loses a life', g.lives2===livesBefore-1 && g.lives===g.lives);
    let respawnY=null;
    for(let i=0;i<60*4;i++){ g.update(1/60); if(!p2.dead && respawnY===null) respawnY=p2.y; }
    ok('and respawns at their own start', respawnY!==null && Math.abs(respawnY-(29*8+4))<1,
       'y='+(respawnY===null?'never':respawnY.toFixed(0)));

    // benching and game over
    g.lives2=0; g.die(p2); run(60*3);
    ok('a player out of lives is benched', p2.out===true);
    g.lives=0; g.die(g.players[0]); run(60*3);
    ok('game over once both are out', g.state==='gameover', 'state='+g.state);

    // ---------- chat ----------
    MP.state.log.length=0;
    MP.send('hey');
    ok('player message lands in the log',
       MP.state.log.some(m=>m.who==='you'&&m.text==='hey'));
    for(let i=0;i<300;i++) g.update(1/60);
    ok('opponent replies', MP.state.log.some(m=>m.who==='them'),
       JSON.stringify(MP.state.log.filter(m=>m.who==='them').map(m=>m.text)));

    // it answers game questions with real facts
    const asked=[];
    for (const q of ['how many dots are there','tell me about inky','what is the fruit worth','any tips?']) {
      MP.state.log.length=0; MP.state.pending.length=0;
      MP.send(q);
      for(let i=0;i<400;i++) g.update(1/60);
      const r=MP.state.log.filter(m=>m.who==='them').map(m=>m.text).join(' | ');
      asked.push(q+' -> '+r);
    }
    ok('answers questions about the game',
       asked.every(a=>a.split('-> ')[1] && a.split('-> ')[1].length>12), asked.join('\n     '));


    /* ---- Rampage Pac stays with the player who enabled it ---- */
    MO.state.enabled.rampage = true;
    g.playerCount=2; g.autoPlay=false;
    g.startTwoPlayerGame();
    ok('2P starts with the mod on', g.players.length===2 && MO.isOn('rampage'));
    ok('only player one is the mod owner',
       g.players[0].armedOwner===true && g.players[1].armedOwner===false);

    // level 3 arms player one only
    g.reset(3,false); g.state='ready'; g.stateTime=0;
    run(60*11);
    ok('the cutscene arms the owner', g.pacArmed===true);
    ok('ghosts flee', g.ghostsFlee===true);
    ok('owner still flagged, opponent not',
       g.players[0].armedOwner===true && g.players[1].armedOwner===false);

    // ghosts must ignore the armed player and hunt the other one
    g.state='playing';
    const rp1=g.players[0], rp2=g.players[1];
    rp1.x=6*8+4; rp1.y=5*8+4;
    rp2.x=21*8+4; rp2.y=5*8+4;
    const focused=g.ghosts.map(gh=>g.focusPac(gh).id);
    ok('every ghost hunts the opponent, not the armed player',
       focused.every(id=>id===1), 'focus ids '+focused.join(','));

    // contact is harmless for the owner, lethal for the opponent
    const rgh=g.ghosts[0]; rgh.state='normal'; rgh.frightened=false;
    rgh.x=rp1.x; rgh.y=rp1.y;
    const rlives1=g.lives; g.playerCollisions(rp1);
    ok('the armed player cannot be caught', g.lives===rlives1 && !rp1.dead);

    rgh.x=rp2.x; rgh.y=rp2.y;
    const rlives2=g.lives2; g.playerCollisions(rp2);
    ok('the opponent still plays a normal game', g.lives2===rlives2-1 && rp2.dead===true,
       'lives2 '+rlives2+' -> '+g.lives2);

    // the bot never mentions the mod
    const modLines=[];
    for (let i=0;i<40;i++) modLines.push(window.Chatbot.reply(MP.state.bot||window.Chatbot.create(),'what is going on', g).text);
    for (let i=0;i<12;i++) { const r=window.Chatbot.react(MP.state.bot||window.Chatbot.create(),'playerAte',g); if(r) modLines.push(r.text); }
    const leak=/shotgun|rampage|gun|shoot|mod/i;
    ok('the opponent never references the mod', !modLines.some(l=>leak.test(l)),
       modLines.filter(l=>leak.test(l)).join(' | ') || 'clean across '+modLines.length+' lines');


    /* ---- the agent's planner: it simulates ghosts through the game's own
       decision function, so it must leave no trace on the real ones ---- */
    const AP = window.Autopilot, EG = window.ExtraGhosts;
    EG.ROSTER.forEach(d=>EG.setOn(d.id,true));      // include the extras' AI
    g.startAiGame(); g.state='playing'; g.stateTime=0;
    for(let i=0;i<60*20;i++) g.update(1/60);      // get everyone moving

    const snap = () => ({
      pac: {x:g.pac.x, y:g.pac.y, dir:g.pac.dir, want:g.pac.want},
      ghosts: g.ghosts.map(x=>({x:x.x,y:x.y,dir:x.dir,state:x.state,
        frightened:x.frightened, focusId:x.focusId, stalk:x.stalk,
        patrolIndex:x.patrolIndex, recent:(x.recent||[]).join('|')}))
    });
    const before = JSON.stringify(snap());
    for (let i=0;i<50;i++) AP.choose(g, g.pac, 1);   // plan repeatedly
    const after = JSON.stringify(snap());
    ok('planning never disturbs the real ghosts or Pac-Man', before===after,
       before===after ? '' : 'state drifted');

    // it must still return a legal direction
    const dirs=new Set();
    for (let i=0;i<30;i++){ const d=AP.choose(g,g.pac,1); if(d) dirs.add(d); }
    ok('planner returns legal directions',
       [...dirs].every(d=>['up','down','left','right'].includes(d)), [...dirs].join(','));

    // energiser policy: leave it alone when nobody is near
    g.reset(1,true); g.state='playing';
    g.ghosts.forEach(x=>{ x.state='house'; });     // no hunters at all
    g.pac.x=1*8+4; g.pac.y=5*8+4; g.pac.dir='down';
    // clear a lane of dots so the energiser at (1,3) is the obvious prize
    for(let r=1;r<6;r++) g.dots[r][1]=0;
    g.dots[3][1]=2;
    let wentUp=0;
    for(let i=0;i<20;i++){ if(AP.choose(g,g.pac,1)==='up') wentUp++; }
    ok('an energiser with no ghosts near is not worth a detour', wentUp===0,
       wentUp+'/20 planned toward it');

    // ...but it is when two hunters are converging on it
    g.reset(1,true); g.state='playing';
    for(let r=1;r<6;r++) g.dots[r][1]=0;
    g.dots[3][1]=2;
    g.pac.x=1*8+4; g.pac.y=5*8+4; g.pac.dir='down';
    g.ghosts.forEach((x,i)=>{ x.state = i<2 ? 'normal':'house'; x.frightened=false; });
    g.ghosts[0].x=1*8+4; g.ghosts[0].y=8*8+4; g.ghosts[0].dir='up';
    g.ghosts[1].x=3*8+4; g.ghosts[1].y=5*8+4; g.ghosts[1].dir='left';
    let toEnerg=0;
    for(let i=0;i<20;i++){ if(AP.choose(g,g.pac,1)==='up') toEnerg++; }
    ok('with hunters closing, the energiser becomes the plan', toEnerg>10,
       toEnerg+'/20 planned toward it');

    return R;
  });
  out.push(...more);

  out.unshift((fontAudit.missing.length ? 'FAIL' : 'PASS') +
    '  font covers every displayed string   ' + fontAudit.count + ' literals' +
    (fontAudit.missing.length ? ', missing ' + JSON.stringify(fontAudit.missing) : ''));
  out.forEach(l=>console.log(l));
  const fails = out.filter(l=>l.startsWith('FAIL'));
  console.log('\n'+(out.length-fails.length)+'/'+out.length+' passed');
  if (errs.length) console.log('PAGE ERRORS:\n'+errs.join('\n'));
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
