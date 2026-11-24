/* ============================================================
   解码TA · 相处盲盒局 — 简笔画素材库（UI美化版新增）
   纯内联 SVG，零外部依赖。人物 id / 成就 id → 简笔线稿。
   所有图形用 currentColor 描边，颜色由 CSS 控制。
   ============================================================ */
(function () {
  'use strict';

  // 64×64 人物简笔画。共用头部骨架，特征片段体现 16 种性格。
  // 每个片段都是合法的 <svg> 内部元素字符串。
  var FACE = {
    '01': { // 嘴硬心软星人：炸毛 + 抱臂 + 小心心
      hair: '<path d="M17 27 L14 15 L23 20 L27 11 L33 18 L40 12 L43 21 L50 17 L47 28"/>',
      eyes: '<path d="M24 31 l5 1 M36 32 l5 -1"/>',
      mouth: '<path d="M29 39 q3 -3 6 0"/>',
      item: '<path d="M17 54 l10 -5 M47 54 l-10 -5"/><path d="M32 57 c-5 -4 -7 -6 -7 -8 a3 3 0 0 1 7 -1 a3 3 0 0 1 7 1 c0 2 -2 4 -7 8z" fill="#E0A3B4" stroke="#E0A3B4" stroke-width="1"/>'
    },
    '02': { // 已读焦虑者：齐刘海 + 手机 + 省略号 + 汗滴
      hair: '<path d="M16 28 q0 -17 16 -17 t16 17 l-4 -5 -4 5 -4 -5 -4 5 -4 -5 -4 5 -4 -5z"/>',
      eyes: '<path d="M24 32 h4 M36 32 h4"/>',
      mouth: '<path d="M29 40 q3 -2 6 0"/>',
      item: '<rect x="25" y="45" width="14" height="11" rx="2"/><path d="M28 50 h8"/><path d="M49 27 q4 5 0 7 a3 3 0 0 1 0 -7z" fill="#7FA8C9" stroke="#7FA8C9" stroke-width="1"/><text x="12" y="38" font-size="11" fill="currentColor" stroke="none">···</text>'
    },
    '03': { // 热情越界者：张嘴大笑 + 张开双臂 + 闪光
      hair: '<path d="M16 26 q2 -16 16 -16 t16 16 M16 26 q4 -8 8 -9 M48 26 q-4 -8 -8 -9"/>',
      eyes: '<path d="M23 31 q3 -4 6 0 M35 31 q3 -4 6 0"/>',
      mouth: '<path d="M26 38 q6 8 12 0 z" fill="currentColor" opacity=".18"/>',
      item: '<path d="M18 46 L6 39 M46 46 L58 39 M6 39 l-3 -5 M6 39 l-4 3 M58 39 l3 -5 M58 39 l4 3"/><path d="M52 14 v6 M49 17 h6 M9 17 v5 M7 19 h5"/>'
    },
    '04': { // 佛系疏离者：闭眼 + 平嘴 + 小叶子
      hair: '<path d="M17 27 q1 -16 15 -16 t15 16 M17 27 q6 -6 10 -6 M47 27 q-6 -6 -10 -6"/>',
      eyes: '<path d="M22 32 q3 2 6 0 M36 32 q3 2 6 0"/>',
      mouth: '<path d="M29 40 h6"/>',
      item: '<path d="M32 48 q8 -1 10 -8 q-9 0 -10 8z"/><path d="M32 48 q-1 6 0 9"/>'
    },
    '05': { // 完美主义班长：眼镜 + 整齐分缝 + 清单板
      hair: '<path d="M16 27 q0 -17 16 -17 t16 17 M32 10 v9 M20 21 q6 -4 12 -3 M44 21 q-6 -4 -12 -3"/>',
      eyes: '<circle cx="25" cy="32" r="5"/><circle cx="39" cy="32" r="5"/><path d="M30 32 h4 M20 31 l-5 -2 M44 31 l5 -2"/>',
      mouth: '<path d="M29 41 h6"/>',
      item: '<rect x="21" y="44" width="22" height="16" rx="2"/><path d="M26 49 h3 M26 54 h12 M41 49 h2 M32 44 v-3"/>'
    },
    '06': { // 老好人：垂眼 + 苦笑 + 背后手
      hair: '<path d="M17 28 q0 -17 15 -17 t15 17 M17 28 q3 -7 6 -8 M47 28 q-3 -7 -6 -8"/>',
      eyes: '<path d="M22 31 l6 3 M36 34 l6 -3"/>',
      mouth: '<path d="M27 41 q5 -3 10 0"/>',
      item: '<path d="M18 48 q-8 1 -10 7 M46 48 q8 1 10 7 M26 56 h12"/><path d="M30 33 v3 M34 33 v3" opacity=".5"/>'
    },
    '07': { // 社交蝴蝶：花朵发饰 + 多个对话气泡
      hair: '<path d="M16 27 q0 -17 16 -17 t16 17 M16 27 q4 -6 8 -7 M48 27 q-4 -6 -8 -7"/>',
      eyes: '<path d="M23 31 q3 -4 6 0 M35 31 q3 -4 6 0"/>',
      mouth: '<path d="M27 39 q5 5 10 0"/>',
      item: '<circle cx="45" cy="16" r="3"/><circle cx="41" cy="16" r="3"/><circle cx="43" cy="12" r="3"/><circle cx="43" cy="19" r="3"/><circle cx="43" cy="16" r="1.5" fill="#F4E9D3"/><path d="M8 45 q0 -6 7 -6 h4 q7 0 7 6 q0 6 -7 6 h-4 q-7 0 -7 -6z M13 51 l2 4 3 -4"/><path d="M45 41 q0 -5 6 -5 h3 q6 0 6 5 q0 5 -6 5 h-3 q-6 0 -6 -5z" opacity=".65"/>'
    },
    '08': { // 玻璃心学霸：圆框眼镜 + 书本 + 泪滴
      hair: '<path d="M17 27 q0 -16 15 -16 t15 16 M17 27 q5 -9 11 -8 M47 27 q-5 -9 -11 -8"/>',
      eyes: '<circle cx="25" cy="32" r="5"/><circle cx="39" cy="32" r="5"/><path d="M30 32 h4"/><circle cx="25" cy="32" r="1"/><circle cx="39" cy="32" r="1"/>',
      mouth: '<path d="M29 41 q3 -3 6 0"/>',
      item: '<path d="M43 31 q3 4 0 6 a2.5 2.5 0 0 1 0 -6z" fill="#7FE0D0" stroke="#7FE0D0" stroke-width="1"/><path d="M17 48 h30 v12 h-30z M32 48 v12 M20 52 h8 M36 52 h8"/>'
    },
    '09': { // 冷幽默王者：墨镜 + 坏笑 + 吐槽气泡
      hair: '<path d="M16 26 q2 -17 16 -17 t16 17 M16 26 l6 -6 M48 26 l-6 -6 M24 13 l4 8 M40 13 l-4 8"/>',
      eyes: '<path d="M19 29 h26 v8 h-26z M19 29 l-3 -3 M45 29 l3 -3"/><path d="M22 31 l6 4 M37 35 l6 -4" opacity=".5"/>',
      mouth: '<path d="M28 41 q5 3 9 -2"/>',
      item: '<path d="M44 43 q0 -6 8 -6 h5 q7 0 7 6 q0 6 -7 6 h-5 l-5 4 1 -5 q-3 -2 -4 -5z" transform="translate(-9 3)" opacity=".8"/><text x="47" y="46" font-size="10" fill="currentColor" stroke="none">哈</text>'
    },
    '10': { // 拖延症晚期：乱发 + 时钟 + 摊手
      hair: '<path d="M16 28 l-3 -10 7 4 -2 -10 8 6 2 -10 6 9 6 -8 1 10 7 -5 -1 10 5 -2 -4 8z"/>',
      eyes: '<path d="M22 33 q3 2 6 0 M36 33 q3 2 6 0"/>',
      mouth: '<path d="M28 41 q4 2 8 0"/>',
      item: '<circle cx="48" cy="50" r="9"/><path d="M48 45 v5 l4 3"/><path d="M16 47 l-7 6 M48 47 l6 6" opacity=".7"/>'
    },
    '11': { // 边界感战士：束发带 + 手掌"停"
      hair: '<path d="M17 27 q0 -17 15 -17 t15 17 M17 25 h30 M32 10 v6"/>',
      eyes: '<path d="M23 32 h5 M36 32 h5"/>',
      mouth: '<path d="M29 40 h6"/>',
      item: '<path d="M44 38 v12 M40 41 v8 M48 41 v8 M36 44 l-4 -3 M52 44 l4 -3 M38 50 q6 6 12 0"/>'
    },
    '12': { // 情绪过山车：卷发 + 波浪嘴 + 上下箭头
      hair: '<path d="M17 28 q-4 -8 2 -13 q4 -8 11 -4 q6 -7 12 0 q9 -2 7 8 q4 6 -2 10 M17 28 q3 -6 7 -6 M47 28 q-3 -6 -7 -6"/>',
      eyes: '<path d="M23 31 q3 -4 6 0 M35 31 q3 -4 6 0"/>',
      mouth: '<path d="M26 39 q3 -5 6 0 q3 5 6 0"/>',
      item: '<path d="M50 16 v12 M46 20 l4 -4 4 4 M14 48 v12 M10 56 l4 4 4 -4"/><path d="M22 52 q10 -8 20 0" opacity=".5"/>'
    },
    '13': { // 深藏不露型：兜帽阴影 + 只露眼睛 + 省略号
      hair: '<path d="M12 34 q0 -22 20 -22 t20 22 q0 10 -6 14 H18 q-6 -4 -6 -14z"/><path d="M18 30 q4 -12 14 -12 t14 12 q-6 -4 -14 -4 t-14 4z" fill="currentColor" opacity=".14"/>',
      eyes: '<path d="M24 31 h5 M35 31 h5"/>',
      mouth: '<path d="M30 40 q2 1 4 0"/>',
      item: '<text x="25" y="57" font-size="12" fill="currentColor" stroke="none">···</text><path d="M21 48 h22" opacity=".5"/>'
    },
    '14': { // 焦虑卷王：丸子头 + 咖啡 + 书签
      hair: '<path d="M17 27 q0 -16 15 -16 t15 16 M26 13 q6 -9 12 0 M32 10 q0 -7 5 -6"/><circle cx="37" cy="6" r="4"/>',
      eyes: '<path d="M22 31 l6 2 M36 33 l6 -2"/>',
      mouth: '<path d="M29 41 q3 -2 6 0"/>',
      item: '<path d="M40 45 h14 v11 q0 4 -7 4 t-7 -4z M54 48 h3 q4 0 3 5 t-5 3"/><path d="M43 42 q-2 -3 1 -5 M48 42 q-2 -3 1 -5" opacity=".6"/><path d="M15 45 h18 v14 h-18z M19 49 h10" opacity=".8"/>'
    },
    '15': { // 依赖型朋友：双马尾 + 挥手 + 爱心
      hair: '<path d="M17 26 q0 -16 15 -16 t15 16 M16 25 q-8 2 -7 12 q1 8 6 8 M48 25 q8 2 7 12 q-1 8 -6 8"/>',
      eyes: '<path d="M23 31 q3 -4 6 0 M35 31 q3 -4 6 0"/>',
      mouth: '<path d="M27 39 q5 6 10 0"/>',
      item: '<path d="M48 44 l6 -8 M50 41 l1 -7 M53 40 l4 -5 M55 43 l5 -3"/><path d="M20 55 c-4 -3 -5 -5 -5 -6 a3 3 0 0 1 6 -1 a3 3 0 0 1 6 1 c0 1 -1 3 -7 6z" fill="#E0A3B4" stroke="#E0A3B4" stroke-width="1"/>'
    },
    '16': { // 人间清醒：利落短发 + 平静闭眼 + 茶杯
      hair: '<path d="M16 27 q0 -17 16 -17 t16 17 M16 27 q8 -8 16 -8 t16 8 M32 10 v7"/>',
      eyes: '<path d="M22 32 q3 2 6 0 M36 32 q3 2 6 0"/>',
      mouth: '<path d="M29 40 h6"/>',
      item: '<path d="M38 46 h17 v10 q0 4 -8 4 t-9 -4z M55 49 h3 q4 0 3 5 t-5 3"/><path d="M41 43 q-2 -3 1 -5 M47 43 q-2 -3 1 -5" opacity=".6"/><path d="M16 46 h14" opacity=".5"/>'
    }
  };

  // 32×32 成就徽章简笔画
  var ACH = {
    A01: '<path d="M9 27 h14 M12 27 V9 l8 3 -8 4"/><path d="M12 9 V5"/><circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"/>',
    A02: '<path d="M4 9 q6 -3 12 1 q6 -4 12 -1 v16 q-6 -3 -12 1 q-6 -4 -12 -1z"/><path d="M16 10 v16"/><path d="M9 15 q3 -3 5 0 q-3 3 -5 0z M18 15 q3 -3 5 0 q-3 3 -5 0z"/>',
    A03: '<rect x="7" y="5" width="15" height="19" rx="2" transform="rotate(-8 14 14)"/><rect x="11" y="8" width="15" height="19" rx="2" transform="rotate(6 18 17)"/><path d="M15 13 h7 M15 17 h5"/>',
    A04: '<path d="M16 3 a9 9 0 0 1 5 16 v3 h-10 v-3 a9 9 0 0 1 5 -16z"/><path d="M12 25 h8 M13 28 h6 M16 2 v-1 M4 10 h2 M26 10 h2 M7 5 l1 1 M25 5 l-1 1"/>',
    A05: '<path d="M6 5 h14 v22 H6z M9 10 h8 M9 14 h6"/><path d="M21 22 l7 -7 3 3 -7 7 -4 1z M27 12 l3 3"/>',
    A06: '<path d="M4 8 h13 v9 h-7 l-4 4 v-4 H4z"/><path d="M18 15 h10 v8 h-7 l-3 3z"/><path d="M10 12 c-2 -2 -4 -1 -4 1 a2 2 0 0 0 4 0 a2 2 0 0 0 4 0 c0 -2 -2 -3 -4 -1z" transform="translate(5 -1)"/>',
    A07: '<path d="M16 19 c-5 -4 -8 -6 -8 -9 a4 4 0 0 1 8 -1 a4 4 0 0 1 8 1 c0 3 -3 5 -8 9z"/><path d="M5 26 q4 -5 8 -2 M27 26 q-4 -5 -8 -2 M7 29 h18"/>',
    A08: '<path d="M5 8 h8 v8 H5z M19 16 h8 v8 h-8z"/><path d="M13 12 h6 q5 0 5 5 M19 24 h-6 q-5 0 -5 -5"/><path d="M17 14 l3 3 -3 3 M15 18 l-3 3 3 3"/>',
    A09: '<path d="M20 4 a12 12 0 1 0 8 18 A10 10 0 0 1 20 4z"/><path d="M24 7 l1 2 2 1 -2 1 -1 2 -1 -2 -2 -1 2 -1z M8 9 l1 2 2 1 -2 1 -1 2 -1 -2 -2 -1 2 -1z"/>',
    A10: '<path d="M4 16 l24 -10 -9 23 -4 -9z"/><path d="M15 20 l13 -14 M15 20 l0 9"/>',
    A11: '<path d="M4 7 h11 v18 H4z M15 11 h11 v14 H15z M18 15 h5 M18 19 h4"/><circle cx="10" cy="13" r="3"/><path d="M12 15 l3 3"/>',
    A12: '<path d="M5 10 l5 5 6 -9 6 9 5 -5 -3 17 H8z"/><path d="M8 27 h16"/><circle cx="16" cy="21" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="20" r="1.5" fill="currentColor" stroke="none"/><circle cx="21" cy="20" r="1.5" fill="currentColor" stroke="none"/>'
  };

  function svgPersona(id, cls) {
    var f = FACE[String(id)] || FACE['13'];
    return '<svg class="' + (cls || '') + '" viewBox="0 0 64 64" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="32" cy="30" r="17"/>' + f.hair + f.eyes + f.mouth + f.item +
      '<path d="M15 63 q0 -13 17 -13 t17 13" opacity=".35"/>' +
      '</svg>';
  }

  function svgAchievement(id, cls) {
    var body = ACH[String(id).toUpperCase()] || ACH.A01;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 32 32" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  window.DecodeArt = { persona: svgPersona, achievement: svgAchievement };
})();
