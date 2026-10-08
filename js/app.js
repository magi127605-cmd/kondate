/* 献立アプリ 本体
   - 倉庫との窓口（合言葉が鍵。km_* の関数だけを呼ぶ）
   - 端末内の控え（localStorage "km.v1"）。電波がなくても前回の献立を開ける
   - 画面: 今日／献立／買い物／体重／過去
*/
(function () {
  'use strict';
  const CFG = window.KM_CONFIG;
  const KEY = 'km.v1';
  const HOUR = 36e5, DAY = 864e5;
  const AXES = [['taste', '味'], ['fill', '満腹感'], ['last', '腹持ち'], ['ease', '作りやすさ'], ['again', 'また食べたい']];

  // ---------- 端末内の控え ----------
  const S = (function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    return Object.assign({ v: 1, code: null, data: null, syncedAt: 0, mw: '500' }, s || {});
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 容量不足など */ } }

  // ---------- 窓口 ----------
  const ERR = { invalid_code: '合言葉が違います', not_found: '献立が見つかりません', too_large: '書き込みが大きすぎます' };
  async function rpc(name, params) {
    const r = await fetch(`${CFG.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    if (!r.ok) {
      const m = (j && (j.message || j.hint || j.details)) || txt || ('HTTP ' + r.status);
      const k = Object.keys(ERR).find(x => m.includes(x));
      const e = new Error(k ? ERR[k] : ('通信エラー: ' + m)); e.code = k || 'http'; throw e;
    }
    return j;
  }

  // ---------- 便利 ----------
  const $ = s => document.querySelector(s);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2400); }
  function jstKey(ts) { return new Date((ts == null ? Date.now() : ts) + 9 * HOUR).toISOString().slice(0, 10); }
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function wd(key) { return WD[new Date(key + 'T00:00:00Z').getUTCDay()]; }
  function md(key) { return key.slice(5).replace('-', '/'); }
  function fmtN(n, d) { return Number(n).toFixed(d == null ? 1 : d); }

  // ---------- 起動 ----------
  const params = new URLSearchParams(location.search);
  const pastId = params.get('plan');   // 過去の献立を見ているとき
  let PLAN = null, STATE = {}, viewingPast = false;

  async function boot() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!S.code) return showLogin();
    $('#views').hidden = false; $('#tabbar').hidden = false;
    if (S.data) renderAll(S.data, true);
    try {
      const d = await rpc('km_sync', { p_code: S.code });
      S.data = d; S.syncedAt = Date.now(); save();
      if (pastId) {
        const p = await rpc('km_get_plan', { p_code: S.code, p_plan_id: pastId });
        d._past = p;
      }
      renderAll(d, false);
    } catch (e) {
      if (e.code === 'invalid_code') { S.code = null; S.data = null; save(); return showLogin(e.message); }
      if (!S.data) { $('#v-today').innerHTML = `<p class="note">${esc(e.message)}。電波のある所でもう一度開いてください。</p>`; }
      else toast('前回の控えを表示しています');
    }
  }

  function showLogin(msg) {
    $('#login').hidden = false; $('#views').hidden = true; $('#tabbar').hidden = true;
    if (msg) $('#loginmsg').textContent = msg;
    $('#loginform').onsubmit = async ev => {
      ev.preventDefault();
      const code = $('#code').value.trim();
      if (!code) return;
      $('#loginmsg').textContent = '確認中…';
      try {
        const d = await rpc('km_sync', { p_code: code });
        S.code = code.toUpperCase().replace(/[^A-Z0-9]/g, ''); S.data = d; S.syncedAt = Date.now(); save();
        location.reload();
      } catch (e) { $('#loginmsg').textContent = e.message; }
    };
  }

  // 一度だけ描く（タイマー・盛り付け計算は描いた後に1回だけ組み込む）
  let drawn = false;
  function renderAll(d, fromCache) {
    const past = d._past;
    viewingPast = !!past;
    PLAN = past ? past.plan : d.plan;
    STATE = (past ? past.state : d.state) || {};
    if (drawn) { refreshState(); renderToday(d); renderWeight(d); renderPast(d); return; }
    renderToday(d); renderPlan(); renderShop(); renderWeight(d); renderPast(d);
    route();
    if (PLAN) loadWidgets();
    drawn = true;
  }

  // ---------- 画面の切り替え ----------
  function route() {
    const v = (location.hash || '#today').slice(1).split('/')[0] || 'today';
    document.querySelectorAll('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
    document.querySelectorAll('#tabbar button').forEach(b => { if (b.dataset.go === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const sub = (location.hash || '').split('/')[1];
    if (v === 'plan' && sub) selectDay(sub);
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);
  document.querySelectorAll('#tabbar button').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go; }));

  // ---------- 今日 ----------
  function planDayFor(key) {
    if (!PLAN) return null;
    return (PLAN.payload.days || []).find(x => x.date === key) || null;
  }
  function renderToday(d) {
    const key = jstKey();
    const cur = d.plan;
    const pd = cur ? (cur.payload.days || []).find(x => x.date === key) : null;
    const box = $('#v-today');
    let h = `<header class="apphead"><div class="eyebrow">${md(key)}（${wd(key)}）</div><h1>今日の献立</h1></header>`;
    if (viewingPast) h += `<div class="pastbar">過去の献立 #${esc(PLAN.no)} を見ています <a href="./">今週に戻る</a></div>`;
    if (!cur) {
      h += `<div class="card pad"><p>まだ献立が届いていません。社長が載せたら、ここに出ます。</p></div>`;
    } else if (pd) {
      h += `<a class="todaycard" href="#plan/${pd.key}"><span class="lab">今夜</span><b>${esc(pd.main)}</b><span class="sub">所要 約${pd.minutes}分 ・ 段取りを開く →</span></a>`;
    } else {
      const next = (cur.payload.days || []).find(x => x.date > key);
      h += `<div class="card pad"><p>今日は献立の日ではありません${['火', '水'].includes(wd(key)) ? '（休み）' : ''}。</p>` +
        (next ? `<p class="note">次は ${md(next.date)}（${next.label}）の「${esc(next.main)}」。</p>` : `<p class="note">今週の献立（#${cur.no}）は ${md(cur.end_date)} で終わり。次の献立は社長が月曜に作る。</p>`) + `</div>`;
    }
    // 夫の今日の指示
    if (cur) {
      const P = cur.payload;
      // 1日1,700kcalを割る日は、昼→夜の順にごはんを100→150g（+78kcal）にする（knowledge/00-profile.md「指示制」）
      const RICE_ADD = 78, RICE_P = 1.4;
      const lunch = (P.lunch || []).map(x => Object.assign({}, x)).sort((a, b) => (a.name.includes('【朝】') ? 0 : 1) - (b.name.includes('【朝】') ? 0 : 1));
      const base = lunch.reduce((a, x) => a + x.kcal, 0) + (pd ? pd.husband_dinner_kcal + P.extra_night.kcal : 0);
      let lunchUp = false, dinnerUp = false;
      if (pd && base < 1700) { lunchUp = true; if (base + RICE_ADD < 1700) dinnerUp = true; }
      if (lunchUp) { const r = lunch.find(x => x.name.includes('ごはん')); if (r) { r.name = r.name.replace('100g', '150g'); r.kcal += RICE_ADD; r.p += RICE_P; } }
      let tk = 0, tp = 0;
      let rows = lunch.map(x => { tk += x.kcal; tp += x.p; return `<tr><td>${esc(x.name)}</td><td class="q">${x.kcal}</td><td class="q">${fmtN(x.p)}g</td></tr>`; }).join('');
      if (pd) {
        const dk = pd.husband_dinner_kcal + (dinnerUp ? RICE_ADD : 0), dp = pd.husband_dinner_p + (dinnerUp ? RICE_P : 0);
        tk += dk + P.extra_night.kcal; tp += dp;
        rows += `<tr><td>【夜】${esc(pd.main)}（献立の夫の分・ごはん${dinnerUp ? '150' : '100'}g）</td><td class="q">${dk}</td><td class="q">${fmtN(dp)}g</td></tr>`;
        rows += `<tr><td>【夜】${esc(P.extra_night.name)}</td><td class="q">${P.extra_night.kcal}</td><td class="q">—</td></tr>`;
        pd._riceNote = lunchUp ? `<b>今日は${dinnerUp ? '昼と夜' : '昼'}のごはんを150gに</b>（1,700kcalに届かせるため）。` : '';
      } else {
        rows += `<tr><td>【夜】献立のない日：外食・残り物でも、たんぱく質の多いものを</td><td class="q">—</td><td class="q">—</td></tr>`;
      }
      rows += `<tr class="tot"><td>合計${pd ? '' : '（昼まで）'}</td><td class="q">${tk.toLocaleString()}</td><td class="q">${fmtN(tp, 0)}g</td></tr>`;
      h += `<h3 class="blk">夫の今日の指示</h3><div class="card"><div class="tblwrap"><table><thead><tr><th>食べるもの</th><th class="q">kcal</th><th class="q">たんぱく質</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      h += `<p class="note">1日 1,700kcal より下げない（骨の回復中）。${pd && pd._riceNote ? pd._riceNote : ''}指示から外れた日は、翌朝の朝礼で「違ったものだけ」言えばいい。</p>`;
      h += `<div class="card pad exnote"><b>運動</b>：やり方・量は自分の感覚で。<b>1日 約240kcal分</b>（速歩きや傾斜をつけたトレッドミルで約1時間が目安）動けば、火曜に4,000kcal食べても<b>週0.3kg</b>のペースで脂肪が落ちる。痛み・腫れが出たら休む。</div>`;
    }
    // 体重をすぐ入れる
    const w = (d.weights || []).slice(-1)[0];
    h += `<h3 class="blk">今朝の体重</h3><form class="wquick" id="wquick"><input type="number" step="0.1" min="30" max="150" id="wq-kg" placeholder="kg" inputmode="decimal"><input type="number" step="0.1" min="3" max="60" id="wq-fat" placeholder="体脂肪%" inputmode="decimal"><button type="submit">記録</button></form>` +
      `<p class="note">${w ? `前回 ${md(w.day)}：${fmtN(w.kg)}kg${w.fat_pct ? '・' + fmtN(w.fat_pct) + '%' : ''}` : 'まだ記録がありません'}。起きてトイレの後に量る。</p>`;
    h += `<p class="syncnote">${S.syncedAt ? '最終更新 ' + new Date(S.syncedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>`;
    box.innerHTML = h;
    $('#wquick').onsubmit = ev => { ev.preventDefault(); saveWeight(jstKey(), $('#wq-kg').value, $('#wq-fat').value); };
  }

  // ---------- 献立 ----------
  function renderPlan() {
    const box = $('#v-plan');
    if (!PLAN) { box.innerHTML = '<p class="note">まだ献立が届いていません。</p>'; return; }
    const P = PLAN.payload;
    document.title = '献立 #' + PLAN.no + ' ' + PLAN.title; // タイマーの控えは献立ごとに分ける
    const tabs = P.tabs.filter(t => t.id !== 'shop');
    let h = viewingPast ? `<div class="pastbar">過去の献立 #${esc(PLAN.no)}（${md(PLAN.start_date)}〜${md(PLAN.end_date)}） <a href="./">今週に戻る</a></div>` : '';
    h += `<header class="mast">${P.mast}</header>`;
    h += `<div class="mwbar"><label for="mwsel">うちの電子レンジ</label><select id="mwsel"><option value="500">500W</option><option value="600">600W</option><option value="700">700W</option></select><span>レンジの時間はこのW数で表示</span></div>`;
    h += `<nav class="days" role="tablist" aria-label="日付">` + tabs.map((t, i) =>
      `<button role="tab" id="t-${t.id}" aria-controls="p-${t.id}" aria-selected="${i === 0}">${t.date ? `<span class="dnum">${t.date}</span>` : ''}${esc(t.label)}</button>`).join('') + `</nav>`;
    h += tabs.map((t, i) => {
      const isDay = !!t.date;
      return `<section class="panel" id="p-${t.id}" ${isDay ? `data-day="${t.id}"` : ''} role="tabpanel" aria-labelledby="t-${t.id}" ${i === 0 ? '' : 'hidden'}>${t.html}${isDay ? `<div class="fb" data-fb="${t.id}" data-label="${esc(t.label)}"></div>` : ''}</section>`;
    }).join('');
    box.innerHTML = h;
    box.querySelectorAll('nav.days button').forEach(b => b.addEventListener('click', () => {
      const id = b.id.slice(2);
      history.replaceState(null, '', '#plan/' + id); selectDay(id); window.scrollTo({ top: 0 });
    }));
    // 献立の期間中は、今日の日を最初に開く
    const pd = planDayFor(jstKey());
    if (pd && !location.hash.includes('/')) selectDay(pd.key);
    // レンジのW数
    const sel = $('#mwsel'); sel.value = S.mw || '500';
    sel.addEventListener('change', () => { S.mw = sel.value; save(); applyMw(); });
    applyMw();
    buildFeedback();
  }
  function selectDay(id) {
    document.querySelectorAll('#v-plan nav.days button').forEach(t => {
      const on = t.id === 't-' + id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
      if (on && p && p.dataset.day) t.style.setProperty('--tone', getComputedStyle(p).getPropertyValue('--tone').trim());
      else t.style.removeProperty('--tone');
    });
  }
  function applyMw() {
    const w = Number(S.mw || 500);
    document.querySelectorAll('.mw[data-s]').forEach(el => {
      const s = Math.ceil(Number(el.dataset.s) * 600 / w / 10) * 10;
      const m = Math.floor(s / 60), r = s % 60;
      el.textContent = w + 'W ' + m + '分' + (r ? r + '秒' : '');
      el.dataset.secs = s;
    });
  }

  // 感想の記録欄（5軸＋調理時間＋メモ）。倉庫の feedback_{曜日} に保存
  const fbState = {};
  function buildFeedback() {
    document.querySelectorAll('#v-plan .fb').forEach(box => {
      const day = box.dataset.fb, label = box.dataset.label;
      fbState[day] = { scores: {} };
      let h = `<h4>作ったあとの記録（${esc(label)}）</h4><p class="hint">5軸＋実際の調理時間＋気づいたこと。次の献立の設計に直接効きます。</p><div class="axes">`;
      h += AXES.map(a => `<div class="axis"><span>${a[1]}</span><div class="stars" role="group" aria-label="${a[1]}の評価">` +
        [1, 2, 3, 4, 5].map(n => `<button type="button" data-day="${day}" data-ax="${a[0]}" data-n="${n}" data-on="0" aria-label="${n}点">★</button>`).join('') + `</div></div>`).join('');
      h += `</div><div class="fbrow"><label for="min-${day}">実際の調理時間</label><input type="number" min="0" max="180" id="min-${day}"><span style="font-size:13.5px">分</span></div>`;
      h += `<textarea id="memo-${day}" placeholder="気づいたこと（味が薄い／量が多い／段取りが詰まった／妻の反応 など）"></textarea>`;
      h += `<div class="fbrow"><button class="savebtn" type="button" data-save="${day}">記録する</button><span class="fbstate" id="fbst-${day}"></span></div>`;
      box.innerHTML = h;
    });
    document.querySelectorAll('#v-plan .stars button').forEach(b => b.addEventListener('click', () => {
      fbState[b.dataset.day].scores[b.dataset.ax] = Number(b.dataset.n); paintStars(b.dataset.day);
    }));
    document.querySelectorAll('#v-plan [data-save]').forEach(b => b.addEventListener('click', async () => {
      const day = b.dataset.save, st = $('#fbst-' + day);
      const mi = $('#min-' + day).value;
      const v = { day, plan: PLAN.no, scores: fbState[day].scores, minutes: mi ? Number(mi) : null, memo: $('#memo-' + day).value || '', savedAt: new Date().toISOString() };
      st.textContent = '保存中…';
      try { await setState('feedback_' + day, v); st.textContent = '保存しました（社長が朝礼で読みます）'; }
      catch (e) { st.textContent = '保存できませんでした：' + e.message; }
    }));
    refreshState();
  }
  function paintStars(day) {
    const sc = fbState[day].scores;
    document.querySelectorAll(`#v-plan .stars button[data-day="${day}"]`).forEach(b => { b.dataset.on = (Number(b.dataset.n) <= (sc[b.dataset.ax] || 0)) ? '1' : '0'; });
  }
  // 倉庫の状態を画面に反映（感想・調理時間・買い物）
  function refreshState() {
    Object.keys(fbState).forEach(day => {
      const v = STATE['feedback_' + day];
      const ct = STATE['cooktime_' + day];
      const mi = $('#min-' + day);
      if (v) {
        fbState[day].scores = v.scores || {}; paintStars(day);
        if (mi && v.minutes != null) mi.value = v.minutes;
        const ta = $('#memo-' + day); if (ta && v.memo) ta.value = v.memo;
        const st = $('#fbst-' + day); if (st) st.textContent = '記録済み';
      } else if (ct && mi && !mi.value) mi.value = ct.minutes;
    });
    renderShopList();
  }
  async function setState(key, value) {
    if (viewingPast && key.startsWith('cooktime')) return value;
    STATE[key] = value;
    if (!viewingPast && S.data) { S.data.state = STATE; save(); }
    return rpc('km_set_state', { p_code: S.code, p_plan_id: PLAN.id, p_key: key, p_value: value });
  }
  // タイマー部品が使う保存口（全体の調理時間 → cooktime_{曜日}）
  window.__kdb = { doc(path) { const key = path.replace(/^state\//, ''); return { set: v => setState(key, v), get: () => Promise.resolve(STATE[key]) }; } };

  // ---------- 買い物 ----------
  let checked = {}, shopTimer = null;
  function renderShop() {
    const box = $('#v-shop');
    if (!PLAN) { box.innerHTML = '<p class="note">まだ献立が届いていません。</p>'; return; }
    const t = PLAN.payload.tabs.find(x => x.id === 'shop');
    box.innerHTML = (viewingPast ? `<div class="pastbar">過去の献立 #${esc(PLAN.no)} <a href="./">今週に戻る</a></div>` : '') + `<section class="panel" id="p-shop">${t ? t.html : ''}</section>`;
    const sync = $('#shopsync'); if (sync) sync.textContent = 'チェックは倉庫に保存されます（別の端末でも同じ状態）';
    renderShopList();
  }
  function renderShopList() {
    if (!PLAN) return;
    checked = (STATE.shopping && STATE.shopping.items) || checked || {};
    [['shop-fresh', PLAN.payload.fresh], ['shop-seas', PLAN.payload.seas]].forEach(([id, rows]) => {
      const ul = document.getElementById(id); if (!ul) return;
      ul.innerHTML = '';
      (rows || []).forEach(r => {
        const li = document.createElement('li'); li.className = checked[r[0]] ? 'done' : '';
        li.innerHTML = `<input type="checkbox" id="chk-${r[0]}" ${checked[r[0]] ? 'checked' : ''} aria-label="${esc(r[1])}"><label class="nm" for="chk-${r[0]}" style="cursor:pointer">${esc(r[1])}</label><span class="amt">${esc(r[2])}</span><span class="yen">${r[3] ? Number(r[3]).toLocaleString('ja-JP') + '円' : '—'}</span>`;
        li.querySelector('input').addEventListener('change', ev => {
          checked[r[0]] = ev.target.checked; li.className = ev.target.checked ? 'done' : '';
          clearTimeout(shopTimer);
          shopTimer = setTimeout(() => setState('shopping', { items: checked, updatedAt: new Date().toISOString() }).catch(e => toast(e.message)), 400);
        });
        ul.appendChild(li);
      });
    });
  }

  // ---------- 体重 ----------
  async function saveWeight(day, kg, fat) {
    kg = Number(kg); fat = fat ? Number(fat) : null;
    if (!(kg >= 30 && kg <= 150)) return toast('体重は30〜150kgで入れてください');
    if (fat != null && !(fat >= 3 && fat <= 60)) return toast('体脂肪率は3〜60%で入れてください');
    try {
      await rpc('km_set_weight', { p_code: S.code, p_day: day, p_kg: kg, p_fat: fat });
      const d = await rpc('km_sync', { p_code: S.code }); S.data = d; S.syncedAt = Date.now(); save();
      renderToday(d); renderWeight(d); toast('記録しました');
    } catch (e) { toast(e.message); }
  }
  function renderWeight(d) {
    const ws = (d.weights || []).map(w => ({ day: w.day, kg: Number(w.kg), fat: w.fat_pct == null ? null : Number(w.fat_pct) }));
    const box = $('#v-weight');
    let h = `<header class="apphead"><div class="eyebrow">体重・体脂肪</div><h1>体重の記録</h1></header>`;
    h += `<form class="wform" id="wform"><label>日付<input type="date" id="wf-day" value="${jstKey()}"></label><label>体重 kg<input type="number" step="0.1" id="wf-kg" inputmode="decimal"></label><label>体脂肪 %<input type="number" step="0.1" id="wf-fat" inputmode="decimal"></label><button type="submit">記録</button></form>`;
    if (!ws.length) { box.innerHTML = h + '<p class="note">まだ記録がありません。起きてトイレの後に量って入れる。</p>'; bindW(); return; }
    // 7日平均
    const t = d0 => new Date(d0 + 'T00:00:00Z').getTime();
    const avg = ws.map(w => { const xs = ws.filter(x => t(x.day) <= t(w.day) && t(x.day) > t(w.day) - 7 * DAY); return xs.reduce((a, x) => a + x.kg, 0) / xs.length; });
    const last = ws[ws.length - 1];
    // 4週間のペース：直近7日平均 と 28日前ごろの7日平均
    const lastT = t(last.day);
    const recent = ws.filter(x => t(x.day) > lastT - 7 * DAY);
    const before = ws.filter(x => t(x.day) <= lastT - 21 * DAY && t(x.day) > lastT - 35 * DAY);
    let pace = '';
    if (recent.length && before.length) {
      const a = recent.reduce((s, x) => s + x.kg, 0) / recent.length, b = before.reduce((s, x) => s + x.kg, 0) / before.length;
      const perWeek = (a - b) / 4, pct = perWeek / b * 100;
      const judge = pct < -1 ? '速すぎる（筋肉が削れる）→ 食事を少し増やす' : pct < -0.5 ? '安全圏（週0.5〜1%）' : pct < 0 ? 'ゆっくり（週0.5%未満）' : '減っていない';
      pace = `<p class="pace">4週間のペース：<b>${perWeek >= 0 ? '+' : ''}${fmtN(perWeek, 2)}kg/週</b>（${pct >= 0 ? '+' : ''}${fmtN(pct, 2)}%/週）＝ ${judge}</p>`;
    } else pace = '<p class="note">4週間分たまると、減るペース（週0.5〜1%が安全圏）を判定します。</p>';
    h += `<div class="wstats"><div><b>${fmtN(last.kg)}<small>kg</small></b><span>${md(last.day)} の体重</span></div><div><b>${fmtN(avg[avg.length - 1])}<small>kg</small></b><span>7日平均</span></div>${last.fat != null ? `<div><b>${fmtN(last.fat)}<small>%</small></b><span>体脂肪率</span></div>` : ''}</div>`;
    h += pace + chart(ws, avg);
    h += `<p class="note">日々の上下（±1kg）は水分。<b>7日平均の線</b>で見る。</p>`;
    h += `<div class="card"><div class="tblwrap"><table><thead><tr><th>日付</th><th class="q">体重</th><th class="q">体脂肪</th><th></th></tr></thead><tbody>` +
      ws.slice().reverse().slice(0, 30).map(w => `<tr><td>${md(w.day)}（${wd(w.day)}）</td><td class="q">${fmtN(w.kg)}kg</td><td class="q">${w.fat != null ? fmtN(w.fat) + '%' : '—'}</td><td class="q"><button class="linkbtn" data-del="${w.day}">消す</button></td></tr>`).join('') + `</tbody></table></div></div>`;
    box.innerHTML = h; bindW();
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(md(b.dataset.del) + ' の記録を消しますか？')) return;
      try { await rpc('km_delete_weight', { p_code: S.code, p_day: b.dataset.del }); const d2 = await rpc('km_sync', { p_code: S.code }); S.data = d2; save(); renderWeight(d2); renderToday(d2); }
      catch (e) { toast(e.message); }
    }));
  }
  function bindW() { $('#wform').onsubmit = ev => { ev.preventDefault(); saveWeight($('#wf-day').value, $('#wf-kg').value, $('#wf-fat').value); }; }
  function chart(ws, avg) {
    if (ws.length < 2) return '';
    const W = 340, H = 170, L = 34, R = 8, T = 10, B = 22;
    const t = d0 => new Date(d0 + 'T00:00:00Z').getTime();
    const x0 = t(ws[0].day), x1 = t(ws[ws.length - 1].day) || x0 + DAY;
    const ys = ws.map(w => w.kg).concat(avg);
    const y0 = Math.floor(Math.min(...ys) - 0.5), y1 = Math.ceil(Math.max(...ys) + 0.5);
    const X = d0 => L + (t(d0) - x0) / Math.max(DAY, x1 - x0) * (W - L - R);
    const Y = v => T + (y1 - v) / (y1 - y0) * (H - T - B);
    let g = '';
    for (let v = y0; v <= y1; v++) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 4}" y="${Y(v) + 4}" class="axl" text-anchor="end">${v}</text>`;
    const pts = ws.map(w => `<circle cx="${X(w.day).toFixed(1)}" cy="${Y(w.kg).toFixed(1)}" r="2.6" class="dot"/>`).join('');
    const line = ws.map((w, i) => `${i ? 'L' : 'M'}${X(w.day).toFixed(1)},${Y(avg[i]).toFixed(1)}`).join('');
    const lab = `<text x="${L}" y="${H - 4}" class="axl">${md(ws[0].day)}</text><text x="${W - R}" y="${H - 4}" class="axl" text-anchor="end">${md(ws[ws.length - 1].day)}</text>`;
    return `<div class="card wchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重の推移">${g}${pts}<path d="${line}" class="avg"/>${lab}</svg><div class="legend"><span><i class="dot"></i>毎日の体重</span><span><i class="ln"></i>7日平均</span></div></div>`;
  }

  // ---------- 過去 ----------
  function renderPast(d) {
    const box = $('#v-past');
    const ps = d.plans || [];
    let h = `<header class="apphead"><div class="eyebrow">これまでの献立</div><h1>過去の献立</h1></header>`;
    if (!ps.length) h += '<p class="note">まだありません。</p>';
    h += ps.map((p, i) => `<a class="pastrow" href="${i === 0 ? './' : '?plan=' + p.id + '#plan'}"><span class="no">#${String(p.no).padStart(2, '0')}</span><span class="tt">${esc(p.title)}</span><span class="dt">${md(p.start_date)}〜${md(p.end_date)}${i === 0 ? '・今週' : ''}</span></a>`).join('');
    h += `<p class="note">#06 以前の献立はこのアプリができる前のもの。必要なら社長に「#03を載せて」と言えば載せる。</p>`;
    h += `<div class="setrow"><button class="linkbtn" id="logout">この端末から合言葉を消す</button><span class="syncnote">版 ${CFG.version}</span></div>`;
    box.innerHTML = h;
    $('#logout').onclick = () => { if (confirm('合言葉を消すと、もう一度入れるまで開けません。消しますか？')) { localStorage.removeItem(KEY); location.href = './'; } };
  }

  // ---------- 部品（タイマー・盛り付け計算） ----------
  function loadWidgets() {
    ['js/timer.js', 'js/portion.js'].forEach(src => {
      const s = document.createElement('script'); s.src = src + '?v=' + CFG.version; s.async = false; document.body.appendChild(s);
    });
    // タイマーが .mw の秒数を読むので、W数の表示を整え直す
    setTimeout(applyMw, 300);
  }

  boot();
})();
