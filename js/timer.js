/* 献立のタイマー（原本＝開発用/meal-system/assets/kondate-timer.html。中身は同じ） */
(function(){
  "use strict";
  var KEY = 'kondate-timers:' + document.title, CK = 'kondate-cook:' + document.title;
  var timers = [], cook = null, ac = null, wl = null, seq = 0, rows = {};
  var dock = document.getElementById('dock');
  var hint = document.createElement('div'); hint.className = 'dockhint';
  hint.textContent = '鳴るのはこの画面を開いている間だけ。3回鳴ったら自動で止まる。画面は消さずに置いておく。';

  try{ timers = JSON.parse(localStorage.getItem(KEY)) || []; }catch(e){ timers = []; }
  try{ cook = JSON.parse(localStorage.getItem(CK)); }catch(e){ cook = null; }
  function save(){
    try{
      localStorage.setItem(KEY, JSON.stringify(timers));
      if(cook) localStorage.setItem(CK, JSON.stringify(cook)); else localStorage.removeItem(CK);
    }catch(e){}
  }

  function audio(){
    try{
      if(!ac){ var C = window.AudioContext || window.webkitAudioContext; if(C) ac = new C(); }
      if(ac && ac.state === 'suspended') ac.resume();
    }catch(e){}
  }
  function beep(){
    if(ac){
      try{
        [0, .28, .56].forEach(function(o){
          var osc = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + o;
          osc.type = 'square'; osc.frequency.value = 1760;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(.25, t0 + .02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + .2);
          osc.connect(g); g.connect(ac.destination);
          osc.start(t0); osc.stop(t0 + .22);
        });
      }catch(e){}
    }
    try{ if(navigator.vibrate) navigator.vibrate([300, 150, 300]); }catch(e){}
  }
  function lock(){
    var need = timers.length > 0 || !!cook;
    try{
      if(need && !wl && navigator.wakeLock){
        navigator.wakeLock.request('screen').then(function(l){
          wl = l; l.addEventListener('release', function(){ wl = null; });
        }).catch(function(){});
      } else if(!need && wl){ wl.release().catch(function(){}); wl = null; }
    }catch(e){}
  }

  /* 段取りの文中の「N分」「N分半」「N時間」「N秒」を押せる形にする */
  var RE = /(\d+)時間半|(\d+)時間|(\d+)分半|(\d+)分(\d+)秒|(\d+)分(?!前|以内)|(\d+)秒/g;
  function secs(m){
    if(m[1]) return Number(m[1]) * 3600 + 1800;
    if(m[2]) return Number(m[2]) * 3600;
    if(m[3]) return Number(m[3]) * 60 + 30;
    if(m[4]) return Number(m[4]) * 60 + Number(m[5]);
    if(m[6]) return Number(m[6]) * 60;
    return Number(m[7]);
  }
  function wrap(root){
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while((n = w.nextNode())){ if(!n.parentElement.closest('.mw,.fg,.tm')) nodes.push(n); }
    nodes.forEach(function(tn){
      var s = tn.nodeValue, m, last = 0, frag = null;
      RE.lastIndex = 0;
      while((m = RE.exec(s))){
        var sec = secs(m); if(!sec) continue;
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'tm'; b.textContent = m[0];
        b.dataset.sec = String(sec);
        b.dataset.pre = s.slice(Math.max(0, m.index - 14), m.index).split(/[→。、・：（）]/).filter(function(x){ return x.trim(); }).pop() || '';
        b.setAttribute('aria-label', m[0] + 'のタイマーを始める');
        frag.appendChild(b); last = m.index + m[0].length;
      }
      if(frag){ frag.appendChild(document.createTextNode(s.slice(last))); tn.parentNode.replaceChild(frag, tn); }
    });
  }
  document.querySelectorAll('ol.flowlist .ftext, ol.steps > li').forEach(wrap);
  document.querySelectorAll('.mw').forEach(function(el){
    el.classList.add('tm'); el.setAttribute('role', 'button'); el.tabIndex = 0;
    el.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.click(); } });
  });

  function fmt(ms){
    var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function start(sec, label){
    audio();
    timers.push({id: Date.now() + '-' + (seq++), label: label, end: Date.now() + sec * 1000});
    save(); lock(); tick();
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('.tm') : null; if(!b) return;
    var li = b.closest('li'), tag = li ? li.querySelector('.ftag') : null, sec, label;
    if(b.classList.contains('mw')){
      var sel = document.getElementById('mwsel'), w = sel ? Number(sel.value) : 600;
      sec = Math.ceil(Number(b.dataset.s) * 600 / w / 10) * 10; label = 'レンジ ' + b.textContent;
    } else { sec = Number(b.dataset.sec); label = (b.dataset.pre || '') + b.textContent; }
    if(!sec) return;
    start(sec, (tag ? tag.textContent + '｜' : '') + label);
    b.classList.add('on'); setTimeout(function(){ b.classList.remove('on'); }, 600);
  });

  /* 全体の調理時間 */
  var DAYLAB = {thu:'木', fri:'金', sat:'土', sun:'日', wed:'水'};
  document.querySelectorAll('section.panel[data-day] ol.flowlist').forEach(function(ol){
    var day = ol.closest('section.panel').dataset.day;
    var bar = document.createElement('div'); bar.className = 'cookbar';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cookbtn'; btn.id = 'cook-' + day;
    btn.textContent = '調理スタート';
    var msg = document.createElement('span'); msg.className = 'cookmsg'; msg.id = 'cookmsg-' + day;
    msg.textContent = '押すと全体の時間を計る。左の数字（帰宅からの分）と見比べられる。';
    btn.addEventListener('click', function(){
      audio();
      cook = {day: day, start: Date.now()};
      msg.textContent = '計測中。できあがったら下の「できあがり」を押す。';
      save(); lock(); tick();
    });
    bar.appendChild(btn); bar.appendChild(msg);
    ol.parentNode.insertBefore(bar, ol);
  });
  function finishCook(){
    if(!cook) return;
    var day = cook.day, end = Date.now(), mins = Math.max(1, Math.round((end - cook.start) / 60000));
    var mi = document.getElementById('min-' + day); if(mi) mi.value = mins;
    var msg = document.getElementById('cookmsg-' + day);
    if(msg) msg.textContent = '今日は ' + mins + '分でした。下の記録欄に入れました。';
    try{
      if(window.__kdb) window.__kdb.doc('state/cooktime_' + day).set({
        day: day, minutes: mins, startedAt: new Date(cook.start).toISOString(), endedAt: new Date(end).toISOString()
      }).catch(function(){});
    }catch(e){}
    cook = null; save(); lock(); tick();
  }

  function row(id, cls){
    var el = document.createElement('div'); el.className = 'drow' + (cls ? ' ' + cls : '');
    var t = document.createElement('span'); t.className = 't';
    var l = document.createElement('span'); l.className = 'l';
    var b = document.createElement('button'); b.type = 'button';
    el.appendChild(t); el.appendChild(l); el.appendChild(b);
    rows[id] = {el: el, t: t, l: l, b: b};
    dock.insertBefore(el, hint.parentNode === dock ? hint : null);
    return rows[id];
  }
  function tick(){
    var now = Date.now(), live = {};
    if(hint.parentNode !== dock) dock.appendChild(hint);
    if(cook){
      live.cook = 1;
      var c = rows.cook || row('cook', 'cook');
      if(!c.wired){ c.wired = 1; c.b.textContent = 'できあがり'; c.b.addEventListener('click', finishCook); }
      c.t.textContent = fmt(now - cook.start);
      c.l.textContent = (DAYLAB[cook.day] || '') + '｜調理スタートから';
    }
    timers.forEach(function(tm){
      live[tm.id] = 1;
      var r = rows[tm.id] || row(tm.id);
      if(!r.wired){
        r.wired = 1; r.l.textContent = tm.label;
        r.b.addEventListener('click', function(){
          timers = timers.filter(function(x){ return x.id !== tm.id; });
          save(); lock(); tick();
        });
      }
      var left = tm.end - now;
      if(left > 0){ r.t.textContent = fmt(left); r.b.textContent = '取消'; }
      else {
        r.el.classList.add('done'); r.t.textContent = '+' + fmt(-left); r.b.textContent = '止める';
        tm.beeps = tm.beeps || 0;
        if(tm.beeps >= 3 && now - tm.last >= 3000){
          timers = timers.filter(function(x){ return x.id !== tm.id; });
          save(); lock(); return;
        }
        if(!tm.last || now - tm.last >= 3000){ tm.beeps++; tm.last = now; beep(); }
      }
    });
    Object.keys(rows).forEach(function(id){
      if(!live[id]){ rows[id].el.remove(); delete rows[id]; }
    });
    var any = timers.length > 0 || !!cook;
    dock.hidden = !any;
    document.body.classList.toggle('has-dock', any);
  }
  setInterval(function(){ if(timers.length || cook) tick(); }, 250);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ lock(); tick(); } });
  tick();
})();
