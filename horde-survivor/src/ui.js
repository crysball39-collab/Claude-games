'use strict';
/* =============================================================================
   The DOM side: the three menu sections (Main, Equipment, Shop), the HUD,
   level up cards, pause, results, the item sheet, chest opening, settings.
   ========================================================================== */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UI = (() => {
  const el = {};
  const cache = {};
  const newUids = new Set();
  let tab = 'main';
  let modalItem = null, salvageArmed = false;
  let chestItem = null, chestPhase = 0, chestTimer = 0;
  let bannerTimer = 0, warnTimer = 0, toastTimer = 0, lastHurt = 0, luOpenedAt = 0, luLock = false;
  let artW = 0;

  const IDS = ['hud', 'menu', 'hudTop', 'xpFill', 'xpLv', 'hudKills', 'hudTimer', 'hudGold', 'bossBar', 'bossName', 'bossFill',
    'banner', 'warning', 'warningName', 'menuGold', 'menuGems', 'chapterArt', 'chapterBest', 'chapterCleared', 'bossTrack',
    'slotsLeft', 'slotsRight', 'heroCanvas', 'statAtk', 'statHp', 'setLine', 'invGrid', 'invCount', 'chestText', 'chestPool',
    'chestCost', 'btnBuyChest', 'levelUp', 'luChoices', 'luAbilities', 'luBuffs', 'pause', 'pTime', 'pKills', 'pLevel', 'pAbilities',
    'pBuffs', 'quitConfirm', 'results', 'resPanel', 'resTitle', 'resTime', 'resKills', 'resLevel', 'resBest', 'resRewards',
    'itemModal', 'imIcon', 'imRarity', 'imName', 'imSub', 'imStatLabel', 'imStat', 'imLevel', 'imNext', 'imNote', 'imEquip',
    'imUpgrade', 'imCost', 'imSalvage', 'chestModal', 'chestStage', 'chestAnim', 'lootCard', 'lootIcon', 'lootName', 'lootStat',
    'lootSub', 'lootButtons', 'lootEquip', 'tapHint', 'settings', 'setSound', 'setNumbers', 'resetConfirm', 'toast', 'hurtFx', 'flashFx'];

  /* ---------------------------------- setup -------------------------------- */

  function init() {
    IDS.forEach(id => { el[id] = $(id); });
    buildIcons();
    document.querySelectorAll('img[data-icon]').forEach(img => { const k = img.dataset.icon; if (ICON[k]) img.src = ICON[k]; });

    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); showTab(b.dataset.tab); }));
    $('btnPlay').addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); startGame(); });
    $('btnSettings').addEventListener('click', openSettings);
    el.btnBuyChest.addEventListener('click', buyChest);
    $('btnPause').addEventListener('click', pauseGame);
    $('btnResume').addEventListener('click', resumeGame);
    $('btnQuit').addEventListener('click', () => { el.quitConfirm.hidden = false; Sfx.play('click'); });
    $('btnQuitNo').addEventListener('click', () => { el.quitConfirm.hidden = true; Sfx.play('click'); });
    $('btnQuitYes').addEventListener('click', quitRun);
    $('btnResults').addEventListener('click', () => { Sfx.play('click'); el.results.hidden = true; backToMenu(); });

    el.imEquip.addEventListener('click', itemEquipToggle);
    el.imUpgrade.addEventListener('click', itemUpgrade);
    el.imSalvage.addEventListener('click', itemSalvage);
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; Sfx.play('click'); }));
    ['itemModal', 'settings'].forEach(id => $(id).addEventListener('click', e => { if (e.target.id === id) $(id).hidden = true; }));

    const pickSlot = e => {
      const b = e.target.closest('[data-uid], [data-slot]');
      if (!b) return;
      if (b.dataset.uid) openItem(b.dataset.uid);
      else { Sfx.play('click'); toast(`Nothing in your ${SLOT_BY_ID[b.dataset.slot].name} slot yet. Open chests in the Shop.`); }
    };
    el.slotsLeft.addEventListener('click', pickSlot);
    el.slotsRight.addEventListener('click', pickSlot);
    el.invGrid.addEventListener('click', pickSlot);

    el.chestModal.addEventListener('click', e => { if (chestPhase === 1) reveal(); else if (chestPhase === 2 && e.target === el.chestModal) closeChest(); });
    $('lootOk').addEventListener('click', e => { e.stopPropagation(); closeChest(); });
    el.lootEquip.addEventListener('click', e => { e.stopPropagation(); if (chestItem) equip(chestItem); closeChest(); showTab('equip'); });

    el.setSound.addEventListener('change', () => { SAVE.settings.sound = el.setSound.checked; persist(); if (SAVE.settings.sound) { Sfx.unlock(); Sfx.play('click'); } });
    el.setNumbers.addEventListener('change', () => { SAVE.settings.numbers = el.setNumbers.checked; persist(); });
    $('btnReset').addEventListener('click', () => { el.resetConfirm.hidden = false; });
    $('btnResetNo').addEventListener('click', () => { el.resetConfirm.hidden = true; });
    $('btnResetYes').addEventListener('click', () => {
      SAVE = defaultSave(); persist(); newUids.clear();
      el.resetConfirm.hidden = true; el.settings.hidden = true;
      renderAll(); toast('Progress erased. You start again with a Wood Shuriken and 80 gems.');
    });

    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (Game.mode === 'run' && run) { if (run.state === 'play') pauseGame(); else if (run.state === 'paused') resumeGame(); }
      else if (e.code === 'Escape') { el.itemModal.hidden = true; el.settings.hidden = true; }
    });

    el.chestText.textContent = CHESTS.normal.text;
    el.chestCost.textContent = CHESTS.normal.cost;
    el.chestPool.innerHTML = CHESTS.normal.pool.map(t => `<img alt="${esc(ITEMS[t].name)}" title="${esc(ITEMS[t].name)}" src="${ICON[t]}">`).join('');
    buildBossTrack();
  }

  function portrait(canvas, w, h, ax, ay, draw, fit = 0.95) {
    const res = Math.min(canvas.width / w, canvas.height / h) * fit;
    const s = makeSprite(w, h, ax, ay, draw, res);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(s.c, Math.round((canvas.width - s.c.width) / 2), Math.round((canvas.height - s.c.height) / 2));
  }

  function buildBossTrack() {
    const art = {
      dreadnought: [120, 112, 52, 108, g => { g.translate(0, -4); drawDreadnought(g, 0, 'walk'); }],
      mothra: [160, 130, 80, 62, g => drawMothra(g, 0)],
      titanus: [200, 140, 90, 132, g => drawTitanus(g, 1)],
    };
    el.bossTrack.innerHTML = '';
    for (const b of CHAPTERS[0].bosses) {
      const li = document.createElement('li');
      li.innerHTML = `<canvas width="128" height="112"></canvas><b>${fmtTime(b.at)}</b><span>${esc(BOSSES[b.id].name)}</span>`;
      el.bossTrack.appendChild(li);
      const a = art[b.id];
      portrait(li.querySelector('canvas'), a[0], a[1], a[2], a[3], a[4], 1);
    }
  }

  /* --------------------------------- menus --------------------------------- */

  function showTab(name) {
    tab = name;
    for (const t of ['main', 'equip', 'shop']) $('tab-' + t).hidden = t !== name;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'main') renderMain();
    if (name === 'equip') renderEquip();
    if (name === 'shop') renderShop();
  }

  function renderAll() { refreshCurrencies(); renderMain(); renderEquip(); renderShop(); }

  function refreshCurrencies() {
    el.menuGold.textContent = fmtNum(SAVE.gold);
    el.menuGems.textContent = fmtNum(SAVE.gems);
  }

  function renderMain() {
    const id = CHAPTERS[0].id, best = SAVE.best[id] || 0, cleared = SAVE.cleared[id] || 0;
    el.chapterBest.innerHTML = `Best <b>${best ? fmtTime(best) : '--:--'}</b>`;
    el.chapterCleared.hidden = !cleared;
    el.chapterCleared.textContent = cleared > 1 ? `Cleared ×${cleared}` : 'Cleared';
    const c = el.chapterArt, w = c.clientWidth;
    if (w > 0 && Math.abs(w - artW) > 2) {
      artW = w;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w * dpr); c.height = Math.round(c.clientHeight * dpr);
      drawCityBanner(c);
    }
  }

  function renderEquip() {
    const t = gearTotals();
    el.statAtk.textContent = t.atk;
    el.statHp.textContent = t.hp;
    const slotHTML = s => {
      const it = equippedItem(s.id);
      if (!it) return `<button class="slot empty" data-slot="${s.id}" aria-label="${s.name}: empty"><img alt="" src="${ICON['slot_' + s.id]}"><span class="slot-name">${s.name}</span></button>`;
      return `<button class="slot" data-uid="${it.uid}" aria-label="${s.name}: ${esc(ITEMS[it.type].name)}"><img alt="" src="${ICON[it.type]}"><span class="slot-lv">Lv${it.level}</span><span class="slot-name">${s.name}</span></button>`;
    };
    el.slotsLeft.innerHTML = SLOTS.filter(s => s.stat === 'atk').map(slotHTML).join('');
    el.slotsRight.innerHTML = SLOTS.filter(s => s.stat === 'hp').map(slotHTML).join('');
    const worn = SLOTS.filter(s => { const it = equippedItem(s.id); return it && ITEMS[it.type].set === 'torn'; }).length;
    el.setLine.textContent = `Torn Leather set: ${worn} / 6 worn`;
    const order = Object.fromEntries(SLOTS.map((s, i) => [s.id, i]));
    const inv = SAVE.items.filter(i => !isEquipped(i)).sort((a, b) => order[ITEMS[a.type].slot] - order[ITEMS[b.type].slot] || b.level - a.level);
    el.invCount.textContent = inv.length === 1 ? '1 item' : `${inv.length} items`;
    el.invGrid.innerHTML = inv.length ? inv.map(i => `<button class="item-tile" data-uid="${i.uid}" aria-label="${esc(ITEMS[i.type].name)}, level ${i.level}"><img alt="" src="${ICON[i.type]}"><span class="tile-lv">Lv${i.level}</span>${newUids.has(i.uid) ? '<span class="tile-new">NEW</span>' : ''}</button>`).join('')
      : '<div class="inv-empty">Gear you are not wearing shows up here. Open a Normal Chest in the Shop to find more.</div>';
    if (el.heroCanvas.dataset.drawn !== '1') {
      el.heroCanvas.dataset.drawn = '1';
      portrait(el.heroCanvas, 44, 58, 22, 52, g => drawSurvivor(g, 0, false), 0.98);
    }
  }

  function renderShop() {
    el.btnBuyChest.classList.toggle('disabled', SAVE.gems < CHESTS.normal.cost);
  }

  function toast(msg) {
    const t = el.toast;
    t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  function openSettings() {
    Sfx.unlock(); Sfx.play('click');
    el.setSound.checked = !!SAVE.settings.sound;
    el.setNumbers.checked = !!SAVE.settings.numbers;
    el.resetConfirm.hidden = true;
    el.settings.hidden = false;
  }

  /* ---------------------------------- gear --------------------------------- */

  function equip(it) {
    SAVE.equipped[ITEMS[it.type].slot] = it.uid;
    persist();
    renderEquip();
  }

  function openItem(uid) {
    const it = itemByUid(uid);
    if (!it) return;
    modalItem = it; salvageArmed = false;
    newUids.delete(uid);
    fillItem();
    el.itemModal.hidden = false;
    Sfx.play('click');
  }

  function fillItem() {
    const it = modalItem, d = ITEMS[it.type], slot = SLOT_BY_ID[d.slot], max = itemMax(it), eq = isEquipped(it);
    el.imIcon.src = ICON[it.type];
    el.imName.textContent = d.name;
    el.imRarity.textContent = RARITIES[d.rarity].name;
    el.imSub.textContent = `${slot.name} · ${SETS[d.set].name} set${eq ? ' · Equipped' : ''}`;
    el.imStatLabel.textContent = slot.stat === 'atk' ? 'Damage (ATK)' : 'Health (HP)';
    el.imStat.textContent = '+' + itemStat(it);
    el.imLevel.textContent = `Level ${it.level} / ${max}`;
    el.imNext.textContent = it.level < max ? `Next level: +${itemStat({ type: it.type, level: it.level + 1 })}` : 'Max level';
    el.imNote.textContent = d.note || (slot.stat === 'atk' ? 'Raises the damage of your weapon and every ability.' : 'Raises your maximum HP.');
    if (eq && d.slot === 'weapon') { el.imEquip.textContent = 'Equipped'; el.imEquip.classList.add('disabled'); }
    else { el.imEquip.textContent = eq ? 'Unequip' : 'Equip'; el.imEquip.classList.remove('disabled'); }
    const cost = upgradeCost(it.level);
    if (it.level >= max) { el.imCost.textContent = 'MAX'; el.imUpgrade.classList.add('disabled'); }
    else { el.imCost.textContent = cost; el.imUpgrade.classList.toggle('disabled', SAVE.gold < cost); }
    el.imSalvage.hidden = eq;
    const v = salvageValue(it);
    el.imSalvage.textContent = salvageArmed ? `Tap again to salvage for ${v} gold` : `Salvage for ${v} gold`;
    el.imSalvage.classList.toggle('armed', salvageArmed);
  }

  function itemEquipToggle() {
    const it = modalItem, d = ITEMS[it.type];
    if (isEquipped(it)) {
      if (d.slot === 'weapon') { toast('You always need a weapon. Equip another one to swap.'); return; }
      SAVE.equipped[d.slot] = null;
    } else SAVE.equipped[d.slot] = it.uid;
    persist(); Sfx.play('pick');
    renderEquip(); fillItem();
  }

  function itemUpgrade() {
    const it = modalItem;
    if (it.level >= itemMax(it)) { toast('This item is at its max level.'); return; }
    const cost = upgradeCost(it.level);
    if (SAVE.gold < cost) { toast(`You need ${cost - SAVE.gold} more gold. Every enemy you defeat drops 1 gold.`); Sfx.play('click'); return; }
    SAVE.gold -= cost; it.level++;
    persist(); Sfx.play('buy');
    refreshCurrencies(); renderEquip(); fillItem();
  }

  function itemSalvage() {
    const it = modalItem;
    if (isEquipped(it)) return;
    if (!salvageArmed) { salvageArmed = true; fillItem(); return; }
    const v = salvageValue(it);
    SAVE.items = SAVE.items.filter(i => i.uid !== it.uid);
    SAVE.gold += v;
    persist(); Sfx.play('coin');
    el.itemModal.hidden = true;
    refreshCurrencies(); renderEquip();
    toast(`Salvaged ${ITEMS[it.type].name} for ${v} gold.`);
  }

  /* --------------------------------- chests -------------------------------- */

  function buyChest() {
    Sfx.unlock();
    const c = CHESTS.normal;
    if (SAVE.gems < c.cost) { Sfx.play('click'); toast(`You need ${c.cost - SAVE.gems} more gems. Finishing a chapter pays ${CHAPTERS[0].reward.gems}.`); return; }
    SAVE.gems -= c.cost;
    const it = newItem(pick(c.pool));
    SAVE.items.push(it);
    SAVE.stats.chests++;
    persist();
    newUids.add(it.uid);
    chestItem = it;
    refreshCurrencies(); renderShop(); renderEquip();
    el.chestStage.className = 'chest-stage shaking';
    el.chestAnim.src = ICON.chestBig;
    el.lootCard.hidden = true; el.lootButtons.hidden = true;
    el.tapHint.hidden = false; el.tapHint.textContent = 'Opening…';
    el.chestModal.hidden = false;
    chestPhase = 1;
    Sfx.play('chest');
    clearTimeout(chestTimer);
    chestTimer = setTimeout(reveal, 950);
  }

  function reveal() {
    if (chestPhase !== 1) return;
    chestPhase = 2; clearTimeout(chestTimer);
    el.chestStage.className = 'chest-stage open';
    el.chestAnim.src = ICON.chestOpen;
    const it = chestItem, d = ITEMS[it.type], slot = SLOT_BY_ID[d.slot];
    el.lootIcon.src = ICON[it.type];
    el.lootName.textContent = d.name;
    el.lootStat.textContent = (slot.stat === 'atk' ? 'ATK +' : 'HP +') + itemStat(it);
    el.lootSub.textContent = `${slot.name} · Torn Leather set`;
    const cur = equippedItem(d.slot);
    el.lootEquip.hidden = !!cur && itemStat(cur) >= itemStat(it);
    el.lootEquip.textContent = cur ? 'Swap in' : 'Equip';
    el.lootCard.hidden = false; el.lootButtons.hidden = false; el.tapHint.hidden = true;
    Sfx.play('pick');
  }

  function closeChest() {
    chestPhase = 0;
    el.chestModal.hidden = true;
    renderEquip();
  }

  /* ----------------------------------- run --------------------------------- */

  function enterRun() {
    for (const k in cache) delete cache[k];
    el.menu.hidden = true;
    el.hud.hidden = false;
    el.bossBar.hidden = true; el.banner.hidden = true; el.warning.hidden = true;
    for (const id of ['levelUp', 'pause', 'results', 'itemModal', 'chestModal', 'settings']) el[id].hidden = true;
  }

  function exitRun() {
    el.hud.hidden = true;
    for (const id of ['levelUp', 'pause', 'results']) el[id].hidden = true;
    el.menu.hidden = false;
    renderAll();
    showTab(tab);
  }

  function setT(key, v, node) { if (cache[key] !== v) { cache[key] = v; node.textContent = v; } }

  function hud() {
    const R = run;
    if (!R) return;
    setT('t', fmtTime(R.t), el.hudTimer);
    const cls = R.boss || R.intro ? 'hud-timer boss' : R.inBig ? 'hud-timer wave' : 'hud-timer';
    if (cache.tc !== cls) { cache.tc = cls; el.hudTimer.className = cls; }
    setT('k', fmtNum(R.kills), el.hudKills);
    setT('g', fmtNum(R.gold), el.hudGold);
    setT('lv', 'Lv ' + R.p.level, el.xpLv);
    const xp = Math.round(clamp(R.p.exp / R.p.next, 0, 1) * 200) / 2;
    if (cache.xp !== xp) { cache.xp = xp; el.xpFill.style.width = xp + '%'; }
    if (R.boss) {
      const b = Math.round(clamp(R.boss.hp / R.boss.maxHp, 0, 1) * 400) / 4;
      if (cache.b !== b) { cache.b = b; el.bossFill.style.width = b + '%'; }
    }
  }

  function hudHeight() {
    if (el.hud.hidden) return 0;
    const top = el.hud.getBoundingClientRect().top;
    return el.hudTop.getBoundingClientRect().bottom - top + 4;
  }

  function banner(text, kind) {
    const b = el.banner;
    b.hidden = true; void b.offsetWidth;
    b.textContent = text;
    b.className = 'banner' + (kind === 'good' ? ' good' : '');
    b.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.hidden = true; }, 2600);
  }

  function bossWarning(name) {
    el.warningName.textContent = name;
    el.warning.hidden = true; void el.warning.offsetWidth;
    el.warning.hidden = false;
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => { el.warning.hidden = true; }, 2600);
  }

  function showBossBar(name) { el.bossName.textContent = name; el.bossFill.style.width = '100%'; cache.b = 100; el.bossBar.hidden = false; }
  function hideBossBar() { el.bossBar.hidden = true; }

  function hurt() {
    const now = performance.now();
    if (now - lastHurt < 160) return;
    lastHurt = now;
    el.hurtFx.classList.remove('on'); void el.hurtFx.offsetWidth; el.hurtFx.classList.add('on');
  }
  function flash(color) {
    el.flashFx.style.background = color || '#fff';
    el.flashFx.classList.remove('on'); void el.flashFx.offsetWidth; el.flashFx.classList.add('on');
  }

  function starsHTML(n, total = MAX_STARS) {
    let s = '<div class="stars" aria-label="Level ' + n + ' of ' + total + '">';
    for (let i = 1; i <= total; i++) s += `<i class="${i < n ? 'on' : i === n ? 'next' : ''}">★</i>`;
    return s + '</div>';
  }

  function fillOwned(abRow, bfRow) {
    const R = run;
    let a = '', b = '';
    for (let i = 0; i < MAX_HELD; i++) {
      const id = R.abOrder[i];
      if (id) {
        const s = R.ab[id];
        a += `<div class="owned-slot ${s.evo ? 'evo' : 'ability'}" title="${esc(s.evo ? ABILITIES[id].evo : ABILITIES[id].name)}"><img alt="" src="${ICON[s.evo ? id + '_evo' : id]}"><span class="mini-stars">${s.evo ? 'EVO' : '★'.repeat(s.lv)}</span></div>`;
      } else a += '<div class="owned-slot"></div>';
      const bid = R.bfOrder[i];
      if (bid) b += `<div class="owned-slot buff" title="${esc(BUFFS[bid].name)}"><img alt="" src="${ICON[bid]}"><span class="mini-stars">${'★'.repeat(R.bf[bid])}</span></div>`;
      else b += '<div class="owned-slot"></div>';
    }
    abRow.innerHTML = a; bfRow.innerHTML = b;
  }

  function showLevelUp(offers) {
    luOpenedAt = performance.now(); luLock = false;
    el.luChoices.innerHTML = '';
    for (const o of offers) {
      const info = offerInfo(o);
      const b = document.createElement('button');
      b.className = 'choice' + (o.type === 'buff' ? ' buff' : o.type === 'evo' ? ' evo' : (o.type === 'heal' || o.type === 'gold') ? ' supply' : '');
      const tag = o.type === 'evo' ? '<span class="choice-tag evo">EVOLUTION</span>' : info.isNew ? '<span class="choice-tag new">NEW</span>' : info.kind === 'Buff' || info.kind === 'Ability' ? `<span class="choice-tag">${info.kind.toUpperCase()}</span>` : '';
      b.innerHTML = `${tag}<div class="choice-icon"><img alt="" src="${info.icon}"></div><div class="choice-body"><div class="choice-name outlined">${esc(info.name)}</div>${info.stars ? starsHTML(info.stars) : ''}<p class="choice-text">${esc(info.text)}</p>${info.hint ? `<p class="choice-hint">${esc(info.hint)}</p>` : ''}</div>`;
      b.addEventListener('click', () => {
        if (luLock || performance.now() - luOpenedAt < 280) return;
        luLock = true;
        Sfx.play('pick');
        chooseOffer(o);
      });
      el.luChoices.appendChild(b);
    }
    fillOwned(el.luAbilities, el.luBuffs);
    el.levelUp.hidden = false;
  }
  function hideLevelUp() { el.levelUp.hidden = true; }

  function pauseGame() {
    if (!run || run.state !== 'play') return;
    run.state = 'paused';
    Input.reset();
    el.pTime.textContent = fmtTime(run.t);
    el.pKills.textContent = run.kills;
    el.pLevel.textContent = run.p.level;
    fillOwned(el.pAbilities, el.pBuffs);
    el.quitConfirm.hidden = true;
    el.pause.hidden = false;
    Sfx.play('click');
  }
  function resumeGame() {
    if (!run || run.state !== 'paused') return;
    el.pause.hidden = true;
    run.state = 'play';
    Sfx.play('click');
  }
  function quitRun() {
    el.pause.hidden = true;
    if (run && !run.result) { run.state = 'quit'; finishRun(false); }
  }

  function showResults(res) {
    el.levelUp.hidden = true; el.pause.hidden = true;
    el.resPanel.className = 'panel results-panel' + (res.won ? ' won' : '');
    el.resTitle.textContent = res.won ? 'Chapter cleared!' : 'Defeated';
    el.resTime.textContent = fmtTime(res.time);
    el.resKills.textContent = fmtNum(res.kills);
    el.resLevel.textContent = res.level;
    el.resBest.hidden = !(res.newBest && res.time >= 1);
    const row = (icon, label, v) => `<div class="reward"><img alt="" src="${ICON[icon]}"><span>${label}</span><b>+${fmtNum(v)}</b></div>`;
    let h = row('coin', 'Gold from kills', res.goldRun);
    if (res.won) { h += row('coin', 'Chapter reward', res.goldBonus); h += row('gem', 'Chapter reward', res.gems); }
    el.resRewards.innerHTML = h;
    el.results.hidden = false;
  }

  return {
    init, renderAll, showTab, toast, enterRun, exitRun, hud, hudHeight, banner, bossWarning, showBossBar, hideBossBar,
    hurt, flash, showLevelUp, hideLevelUp, pauseGame, resumeGame, showResults, renderMain,
  };
})();
