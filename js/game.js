/* ============================================================
   解码TA · 相处盲盒局 — 核心逻辑
   纯原生 JS，无框架 / 无外部依赖。
   数据来源：window.GAME_DATA（js/data.js，由文案组产出）
   所有注释与提示均使用中文，便于后续维护。
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     0. 基础常量与小工具
     ------------------------------------------------------------ */
  var PREFIX = 'decodeTa_';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // HTML 文本转义：文案来自 data.js，注入模板前统一转义，避免引号/尖括号破坏结构
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setText(sel, v) {
    var el = $(sel);
    if (el) el.textContent = v == null ? '' : String(v);
  }

  function getDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ------------------------------------------------------------
     1. 存档层：localStorage 封装，键名统一 decodeTa_ 前缀
     ------------------------------------------------------------ */
  var S = {
    key: function (k) { return PREFIX + k; },
    getRaw: function (k) {
      try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; }
    },
    setRaw: function (k, v) {
      try { localStorage.setItem(PREFIX + k, String(v)); } catch (e) { /* 无痕模式等场景静默失败 */ }
    },
    getJSON: function (k, fb) {
      var raw = this.getRaw(k);
      if (raw === null) return fb;
      try { return JSON.parse(raw); } catch (e) { return fb; }
    },
    setJSON: function (k, v) { this.setRaw(k, JSON.stringify(v)); },
    getNum: function (k, fb) {
      fb = typeof fb === 'number' ? fb : 0;
      var raw = this.getRaw(k);
      if (raw === null) return fb;
      var n = Number(raw);
      return isNaN(n) ? fb : n;
    },
    setNum: function (k, v) { this.setRaw(k, v); }
  };

  // 每次需要时重新组装快照，避免多处缓存不同步
  function getStats() {
    return {
      playCount: S.getNum('playCount'),
      achievements: S.getJSON('achievements', []),
      enlightenments: S.getJSON('enlightenments', []),
      codex: S.getJSON('codex', {}),
      seenPersonas: S.getJSON('seenPersonas', []),
      consecutiveDays: S.getNum('consecutiveDays'),
      lastPlayDate: S.getRaw('lastPlayDate') || '',
      revealSegments: S.getNum('revealSegments'),
      shareCount: S.getNum('shareCount'),
      manualAuthors: S.getNum('manualAuthors'),
      manualReads: S.getNum('manualReads'),
      gentleStreak: S.getNum('gentleStreak'),
      unusualStreak: S.getNum('unusualStreak'),
      nightOwl: S.getNum('nightOwl') > 0,
      selectedCounts: S.getJSON('selectedCounts', {})
    };
  }

  /* ------------------------------------------------------------
     2. 运行时状态
     ------------------------------------------------------------ */
  var state = {
    data: null,
    personas: [],
    situations: [],
    toneRules: {},
    achievements: [],
    questions: [],
    dailyQuotes: [],
    persona: null,        // 本局抽到的人物卡（玩家遇到的人）
    situation: null,      // 本局抽到的情境卡
    selectedIndex: -1,    // 本局选中的选项下标 0/1/2
    triedOptions: [],     // 当前这组人物+情境下，已经看过揭晓的选项下标（换结局用）
    revealOpened: {},     // 三段揭晓的展开状态
    currentEnlightId: null
  };

  /* ------------------------------------------------------------
     3. 数据兜底：data.js 缺失或字段不全时给出友好提示 / 默认文案
     ------------------------------------------------------------ */
  var FALLBACK_ACHIEVEMENTS = [
    { id: 'init',           name: '初来乍到',   desc: '完成 1 局',            condition: '完成1局',       reward: '盲盒初体验' },
    { id: 'learner',        name: '虚心学习',   desc: '看完所有揭晓',          condition: '看完所有揭晓',   reward: '会看人了' },
    { id: 'collector',      name: '集卡达人',   desc: '抽到 8 种人物卡',        condition: '抽到8种人物卡', reward: '人际关系观察员' },
    { id: 'enlightened',    name: '顿悟收藏家', desc: '集齐 12 张顿悟卡',       condition: '集齐12张顿悟卡', reward: '人间清醒候选人' },
    { id: 'author',         name: '说明书作者', desc: '写一份使用说明书',      condition: '写一份说明书',   reward: '自我表达者' },
    { id: 'recognized',     name: '被人读懂',   desc: '生成 3 张分享图',        condition: '生成3张分享图', reward: '被看见的温暖' },
    { id: 'empathetic',     name: '共情大师',   desc: '连续 5 局选温和',        condition: '连续5局选温和', reward: '温柔且坚定' },
    { id: 'contrarian',     name: '反直觉玩家', desc: '连续 3 局选最不像自己的', condition: '连续3局选最不像自己的', reward: '跳出惯性' },
    { id: 'nightowl',       name: '深夜玩家',   desc: '22:00-2:00 完成 1 局',   condition: '22:00-2:00完成1局', reward: '夜猫子勋章' },
    { id: 'sharer',         name: '分享达人',   desc: '分享 3 次',             condition: '分享3次',       reward: '传递顿悟' },
    { id: 'reader',         name: '说明书读者', desc: '读 10 份说明书',        condition: '读10份说明书',  reward: '愿意了解他人' },
    { id: 'allachievement', name: '全成就',     desc: '解锁其余全部成就',      condition: '解锁全部成就',   reward: '解码大师' }
  ];

  var FALLBACK_QUESTIONS = [
    '我的性格是：',
    '我生气的时候，希望你：',
    '我嘴上说“没事”，其实是：',
    '我最怕别人误会我：',
    '如果你这样做，我会超开心：',
    '我的雷区是：',
    '我最近的状态是：',
    '我想对正在读这份说明书的你说：'
  ];

  var FALLBACK_QUOTES = [
    '今天也试着，把“你怎么这样”换成“你怎么了”。',
    '别人没回应，不一定是不在乎，也可能是不知道怎么开口。',
    '慢一点下结论，很多时候真相在第二层。',
    '你看见的冷淡，可能是对方正在努力维持体面。'
  ];

  function showDataError(msg) {
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    var err = $('#screen-error');
    if (err) err.classList.add('active');
    setText('#errMessage', msg || '游戏数据没能成功加载。');
  }

  function loadData() {
    var d = window.GAME_DATA;
    // 核心数据缺失：人物卡 / 情境卡 必须存在，否则无法进行游戏
    if (!d || !Array.isArray(d.personas) || d.personas.length === 0 ||
        !Array.isArray(d.situations) || d.situations.length === 0) {
      showDataError('没有读到 js/data.js 里的游戏数据，游戏暂时无法开始。');
      return false;
    }
    state.data = d;
    state.personas = d.personas;
    state.situations = d.situations;
    state.toneRules = (d.toneRules && typeof d.toneRules === 'object') ? d.toneRules : {};
    state.achievements = (Array.isArray(d.achievements) && d.achievements.length)
      ? d.achievements : FALLBACK_ACHIEVEMENTS;
    state.questions = (d.manual && Array.isArray(d.manual.questions) && d.manual.questions.length)
      ? d.manual.questions : FALLBACK_QUESTIONS;
    state.dailyQuotes = (Array.isArray(d.dailyQuotes) && d.dailyQuotes.length)
      ? d.dailyQuotes : FALLBACK_QUOTES;
    return true;
  }

  /* ------------------------------------------------------------
     4. 成就判定：稳健映射，兼容「人话版」condition 字段
        策略：先按 id 关键词匹配内置规则 → 再按名称/描述/condition 匹配
              → 仍无法识别时用四个基础成就兜底；condition 中的数字动态作为阈值
     ------------------------------------------------------------ */
  // 说明：nameKeys 是最高优先级匹配键。文案组成就名称高度语义化，
  // 而 condition 里常顺带出现别的成就词（如 A01 条件含「揭晓/顿悟卡」），
  // 若直接全文匹配会把「初来乍到」误判成「顿悟收藏家」，故必须先按名称定位。
  var ACH_RULES = [
    { keys: ['allachievement', '全成就', '全部成就', 'all'], nameKeys: ['全成就'], special: 'all' },
    { keys: ['enlightened', '顿悟收藏', '顿悟卡', '12张', 'enlight'], nameKeys: ['顿悟收藏家'], metric: 'enlightenments', def: 12, dyn: true },
    { keys: ['collector', '集卡', '人物卡', '8种', 'card'], nameKeys: ['集卡达人'], metric: 'seenPersonas', def: 8, dyn: true },
    { keys: ['learner', '虚心', '看完', '读完', '揭晓', 'learn'], nameKeys: ['虚心学习'], metric: 'revealSegments', def: 3, dyn: true },
    { keys: ['init', '初来', '新手', '完成1局', 'new', 'start', 'begin'], nameKeys: ['初来乍到'], metric: 'playCount', def: 1, dyn: true },
    // 「被人读懂 / 获赞」按单人版等价条件：生成说明书分享图
    { keys: ['被人读懂', '获赞', '读懂', 'liked', 'popular', 'recognized'], nameKeys: ['被人读懂'], metric: 'shareCount', def: 1, dyn: true },
    { keys: ['author', '说明书作者', '写说明书', '上传', '创作'], nameKeys: ['说明书作者'], metric: 'manualAuthors', def: 1, dyn: true },
    { keys: ['empath', '共情', '温和', 'empathetic'], nameKeys: ['共情大师'], metric: 'gentleStreak', def: 5, dyn: true },
    // 简版判定：连续 3 局选「冷处理」
    { keys: ['contrarian', '反直觉', '反常识', '冷处理', '不像自己'], nameKeys: ['反直觉玩家'], metric: 'unusualStreak', def: 3, dyn: true },
    { keys: ['nightowl', '深夜', '夜猫', 'night'], nameKeys: ['深夜玩家'], metric: 'nightOwl', def: 1, dyn: false },
    { keys: ['sharer', '分享达人', '分享', 'share'], nameKeys: ['分享达人'], metric: 'shareCount', def: 3, dyn: true },
    { keys: ['reader', '说明书读者', '读说明书', '回看', 'read'], nameKeys: ['说明书读者'], metric: 'manualReads', def: 3, dyn: true }
  ];

  function achText(ach) {
    return [ach.id, ach.name, ach.desc, ach.condition, ach.reward]
      .filter(function (x) { return x != null; }).join(' ').toLowerCase();
  }

  function matchRule(ach) {
    var name = String(ach.name || '').toLowerCase();
    var id = String(ach.id || '').toLowerCase();
    var i, j, r;

    // 第一优先：成就名称（最可靠，避免条件文案里串词）
    for (i = 0; i < ACH_RULES.length; i++) {
      r = ACH_RULES[i];
      var nameKeys = r.nameKeys || [];
      for (j = 0; j < nameKeys.length; j++) {
        if (name.indexOf(nameKeys[j]) !== -1) return r;
      }
    }
    // 第二优先：id 命中
    for (i = 0; i < ACH_RULES.length; i++) {
      r = ACH_RULES[i];
      for (j = 0; j < r.keys.length; j++) {
        if (id.indexOf(r.keys[j]) !== -1) return r;
      }
    }
    // 第三优先：描述 / condition 文案
    var t = [ach.desc, ach.condition].filter(function (x) { return x != null; })
      .join(' ').toLowerCase();
    for (i = 0; i < ACH_RULES.length; i++) {
      r = ACH_RULES[i];
      for (j = 0; j < r.keys.length; j++) {
        if (t.indexOf(r.keys[j]) !== -1) return r;
      }
    }
    return null;
  }

  function extractThreshold(condition, def) {
    if (typeof condition !== 'string') return def;
    var m = condition.match(/(\d+)/);
    if (!m) return def;
    var n = parseInt(m[1], 10);
    // 过滤异常大数（例如「22:00」会被取成 22），保留合理阈值
    return (n >= 1 && n <= 50) ? n : def;
  }

  function isAllAchievement(ach) {
    var rule = matchRule(ach);
    return !!(rule && rule.special === 'all');
  }

  // 基础成就兜底：即便文案组的 id / condition 完全无法识别，这四类仍能正确触发
  function fallbackCheck(ach, stats) {
    var t = achText(ach);
    if (/初来|完成1局|完成一局|new|init|start|begin/.test(t)) return stats.playCount >= 1;
    if (/看完|揭晓|learn|read/.test(t)) return stats.revealSegments >= 3;
    if (/8种|八种|集卡|人物卡|card/.test(t)) return stats.seenPersonas.length >= 8;
    if (/12张|十二张|顿悟|enlight/.test(t)) return stats.enlightenments.length >= 12;
    return false;
  }

  function checkAchievement(ach, stats, unlockedIds) {
    var rule = matchRule(ach);
    if (!rule) return fallbackCheck(ach, stats);

    if (rule.special === 'all') {
      var others = state.achievements.filter(function (a) { return a !== ach; })
        .map(function (a) { return String(a.id); });
      return others.length > 0 && others.every(function (id) {
        return unlockedIds.indexOf(id) !== -1;
      });
    }

    var threshold = rule.dyn ? extractThreshold(ach.condition, rule.def) : rule.def;
    var value = stats[rule.metric];
    if (typeof value === 'boolean') return value === true;
    if (Array.isArray(value)) return value.length >= threshold;
    return Number(value || 0) >= threshold;
  }

  // 统一入口：在关键节点调用，负责判定、落盘、弹提示
  function evaluateAchievements() {
    var stats = getStats();
    var unlocked = stats.achievements.slice();
    var newly = [];

    // 两轮：先普通成就，再「全成就」，保证后者不会因顺序漏判
    var regular = state.achievements.filter(function (a) { return !isAllAchievement(a); });
    var allOnes = state.achievements.filter(isAllAchievement);

    function run(list) {
      list.forEach(function (ach) {
        if (!ach || !ach.id) return;
        var id = String(ach.id);
        if (unlocked.indexOf(id) !== -1) return;
        if (checkAchievement(ach, stats, unlocked)) {
          unlocked.push(id);
          newly.push(ach);
        }
      });
    }
    run(regular);
    run(allOnes);

    if (newly.length) {
      S.setJSON('achievements', unlocked);
      newly.forEach(function (ach, idx) {
        setTimeout(function () { showAchievementToast(ach); }, idx * 420);
      });
    }
  }

  /* ------------------------------------------------------------
     5. 提示浮层
     ------------------------------------------------------------ */
  function toast(msg, isAchievement, ach) {
    var area = $('#toastArea');
    if (!area) return;
    var el = document.createElement('div');
    if (isAchievement) {
      el.className = 'toast toast-ach';
      el.innerHTML = '<div class="toast-title">成 就 解 锁</div>' +
        '<div class="toast-name">' + esc(ach && ach.name || '新成就') + '</div>' +
        '<div class="toast-desc">' + esc(ach && ach.desc || '') + '</div>';
    } else {
      el.className = 'toast';
      el.innerHTML = '<div class="toast-msg">' + esc(msg) + '</div>';
    }
    area.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, isAchievement ? 3000 : 2200);
  }

  function showAchievementToast(ach) { toast('', true, ach); }

  /* ------------------------------------------------------------
     6. 页面导航：单页 DOM 显隐切换
     ------------------------------------------------------------ */
  function go(name) {
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    var target = $('#screen-' + name);
    if (target) target.classList.add('active');
    if (name === 'collection') renderCollection();
    window.scrollTo(0, 0);
  }

  // 从收藏册回看已生成的说明书：计入「说明书读者」进度（A11）
  function viewManualFromCollection() {
    var dataUrl = S.getRaw('manualImage');
    if (!dataUrl) { toast('还没有生成过说明书，先去写一份吧'); return; }
    var img = $('#manualImage');
    if (img) img.src = dataUrl;
    S.setNum('manualReads', S.getNum('manualReads') + 1);
    go('manual-preview');
    evaluateAchievements();
  }

  /* ------------------------------------------------------------
     7. 每日一抽：按日期哈希固定当天人物卡 + 一条每日观察
     ------------------------------------------------------------ */
  function refreshDaily() {
    var today = getDateStr(new Date());
    var last = S.getJSON('lastDaily', null);
    if (!last || last.date !== today) {
      var idx = hashStr(today) % state.personas.length;
      var p = state.personas[idx];
      var qIndex = hashStr(today + 'quote') % state.dailyQuotes.length;
      last = { date: today, personaId: p.id, quote: state.dailyQuotes[qIndex] };
      S.setJSON('lastDaily', last);
    }
    var persona = state.personas.filter(function (x) { return x.id === last.personaId; })[0] || state.personas[0];
    if (!persona) return;
    setText('#dailyDate', today.slice(5));
    setText('#dailyName', persona.name);
    setText('#dailyIntro', persona.intro);
    setText('#dailyQuote', last.quote || '');
    var card = $('#dailyCard');
    if (card) card.hidden = false;
  }

  // 连续签到：以「当天首次打开」为签到点
  function updateCheckIn() {
    var today = getDateStr(new Date());
    var last = S.getRaw('lastPlayDate');
    if (last === today) return;
    var yesterday = getDateStr(new Date(Date.now() - 86400000));
    S.setNum('consecutiveDays', last === yesterday ? S.getNum('consecutiveDays') + 1 : 1);
    S.setRaw('lastPlayDate', today);
  }

  /* ------------------------------------------------------------
     8. 抽卡 → 三选一
     ------------------------------------------------------------ */
  // 填人物卡区域
  function fillPersonaCard() {
    setText('#drawPersonaName', state.persona.name);
    setText('#drawPersonaIntro', state.persona.intro);
    var tone = state.toneRules[state.persona.tone] || {};
    setText('#drawPersonaTone', '语气：' + (tone.label || state.persona.tone));
    var tags = $('#drawPersonaTags');
    if (tags) {
      tags.innerHTML = (state.persona.tags || []).map(function (t) {
        return '<span class="tag">' + esc(t) + '</span>';
      }).join('');
    }
  }

  // 填情境卡区域
  function fillSituationCard() {
    setText('#drawSitCategory', state.situation.category);
    setText('#drawSitText', state.situation.text);
    setText('#drawSitIndex', '情境卡 · ' + state.situation.id);
  }

  // 把一张卡计入「见过的卡」，供集卡达人成就判定（重抽也计入）
  function recordSeenPersona(persona) {
    if (!persona) return;
    var seen = S.getJSON('seenPersonas', []);
    if (seen.indexOf(persona.id) === -1) {
      seen.push(persona.id);
      S.setJSON('seenPersonas', seen);
      evaluateAchievements();
    }
  }

  // 让某张卡重新播放翻牌动画
  function replayFlip(wrap) {
    if (!wrap) return;
    wrap.classList.remove('flipped');
    void document.body.offsetHeight; // 强制重排，保证动画可重复触发
    setTimeout(function () { wrap.classList.add('flipped'); }, 60);
  }

  function startDraw() {
    state.persona = pick(state.personas);
    state.situation = pick(state.situations);
    state.selectedIndex = -1;
    state.triedOptions = [];
    fillPersonaCard();
    fillSituationCard();
    recordSeenPersona(state.persona);

    // 重置翻牌状态并重新触发动画
    var pf = $('#personaFlip'), sf = $('#situationFlip'), btn = $('#btnToChoice');
    if (pf) pf.classList.remove('flipped');
    if (sf) sf.classList.remove('flipped');
    if (btn) btn.disabled = true;
    var rp = $('#btnRerollPersona'), rs = $('#btnRerollSituation');
    if (rp) rp.disabled = true;
    if (rs) rs.disabled = true;
    void document.body.offsetHeight; // 强制重排，保证动画可重复触发

    go('draw');
    setTimeout(function () { if (pf) pf.classList.add('flipped'); }, 240);
    setTimeout(function () { if (sf) sf.classList.add('flipped'); }, 760);
    setTimeout(function () {
      if (btn) btn.disabled = false;
      if (rp) rp.disabled = false;
      if (rs) rs.disabled = false;
    }, 1500);
  }

  // 重抽人物卡：只换人物卡，计入图鉴；情境卡保持不变
  function rerollPersona() {
    if (!state.personas || !state.personas.length) return;
    var pool = state.personas;
    // 尽量抽到与当前不同的一张，避免"重抽却没变"
    if (pool.length > 1 && state.persona) {
      var others = pool.filter(function (p) { return p.id !== state.persona.id; });
      state.persona = pick(others.length ? others : pool);
    } else {
      state.persona = pick(pool);
    }
    state.selectedIndex = -1;
    state.triedOptions = [];   // 换了人物卡 = 换了一组，重新统计结局
    fillPersonaCard();
    recordSeenPersona(state.persona);
    replayFlip($('#personaFlip'));
  }

  // 重抽情境卡：只换情境卡；人物卡保持不变
  function rerollSituation() {
    if (!state.situations || !state.situations.length) return;
    var pool = state.situations;
    if (pool.length > 1 && state.situation) {
      var others = pool.filter(function (s) { return s.id !== state.situation.id; });
      state.situation = pick(others.length ? others : pool);
    } else {
      state.situation = pick(pool);
    }
    state.selectedIndex = -1;
    state.triedOptions = [];   // 换了情境卡 = 换了一组，重新统计结局
    fillSituationCard();
    replayFlip($('#situationFlip'));
  }

  // 选项文案：直接使用 base 原文；overrides 整句改写仍优先保留（供后续微调单个选项）
  // 说明：已按需求移除 prefix/suffix 拼接，避免三个选项开头结尾出现重复文字。
  function adaptOption(option, index) {
    var rule = state.toneRules[state.persona.tone] || {};
    var sitId = String(state.situation.id || '');
    var padded = sitId.padStart(2, '0');

    if (rule.overrides && typeof rule.overrides === 'object') {
      var ov = rule.overrides;
      // 契约确认：overrides 键为「情境id-选项index」，index 为 0/1/2 对应 A/B/C
      // 例：{ "S01-2": "整句文案" }。整句命中时直接取代 base 原文。
      var n = index;
      var np = String(n).padStart(2, '0');
      var variants = [sitId + '-' + n, padded + '-' + n, sitId + '-' + np, padded + '-' + np];
      for (var k = 0; k < variants.length; k++) {
        if (typeof ov[variants[k]] === 'string' && ov[variants[k]].trim()) return ov[variants[k]];
      }
    }

    return String(option.base || '');
  }

  // 根据本组已看过的结局数，更新「试试另外两个结局」按钮文案
  function refreshTryOtherButtons() {
    var n = (state.triedOptions || []).length;
    var label = n <= 1 ? '试试另外两个结局'
      : (n === 2 ? '试试最后一个结局' : '再换一种回应看看');
    ['#btnTryOther', '#btnTryOtherReveal'].forEach(function (sel) {
      var btn = $(sel);
      if (btn) btn.textContent = label;
    });
  }

  function renderChoice() {
    setText('#choicePersona', state.persona.name + '（' + (state.persona.tone || '') + '）');
    setText('#choiceSituation', state.situation.text);

    // 换结局时提示本组进度；首次进入仍是原来的引导语
    var tried = state.triedOptions || [];
    setText('#choiceHint', tried.length
      ? '这组已经看过 ' + tried.length + ' 个结局，换个回应再看看'
      : '面对 TA，你会怎么说？');

    var list = $('#optionList');
    if (!list) return;
    var html = (state.situation.options || []).map(function (opt, i) {
      var done = tried.indexOf(i) !== -1;
      return '<button type="button" class="option' + (done ? ' tried' : '') + '" data-index="' + i + '">' +
               '<span class="opt-letter">' + 'ABC'[i] + '</span>' +
               '<span class="opt-main">' +
                 '<span class="opt-text">' + esc(adaptOption(opt, i)) + '</span>' +
                 (done ? '<span class="opt-done">已看过这个结局</span>' : '') +
               '</span>' +
             '</button>';
    }).join('');
    list.innerHTML = html;
    refreshTryOtherButtons();
    go('choice');
  }

  // 换结局：保留当前人物卡 + 情境卡，只回到三选一页重选
  function tryOtherEndings() {
    renderChoice();
  }

  // 连选类成就：存「当前连续数 + 最后完成日期」，跨天断连重置。
  // kind 取值 gentle（温和）/ unusual（冷处理）。
  function updateStreak(kind, hit) {
    var today = getDateStr(new Date());
    var lastDate = S.getRaw(kind + 'LastDate');
    var cur = S.getNum(kind + 'Streak');
    if (lastDate !== today) cur = 0;   // 不是今天完成的上一局 → 连续中断
    cur = hit ? cur + 1 : 0;
    S.setNum(kind + 'Streak', cur);
    S.setRaw(kind + 'LastDate', today);
  }

  function selectOption(index) {
    var options = state.situation.options || [];
    if (!options[index]) return;
    var intent = options[index].intent || '';
    state.selectedIndex = index;
    if (state.triedOptions.indexOf(index) === -1) state.triedOptions.push(index);
    refreshTryOtherButtons();

    // 1) 意图选择次数（存档要求字段）
    var counts = S.getJSON('selectedCounts', {});
    counts[intent] = (counts[intent] || 0) + 1;
    S.setJSON('selectedCounts', counts);

    // 2) 共情大师：连续 5 局选「温和」（intent=温和），跨天断连重置
    updateStreak('gentle', intent === '温和');

    // 3) 反直觉玩家：简版判定为连续 3 局选「冷处理」（intent=冷处理），跨天断连重置
    updateStreak('unusual', intent === '冷处理');

    // 4) 深夜玩家：22:00 - 02:00 完成一局
    var hour = new Date().getHours();
    if (hour >= 22 || hour < 2) S.setNum('nightOwl', 1);

    evaluateAchievements();
    renderReveal();
  }

  /* ------------------------------------------------------------
     9. 揭晓页：三段逐条点击展开
     ------------------------------------------------------------ */
  function renderReveal() {
    var rev = (state.situation.reveals || [])[state.selectedIndex] || {};
    setText('#revealContext', '你面对的是「' + state.persona.name + '」· ' + state.situation.text);

    var map = { inner: rev.inner, observer: rev.observer, tip: rev.tip };
    $$('.seg').forEach(function (seg) {
      var key = seg.getAttribute('data-seg');
      seg.classList.remove('open');
      seg.setAttribute('aria-expanded', 'false');
      var body = $('.seg-body', seg);
      if (body) body.textContent = map[key] || '（这一段文案还在路上）';
    });
    state.revealOpened = { inner: false, observer: false, tip: false };
    var claim = $('#btnClaim');
    if (claim) claim.hidden = true;
    var tryOther = $('#btnTryOtherReveal');
    if (tryOther) tryOther.hidden = true;
    go('reveal');
  }

  function toggleSegment(seg) {
    var key = seg.getAttribute('data-seg');
    if (state.revealOpened[key]) return;
    state.revealOpened[key] = true;
    seg.classList.add('open');
    seg.setAttribute('aria-expanded', 'true');

    // 每展开一段计入一次「看完揭晓」进度
    S.setNum('revealSegments', S.getNum('revealSegments') + 1);

    var allOpen = Object.keys(state.revealOpened).every(function (k) { return state.revealOpened[k]; });
    if (allOpen) {
      var claim = $('#btnClaim');
      if (claim) claim.hidden = false;
      var tryOther = $('#btnTryOtherReveal');
      if (tryOther) tryOther.hidden = false;
      evaluateAchievements();
    }
  }

  /* ------------------------------------------------------------
     10. 顿悟卡：收入收藏册 + 解锁人物图鉴的雷区/渴望
     ------------------------------------------------------------ */
  function claimEnlightenment() {
    var rev = (state.situation.reveals || [])[state.selectedIndex] || {};
    var id = String(state.situation.id) + '-' + state.selectedIndex;
    state.currentEnlightId = id;

    // 顿悟卡 id 集
    var ens = S.getJSON('enlightenments', []);
    if (ens.indexOf(id) === -1) ens.push(id);
    S.setJSON('enlightenments', ens);

    // 附带文案元信息：即使日后 data.js 变动，收藏册仍能显示当时的句子
    var meta = S.getJSON('enlightenmentsMeta', {});
    meta[id] = {
      key: rev.key || '',
      persona: state.persona.name,
      sit: state.situation.text
    };
    S.setJSON('enlightenmentsMeta', meta);

    // 人物图鉴：揭晓完成后才解锁雷区/渴望
    var codex = S.getJSON('codex', {});
    codex[state.persona.id] = {
      trigger: state.persona.trigger || '',
      desire: state.persona.desire || ''
    };
    S.setJSON('codex', codex);

    // 见过的卡（集卡达人判定用）
    var seen = S.getJSON('seenPersonas', []);
    if (seen.indexOf(state.persona.id) === -1) seen.push(state.persona.id);
    S.setJSON('seenPersonas', seen);

    // 完成一局
    S.setNum('playCount', S.getNum('playCount') + 1);

    renderEnlightenment();
    refreshTryOtherButtons();
    go('enlightenment');
    evaluateAchievements();
  }

  function renderEnlightenment() {
    var meta = S.getJSON('enlightenmentsMeta', {})[state.currentEnlightId] || {};
    setText('#enlightKey', meta.key || '这一刻，你读懂了 TA。');
    setText('#enlightMeta', '来自「' + (meta.persona || state.persona.name) + '」· ' + (meta.sit || ''));

    var note = $('#unlockNote');
    if (note) {
      note.innerHTML = '人物图鉴已解锁 <b>' + esc(state.persona.name) + '</b>：<br />' +
        '雷区：' + esc(state.persona.trigger || '—') + '<br />' +
        '渴望：' + esc(state.persona.desire || '—');
    }
  }

  /* ------------------------------------------------------------
     11. 分享：navigator.share → 剪贴板 → 生成图片降级
     ------------------------------------------------------------ */
  function shareEnlightenment() {
    var meta = S.getJSON('enlightenmentsMeta', {})[state.currentEnlightId] || {};
    var text = '我在《解码TA · 相处盲盒局》抽到一张顿悟卡：「' +
      (meta.key || '这一刻，你读懂了 TA。') + '」—— 这里练的是眼睛，生活需要你亲自上场。';

    S.setNum('shareCount', S.getNum('shareCount') + 1);
    evaluateAchievements();

    // 优先：系统分享面板
    if (navigator.share) {
      navigator.share({ title: '解码TA · 相处盲盒局', text: text, url: location.href })
        .then(function () { toast('分享成功，愿这张卡也被看见'); })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return; // 用户主动取消
          copyFallback(text);
        });
      return;
    }
    copyFallback(text);
  }

  function copyFallback(text) {
    // 次级：现代剪贴板 API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('文案已复制，去粘贴给 TA 吧'); })
        .catch(function () { legacyCopyOrImage(text); });
      return;
    }
    legacyCopyOrImage(text);
  }

  function legacyCopyOrImage(text) {
    // 三级：传统 execCommand 复制
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { toast('文案已复制，去粘贴给 TA 吧'); return; }
    } catch (e) { /* 继续降级 */ }
    // 最终降级：生成一张分享图
    var canvas = drawShareCard(text);
    try {
      var a = document.createElement('a');
      a.download = '解码TA-顿悟卡.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      toast('已生成分享图，请保存到相册');
    } catch (e2) {
      toast('当前浏览器不支持分享，请截图保存');
    }
  }

  // 用 Canvas 画一张极简分享图（降级场景使用）
  function drawShareCard(text) {
    var canvas = document.createElement('canvas');
    canvas.width = 750; canvas.height = 1000;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, 750, 1000);
    roundRectPath(ctx, 50, 180, 650, 560, 30);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.strokeStyle = '#EAE2D8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8E7CC3'; ctx.font = 'bold 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('解 码 TA · 顿 悟 卡', 375, 260);
    ctx.fillStyle = '#37324B'; ctx.font = 'bold 38px "PingFang SC", "Microsoft YaHei", sans-serif';
    wrapText(ctx, text, 560).forEach(function (line, i) {
      ctx.fillText(line, 375, 370 + i * 60);
    });
    ctx.fillStyle = '#9A94A8'; ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('这里练的是眼睛，生活需要你亲自上场。', 375, 850);
    return canvas;
  }

  /* ------------------------------------------------------------
     12. 我的使用说明书：表单 → Canvas 竖版图片 → 保存
     ------------------------------------------------------------ */
  var manualCanvas = null;

  function renderManualForm() {
    var box = $('#manualFields');
    if (!box) return;
    box.innerHTML = state.questions.map(function (q, i) {
      return '<div class="field">' +
               '<label for="m' + i + '">' + esc(q) + '</label>' +
               '<textarea id="m' + i + '" data-q="' + i + '" placeholder="写下你的答案……"></textarea>' +
             '</div>';
    }).join('');
  }

  function submitManual(e) {
    e.preventDefault();
    var answers = $$('#manualFields textarea').map(function (t) { return t.value.trim(); });
    var total = state.questions.length;
    var filled = answers.filter(function (a) { return a.length > 0; }).length;
    // 成就 A05 条件要求「8 个填空全部填写」
    if (filled < total) { toast('请把 ' + total + ' 个填空都写上，说明书才完整'); return; }

    manualCanvas = drawManualCanvas(answers);
    var dataUrl = manualCanvas.toDataURL('image/png');
    var img = $('#manualImage');
    if (img) img.src = dataUrl;
    // 存入本地，供收藏册「回看我的说明书」使用（超配额时 setRaw 会静默失败）
    S.setRaw('manualImage', dataUrl);

    S.setNum('manualAuthors', S.getNum('manualAuthors') + 1);
    go('manual-preview');
    evaluateAchievements();
  }

  function saveManual() {
    var dataUrl = manualCanvas ? manualCanvas.toDataURL('image/png') : S.getRaw('manualImage');
    if (!dataUrl) { toast('说明书还没生成，请先返回填写'); return; }
    try {
      var a = document.createElement('a');
      a.download = '我的使用说明书.png';
      a.href = dataUrl;
      a.click();
      toast('说明书已保存');
    } catch (e) {
      toast('当前浏览器不支持直接保存，请长按图片保存');
    }
    // 保存说明书图 = 生成 1 张分享图，计入 A06（1 张）与 A10（3 张）
    S.setNum('shareCount', S.getNum('shareCount') + 1);
    evaluateAchievements();
  }

  // Canvas 内的中文按字符测量换行
  function wrapText(ctx, text, maxWidth) {
    var lines = [], line = '';
    String(text == null ? '' : text).split('').forEach(function (ch) {
      if (ch === '\n') { lines.push(line); line = ''; return; }
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line); line = ch;
      } else {
        line += ch;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : ['（留白）'];
  }

  // 兼容老旧浏览器的圆角矩形路径
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawManualCanvas(answers) {
    var W = 750, PAD = 56, INNER = W - PAD * 2;
    var Q_FONT = 'bold 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    var A_FONT = '23px "PingFang SC", "Microsoft YaHei", sans-serif';
    var Q_LH = 32, A_LH = 34;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    // 先测量所有行，再决定画布高度（7 号题可能是电量+一句话，允许更长）
    var items = state.questions.map(function (q, i) {
      ctx.font = Q_FONT;
      var ql = wrapText(ctx, q, INNER - 92);
      ctx.font = A_FONT;
      var al = wrapText(ctx, answers[i] || '（留白）', INNER - 64);
      return { ql: ql, al: al };
    });

    var height = 236;
    items.forEach(function (it) {
      height += 26 + it.ql.length * Q_LH + 10 + it.al.length * A_LH + 22 + 18;
    });
    height += 96;
    var H = Math.max(1334, Math.ceil(height));

    canvas.width = W; canvas.height = H;
    // 注意：尺寸变化会重置 ctx 状态，需重新设置字体
    ctx.textAlign = 'left';

    // 米白背景 + 柔和光斑
    ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(90, 60, 10, 90, 60, 300);
    g.addColorStop(0, 'rgba(142,124,195,0.16)'); g.addColorStop(1, 'rgba(142,124,195,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 460);
    var g2 = ctx.createRadialGradient(W - 60, H - 120, 10, W - 60, H - 120, 320);
    g2.addColorStop(0, 'rgba(224,163,180,0.14)'); g2.addColorStop(1, 'rgba(224,163,180,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, H - 500, W, 500);

    // 标题区
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8E7CC3'; ctx.font = 'bold 19px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('DECODE TA  ·  相 处 说 明 书', W / 2, 92);
    ctx.fillStyle = '#37324B'; ctx.font = 'bold 56px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('我的使用说明书', W / 2, 164);
    ctx.strokeStyle = '#EAE2D8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, 198); ctx.lineTo(W - PAD, 198); ctx.stroke();

    // 逐条填入
    var y = 224;
    items.forEach(function (it, idx) {
      var cardH = 26 + it.ql.length * Q_LH + 10 + it.al.length * A_LH + 22;
      roundRectPath(ctx, PAD, y, INNER, cardH, 22);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.strokeStyle = '#EAE2D8'; ctx.lineWidth = 1.5; ctx.stroke();

      // 序号圆点
      ctx.beginPath(); ctx.arc(PAD + 40, y + 34, 15, 0, Math.PI * 2);
      ctx.fillStyle = idx % 3 === 0 ? '#EFEAF9' : (idx % 3 === 1 ? '#E8F1F7' : '#FBECEF');
      ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#6F5FA6';
      ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(idx + 1), PAD + 40, y + 39);

      // 问题
      ctx.textAlign = 'left'; ctx.fillStyle = '#6F5FA6'; ctx.font = Q_FONT;
      it.ql.forEach(function (ln, k) { ctx.fillText(ln, PAD + 66, y + 26 + 24 + k * Q_LH); });

      // 答案
      var aStart = y + 26 + it.ql.length * Q_LH + 10 + 24;
      ctx.fillStyle = '#37324B'; ctx.font = A_FONT;
      it.al.forEach(function (ln, k) { ctx.fillText(ln, PAD + 32, aStart + k * A_LH); });

      y += cardH + 18;
    });

    // 页脚固定文案
    ctx.textAlign = 'center'; ctx.fillStyle = '#9A94A8';
    ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('这里练的是眼睛，生活需要你亲自上场。', W / 2, H - 44);
    return canvas;
  }

  /* ------------------------------------------------------------
     13. 收藏册：顿悟卡 / 成就 / 人物图鉴
     ------------------------------------------------------------ */
  function getEnlightById(id) {
    var meta = S.getJSON('enlightenmentsMeta', {})[id];
    if (meta) return meta;
    // 元信息缺失时，按 id「情境id-选项下标」从当前数据反查
    var parts = String(id).split('-');
    var sit = state.situations.filter(function (s) {
      return String(s.id) === parts[0] || Number(s.id) === Number(parts[0]);
    })[0];
    var rev = sit && sit.reveals ? sit.reveals[Number(parts[1])] : null;
    return { key: rev && rev.key || '一条顿悟', persona: '', sit: sit && sit.text || '' };
  }

  function renderCollection() {
    renderEnlightenmentTab();
    renderAchievementTab();
    renderCodexTab();
  }

  function renderEnlightenmentTab() {
    var box = $('#panel-enlightenments');
    if (!box) return;
    var ids = S.getJSON('enlightenments', []);
    if (!ids.length) {
      box.innerHTML = '<div class="empty-state"><div class="empty-mark"></div>' +
        '还没有收集到顿悟卡。<br />去抽一张卡，读懂一个人吧。</div>';
      return;
    }
    box.innerHTML = ids.slice().reverse().map(function (id) {
      var m = getEnlightById(id);
      return '<div class="coll-card">' +
               '<div class="coll-quote">「' + esc(m.key) + '」</div>' +
               '<div class="coll-source">' + esc(m.persona ? '来自 ' + m.persona : id) +
                 (m.sit ? ' · ' + esc(m.sit) : '') + '</div>' +
             '</div>';
    }).join('');
  }

  function renderAchievementTab() {
    var box = $('#panel-achievements');
    if (!box) return;
    var unlocked = S.getJSON('achievements', []);
    box.innerHTML = state.achievements.map(function (a, i) {
      var got = unlocked.indexOf(String(a.id)) !== -1;
      return '<div class="ach-item' + (got ? '' : ' locked') + '">' +
               '<div class="ach-icon">' + (i + 1) + '</div>' +
               '<div><div class="ach-name">' + esc(a.name) + '</div>' +
                 '<div class="ach-desc">' + esc(a.desc) + '</div>' +
                 (a.reward ? '<div class="ach-reward">奖励：' + esc(a.reward) + '</div>' : '') +
               '</div>' +
               '<div class="ach-status">' + (got ? '已解锁' : '未解锁') + '</div>' +
             '</div>';
    }).join('');
  }

  function renderCodexTab() {
    var box = $('#panel-codex');
    if (!box) return;
    var codex = S.getJSON('codex', {});
    box.innerHTML = state.personas.map(function (p) {
      var info = codex[p.id];
      var unlocked = !!(info && (info.trigger || info.desire));
      var head = '<div class="codex-head"><span class="codex-id">NO.' + esc(p.id) + '</span>' +
                 '<span class="codex-name">' + esc(unlocked ? p.name : '？？？') + '</span></div>' +
                 '<div class="codex-tags">' + (p.tags || []).map(esc).join(' / ') + '</div>';
      if (unlocked) {
        return '<div class="codex-card">' + head +
          '<div class="codex-row trigger"><b>雷区：</b>' + esc(info.trigger || '—') + '</div>' +
          '<div class="codex-row"><b>渴望：</b>' + esc(info.desire || '—') + '</div>' +
        '</div>';
      }
      return '<div class="codex-card codex-locked">' + head +
        '<div class="codex-hint">继续游玩解锁</div></div>';
    }).join('');
  }

  /* ------------------------------------------------------------
     14. 事件绑定
     ------------------------------------------------------------ */
  function bindEvents() {
    // 返回按钮（统一走 data-back）
    $$('[data-back]').forEach(function (btn) {
      btn.addEventListener('click', function () { go(btn.getAttribute('data-back')); });
    });

    $('#btnRetry') && $('#btnRetry').addEventListener('click', function () { location.reload(); });

    $('#btnStart') && $('#btnStart').addEventListener('click', startDraw);
    $('#btnRerollPersona') && $('#btnRerollPersona').addEventListener('click', rerollPersona);
    $('#btnRerollSituation') && $('#btnRerollSituation').addEventListener('click', rerollSituation);
    $('#btnToChoice') && $('#btnToChoice').addEventListener('click', renderChoice);
    $('#btnManual') && $('#btnManual').addEventListener('click', function () { go('manual'); });
    $('#btnCollection') && $('#btnCollection').addEventListener('click', function () { go('collection'); });
    $('#btnHomeFromEnlight') && $('#btnHomeFromEnlight').addEventListener('click', function () {
      refreshDaily(); go('home');
    });
    $('#btnReplay') && $('#btnReplay').addEventListener('click', startDraw);

    // 三选一（事件委托，兼容重新渲染）
    var list = $('#optionList');
    if (list) {
      list.addEventListener('click', function (e) {
        var btn = e.target.closest('.option');
        if (!btn) return;
        selectOption(Number(btn.getAttribute('data-index')));
      });
    }

    // 揭晓三段
    $$('.seg').forEach(function (seg) {
      seg.addEventListener('click', function () { toggleSegment(seg); });
    });
    $('#btnClaim') && $('#btnClaim').addEventListener('click', claimEnlightenment);
    $('#btnTryOther') && $('#btnTryOther').addEventListener('click', tryOtherEndings);
    $('#btnTryOtherReveal') && $('#btnTryOtherReveal').addEventListener('click', tryOtherEndings);
    $('#btnShare') && $('#btnShare').addEventListener('click', shareEnlightenment);

    // 说明书
    var form = $('#manualForm');
    if (form) form.addEventListener('submit', submitManual);
    $('#btnSaveManual') && $('#btnSaveManual').addEventListener('click', saveManual);
    $('#btnManualAgain') && $('#btnManualAgain').addEventListener('click', function () { go('manual'); });
    $('#btnViewManual') && $('#btnViewManual').addEventListener('click', viewManualFromCollection);

    // 收藏册 tab
    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        $$('.tab').forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        $$('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        var panel = $('#panel-' + tab.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  }

  /* ------------------------------------------------------------
     15. 启动
     ------------------------------------------------------------ */
  function init() {
    if (!loadData()) return;      // 数据缺失 → 友好提示，不白屏
    bindEvents();
    updateCheckIn();
    refreshDaily();
    renderManualForm();
    renderCollection();
    evaluateAchievements();       // 兼容旧存档：补判此前已满足的成就
    go('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
