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
    ok('title menu moves to MODS', g.titleIndex===1);
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

    return R;
  });
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
