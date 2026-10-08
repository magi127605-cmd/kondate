/* 盛り付けの重さ計算（原本＝開発用/meal-system/assets/kondate-portion.html。中身は同じ） */
(function(){
  "use strict";
  var PANKEY = 'kondate-pan-weight';
  var RE = /([^\s。、（）・]+?)は\s*弁当\s*(\d+)\s*[：:]\s*夫\s*(\d+)\s*[：:]\s*妻\s*(\d+)/g;
  var seq = 0;
  function num(v){ var n = Number(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; }

  document.querySelectorAll('ol.flowlist li').forEach(function(li){
    var tag = li.querySelector('.ftag'), tx = li.querySelector('.ftext');
    if(!tag || !tx || tag.textContent.trim() !== '盛り付け') return;
    var text = tx.textContent, m;
    RE.lastIndex = 0;
    while((m = RE.exec(text))){
      var name = m[1], r = [Number(m[2]), Number(m[3]), Number(m[4])], sum = r[0] + r[1] + r[2];
      var id = 'pt' + (seq++);
      var box = document.createElement('div'); box.className = 'portion';
      box.innerHTML =
        '<div class="ptitle">' + name + 'の重さを計算（弁当' + r[0] + '：夫' + r[1] + '：妻' + r[2] + '）</div>' +
        '<div class="pin">' +
          '<label for="' + id + '-t">鍋ごとの重さ<input id="' + id + '-t" type="number" inputmode="numeric" min="0" placeholder="0"> g</label>' +
          '<label for="' + id + '-p">鍋・フライパンの重さ<input id="' + id + '-p" type="number" inputmode="numeric" min="0" placeholder="0"> g</label>' +
        '</div>' +
        '<div class="pout" aria-live="polite">' +
          '<div><b id="' + id + '-0">—</b><span>弁当</span></div>' +
          '<div><b id="' + id + '-1">—</b><span>夫</span></div>' +
          '<div><b id="' + id + '-2">—</b><span>妻</span></div>' +
        '</div>' +
        '<div class="phint" id="' + id + '-h">鍋ごとはかりに乗せて、鍋の重さを引く。中身だけ別の器で量ったなら、鍋の重さは0のまま。鍋の重さはこの端末が覚えておく。お皿をはかりに乗せて0にしてから、下の数字まで盛る。</div>';
      li.appendChild(box);
      (function(id, r, sum){
        var t = document.getElementById(id + '-t'), p = document.getElementById(id + '-p');
        try{ var sv = localStorage.getItem(PANKEY); if(sv) p.value = sv; }catch(e){}
        function calc(){
          var net = num(t.value) - num(p.value);
          if(!t.value || net <= 0){ [0,1,2].forEach(function(i){ document.getElementById(id + '-' + i).textContent = '—'; }); return; }
          var a = Math.round(net * r[0] / sum), b = Math.round(net * r[2] / sum), c = Math.round(net) - a - b;
          document.getElementById(id + '-0').textContent = a + 'g';
          document.getElementById(id + '-1').textContent = c + 'g';
          document.getElementById(id + '-2').textContent = b + 'g';
          document.getElementById(id + '-h').textContent = '中身 ' + Math.round(net) + 'g を ' + sum + '等分 → 1つ分 ' + (Math.round(net / sum * 10) / 10) + 'g。お皿をはかりに乗せて0にしてから盛る。';
        }
        t.addEventListener('input', calc);
        p.addEventListener('input', function(){ try{ localStorage.setItem(PANKEY, p.value); }catch(e){} calc(); });
      })(id, r, sum);
    }
  });
})();
