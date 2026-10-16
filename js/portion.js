/* 盛り付けの重さ計算（原本＝開発用/meal-system/assets/kondate-portion.html。中身は同じ） */
(function(){
  "use strict";
  var PANKEY = 'kondate-pan-weight';
  /* 「○○は 弁当3：夫5：妻3」のほか「弁当3：弁当3：夫5：妻3」のように弁当が2箱以上でも読む（2026-10-15 #08木で計算欄が出なかった事故） */
  var RE = /([^\s。、（）・]+?)は\s*((?:(?:弁当|夫|妻)\s*\d+\s*[：:]\s*)+(?:弁当|夫|妻)\s*\d+)/g;
  var PART = /(弁当|夫|妻)\s*(\d+)/g;
  var seq = 0;
  function num(v){ var n = Number(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; }

  document.querySelectorAll('ol.flowlist li').forEach(function(li){
    var tag = li.querySelector('.ftag'), tx = li.querySelector('.ftext');
    if(!tag || !tx || tag.textContent.trim() !== '盛り付け') return;
    var text = tx.textContent, m;
    RE.lastIndex = 0;
    while((m = RE.exec(text))){
      var name = m[1], parts = [], p, sum = 0, nb = 0;
      PART.lastIndex = 0;
      while((p = PART.exec(m[2]))){ parts.push({who: p[1], r: Number(p[2])}); sum += Number(p[2]); if(p[1] === '弁当') nb++; }
      if(parts.length < 2 || sum <= 0) continue;
      var k = 0;
      parts.forEach(function(x){ x.label = (x.who === '弁当' && nb > 1) ? '弁当' + (++k) : x.who; });
      var id = 'pt' + (seq++);
      var box = document.createElement('div'); box.className = 'portion';
      box.innerHTML =
        '<div class="ptitle">' + name + 'の重さを計算（' + parts.map(function(x){ return x.who + x.r; }).join('：') + '）</div>' +
        '<div class="pin">' +
          '<label for="' + id + '-t">鍋ごとの重さ<input id="' + id + '-t" type="number" inputmode="numeric" min="0" placeholder="0"> g</label>' +
          '<label for="' + id + '-p">鍋・フライパンの重さ<input id="' + id + '-p" type="number" inputmode="numeric" min="0" placeholder="0"> g</label>' +
        '</div>' +
        '<div class="pout" aria-live="polite">' +
          parts.map(function(x, i){ return '<div><b id="' + id + '-' + i + '">—</b><span>' + x.label + '</span></div>'; }).join('') +
        '</div>' +
        '<div class="phint" id="' + id + '-h">鍋ごとはかりに乗せて、鍋の重さを引く。中身だけ別の器で量ったなら、鍋の重さは0のまま。鍋の重さはこの端末が覚えておく。お皿をはかりに乗せて0にしてから、下の数字まで盛る。</div>';
      li.appendChild(box);
      (function(id, parts, sum){
        var t = document.getElementById(id + '-t'), pw = document.getElementById(id + '-p');
        try{ var sv = localStorage.getItem(PANKEY); if(sv) pw.value = sv; }catch(e){}
        function calc(){
          var net = num(t.value) - num(pw.value);
          if(!t.value || net <= 0){ parts.forEach(function(_, i){ document.getElementById(id + '-' + i).textContent = '—'; }); return; }
          /* 端数は夫に寄せる */
          var g = parts.map(function(x){ return Math.round(net * x.r / sum); });
          var hi = parts.findIndex(function(x){ return x.who === '夫'; }); if(hi < 0) hi = 0;
          g[hi] += Math.round(net) - g.reduce(function(a, b){ return a + b; }, 0);
          g.forEach(function(v, i){ document.getElementById(id + '-' + i).textContent = v + 'g'; });
          document.getElementById(id + '-h').textContent = '中身 ' + Math.round(net) + 'g を ' + sum + '等分 → 1つ分 ' + (Math.round(net / sum * 10) / 10) + 'g。お皿をはかりに乗せて0にしてから盛る。';
        }
        t.addEventListener('input', calc);
        pw.addEventListener('input', function(){ try{ localStorage.setItem(PANKEY, pw.value); }catch(e){} calc(); });
      })(id, parts, sum);
    }
  });
})();
