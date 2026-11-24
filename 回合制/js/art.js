/* ============================================================
   解码TA · 回合制闯关 — 角色立绘素材库（UI美化版新增）
   纯内联 SVG，零外部依赖。BOSS ×3 + 队员 ×4 配色造型。
   造型为原创卡通简笔，沿用 visual-spec 配色，不复制任何游戏原画。
   ============================================================ */
(function () {
  'use strict';

  var OUT = 'stroke="#181228" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';

  // ---------- BOSS 立绘（140×140，卡通厚描边） ----------
  var BOSSES = {
    // 抱手机的毛球：第 1 关 · 手机荧光青
    'boss-read':
      '<g ' + OUT + '>' +
      '<path d="M28 62 Q18 32 46 20 Q70 8 94 20 Q122 34 112 64 Q122 92 96 108 Q70 124 44 108 Q18 92 28 62z" fill="#7a67b3"/>' +
      '<path d="M38 58 Q32 36 52 28 Q70 22 88 28 Q108 36 102 58 Q106 80 86 92 Q70 100 54 92 Q34 80 38 58z" fill="#a78bda"/>' +
      '<path d="M44 34 L38 20 L54 28 M94 34 l6 -14 -16 8" fill="#a78bda"/>' +
      '<ellipse cx="56" cy="56" rx="7" ry="9" fill="#f4e9d3"/><ellipse cx="84" cy="56" rx="7" ry="9" fill="#f4e9d3"/>' +
      '<circle cx="57" cy="57" r="3.4" fill="#2a2440" stroke="none"/><circle cx="85" cy="57" r="3.4" fill="#2a2440" stroke="none"/>' +
      '<path d="M64 76 q6 5 12 0" fill="none"/>' +
      '<rect x="48" y="88" width="44" height="34" rx="5" fill="#3a3357"/>' +
      '<rect x="53" y="93" width="34" height="24" rx="2" fill="#7fe0d0"/>' +
      '<path d="M58 99 h22 M58 105 h14" stroke="#2a2440" stroke-width="2"/>' +
      '<path d="M46 96 q-8 6 -4 14 M94 96 q8 6 4 14" fill="#a78bda"/>' +
      '</g>' +
      '<g><rect x="94" y="24" width="40" height="19" rx="9" fill="#f4e9d3" stroke="#b9a67f" stroke-width="1.5"/>' +
      '<text x="114" y="37" text-anchor="middle" font-size="12" font-weight="700" fill="#6f5fa6">已读</text></g>',

    // 背锅巨兽：第 2 关 · 锅棕 + 冷白批注
    'boss-blame':
      '<g ' + OUT + '>' +
      '<path d="M38 36 Q70 18 102 36 L108 50 Q124 62 114 96 Q108 118 70 122 Q32 118 26 96 Q16 62 32 50z" fill="#8a6a4a"/>' +
      '<path d="M30 44 Q18 40 20 52 Q22 60 32 58 M110 44 q12 -4 10 8 q-2 8 -12 6" fill="#6b4f37"/>' +
      '<path d="M42 60 Q70 48 98 60 L96 88 Q70 98 44 88z" fill="#6e7b93"/>' +
      '<ellipse cx="57" cy="70" rx="5" ry="6" fill="#1e2230" stroke="none"/><ellipse cx="83" cy="70" rx="5" ry="6" fill="#1e2230" stroke="none"/>' +
      '<path d="M62 84 q8 -4 16 0" fill="none"/>' +
      '<path d="M40 100 q30 10 60 0" fill="none" stroke="#4a5568"/>' +
      '<path d="M46 108 h12 M82 108 h12" stroke="#4a5568"/>' +
      '</g>' +
      '<g stroke="#e5484d" stroke-width="2.5" fill="none">' +
      '<circle cx="112" cy="86" r="14"/><path d="M102 76 l20 20"/>' +
      '<circle cx="24" cy="28" r="9"/><path d="M18 22 l12 12"/></g>' +
      '<text x="112" y="92" text-anchor="middle" font-size="14" font-weight="800" fill="#e5484d">?</text>',

    // 内耗魔王：第 3 关 · 半透明双影 + 暖金眼
    'boss-burnout':
      '<g opacity=".45" transform="translate(5 5)">' +
      '<path d="M36 48 Q70 16 104 48 L108 108 Q70 132 32 108z" fill="#8e7cc3" stroke="none"/></g>' +
      '<g ' + OUT + '>' +
      '<path d="M34 50 Q70 16 106 50 L110 106 Q70 130 30 106z" fill="#5a4e8a"/>' +
      '<path d="M48 56 Q70 40 92 56 L94 96 Q70 110 46 96z" fill="rgba(138,124,195,.55)"/>' +
      '<ellipse cx="56" cy="68" rx="7" ry="5" fill="#ffd9a0"/><ellipse cx="84" cy="68" rx="7" ry="5" fill="#ffd9a0"/>' +
      '<circle cx="56" cy="68" r="2.4" fill="#1a1526" stroke="none"/><circle cx="84" cy="68" r="2.4" fill="#1a1526" stroke="none"/>' +
      '<path d="M62 86 q8 6 16 0" fill="none" stroke="#1a1526"/>' +
      '<path d="M44 106 l-8 18 M96 106 l8 18" fill="none" stroke="#5a4e8a"/>' +
      '</g>' +
      '<g font-size="13" font-weight="700" text-anchor="middle">' +
      '<rect x="4" y="40" width="26" height="26" rx="5" fill="#241f3a" stroke="#d4af6a" stroke-width="1.5"/>' +
      '<text x="17" y="58" fill="#ffd9a0">卷</text>' +
      '<rect x="110" y="58" width="26" height="26" rx="5" fill="#241f3a" stroke="#d4af6a" stroke-width="1.5"/>' +
      '<text x="123" y="76" fill="#ffd9a0">摆</text>' +
      '<rect x="70" y="6" width="26" height="26" rx="5" fill="#241f3a" stroke="#d4af6a" stroke-width="1.5"/>' +
      '<text x="83" y="24" fill="#e5484d">悔</text></g>'
  };

  // ---------- 队员立绘（64×76，4 配色 × 特征小配件） ----------
  var PALETTE = [
    { main: '#8e7cc3', dark: '#6f5fa6', light: '#efeaf9', name: '紫' },
    { main: '#7fa8c9', dark: '#5a82a6', light: '#e8f1f7', name: '蓝' },
    { main: '#e0a3b4', dark: '#b4677c', light: '#fbecef', name: '粉' },
    { main: '#ff9e3d', dark: '#d97a24', light: '#ffe3c2', name: '橙' }
  ];

  // 依据特征 id 稳定派生配件，保证 16 种角色看起来各不相同
  function hashIndex(id) {
    var s = String(id || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 6;
  }

  function accessory(kind, c) {
    switch (kind) {
      case 0: // 眼镜
        return '<g stroke="#2a2440" fill="none" stroke-width="1.6"><circle cx="24" cy="28" r="5"/><circle cx="40" cy="28" r="5"/><path d="M29 28 h6"/></g>';
      case 1: // 书本
        return '<g ' + OUT + '><rect x="19" y="48" width="26" height="18" rx="2" fill="' + c.light + '"/><path d="M32 48 v18" stroke="' + c.dark + '" stroke-width="1.6"/></g>';
      case 2: // 咖啡杯
        return '<g ' + OUT + '><path d="M40 50 h14 v12 q0 5 -7 5 t-7 -5z" fill="' + c.light + '"/><path d="M54 53 h3 q4 0 3 5 t-5 3" fill="none"/></g>';
      case 3: // 头带
        return '<g ' + OUT + '><path d="M18 24 q14 -12 28 0" fill="none" stroke="' + c.light + '" stroke-width="3"/><path d="M46 22 l8 -4 -2 7z" fill="' + c.light + '"/></g>';
      case 4: // 帽子
        return '<g ' + OUT + '><path d="M18 22 q14 -18 28 0z" fill="' + c.dark + '"/><path d="M14 22 h36" fill="none"/></g>';
      default: // 耳机
        return '<g ' + OUT + '><path d="M18 28 q0 -16 14 -16 t14 16" fill="none" stroke="' + c.light + '" stroke-width="3"/><rect x="14" y="26" width="6" height="10" rx="2" fill="' + c.light + '"/><rect x="44" y="26" width="6" height="10" rx="2" fill="' + c.light + '"/></g>';
    }
  }

  function hero(index, traitId) {
    var c = PALETTE[index % 4];
    var a = accessory(hashIndex(traitId), c);
    return '<svg class="hero-art" viewBox="0 0 64 76" ' + OUT + ' aria-hidden="true">' +
      '<ellipse cx="32" cy="72" rx="19" ry="4" fill="rgba(0,0,0,.28)" stroke="none"/>' +
      '<path d="M17 76 q0 -19 15 -19 t15 19z" fill="' + c.dark + '"/>' +
      '<path d="M24 54 h16 v7 h-16z" fill="' + c.light + '"/>' +
      '<path d="M28 57 h8" stroke="' + c.dark + '" stroke-width="1.6"/>' +
      '<circle cx="32" cy="30" r="15" fill="' + c.main + '"/>' +
      '<path d="M17 29 q0 -17 15 -17 t15 17 q-6 -6 -15 -6 t-15 6z" fill="' + c.dark + '"/>' +
      '<ellipse cx="26" cy="32" rx="2" ry="2.6" fill="#1a1526" stroke="none"/>' +
      '<ellipse cx="38" cy="32" rx="2" ry="2.6" fill="#1a1526" stroke="none"/>' +
      '<path d="M29 39 q3 2 6 0" fill="none"/>' +
      a + '</svg>';
  }

  window.BattleArt = {
    boss: function (sprite) { return BOSSES[sprite] || BOSSES['boss-read']; },
    hero: hero,
    palette: PALETTE
  };
})();
