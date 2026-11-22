/* ============================================================
   解码TA · 回合制闯关 — 游戏逻辑（v8：难题系统 + BG3 式投掷弹窗 + 失手才反击 + 概率调优）
   状态机：首页 → 创角 → 战斗（3 关 × 多道难题）→ 通关
   规则：D20 + 主角属性修正 + 叠加技能加成 ≥ DC
   难题系统：每道难题指定「本次鉴定属性」，只有强项含该属性的队友能释放技能
   纯原生 JS，零依赖，数据内联
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
   * 一、数据定义（内联）
   * ========================================================== */

  // 5 种鉴定类型（强项 +2 / 软肋 -2 / 其余 0）
  const CHECK_TYPES = [
    { id: 'empathy',    name: '共情', icon: '♥', desc: '读懂对方的情绪' },
    { id: 'express',    name: '表达', icon: '✦', desc: '把话说清楚' },
    { id: 'insight',    name: '洞察', icon: '◎', desc: '看穿言外之意' },
    { id: 'composure',  name: '定力', icon: '☾', desc: '稳住不炸' },
    { id: 'action',     name: '行动', icon: '▶', desc: '直接上手做' },
  ];
  const CHECK_TYPE_MAP = {};
  CHECK_TYPES.forEach((t) => { CHECK_TYPE_MAP[t.id] = t; });

  // 16 种预设角色（复用旧版人物卡）：身份 + 自我介绍 + 固定强项/软肋/技能（符合人设，不可改）
  // strong: 2 个强项属性 id；weak: 1 个软肋属性 id；skill/skillDesc: 专属技能
  const TRAITS = [
    { id: 't01', name: '嘴硬心软星人', intro: '谁在乎你啊（消息却秒回）',   strong: ['empathy', 'action'],   weak: 'express',   skill: '口是心非',   skillDesc: '嘴上嫌弃，手上在帮' },
    { id: 't02', name: '已读焦虑者',   intro: '我不是不在乎，只是不知道怎么开口', strong: ['insight', 'empathy'], weak: 'express', skill: '反复揣摩', skillDesc: '把每句话读三遍' },
    { id: 't03', name: '热情越界者',   intro: '大家一起才热闹嘛！',           strong: ['express', 'action'],   weak: 'insight',   skill: '自来熟暖场', skillDesc: '强行把气氛热起来' },
    { id: 't04', name: '佛系疏离者',   intro: '都行，随便，你决定',           strong: ['composure', 'insight'], weak: 'action',  skill: '佛系观察',   skillDesc: '不争不抢，静观其变' },
    { id: 't05', name: '完美主义班长', intro: '这件事我来把关吧',             strong: ['composure', 'action'], weak: 'empathy',   skill: '细节控',     skillDesc: '把每个细节抠到位' },
    { id: 't06', name: '老好人',       intro: '我没事，真的，你不用管我',     strong: ['empathy', 'composure'], weak: 'express', skill: '默默兜底',   skillDesc: '谁都不忍心拒绝' },
    { id: 't07', name: '社交蝴蝶',     intro: '哎我认识好多人的！',           strong: ['express', 'empathy'],  weak: 'composure', skill: '八面玲珑', skillDesc: '谁都聊得来' },
    { id: 't08', name: '玻璃心学霸',   intro: '我这次肯定考砸了',             strong: ['insight', 'composure'], weak: 'action',  skill: '预习狂魔',   skillDesc: '提前想好所有可能' },
    { id: 't09', name: '冷幽默王者',   intro: '哈哈开玩笑的，别当真',         strong: ['express', 'composure'], weak: 'empathy', skill: '毒舌缓场',   skillDesc: '用玩笑化解尴尬' },
    { id: 't10', name: '拖延症晚期',   intro: '急什么，还有时间',             strong: ['insight', 'express'],  weak: 'action',   skill: 'deadline爆发', skillDesc: '最后一刻超常发挥' },
    { id: 't11', name: '边界感战士',   intro: '我可以帮，但你得先问我',       strong: ['composure', 'express'], weak: 'empathy', skill: '清晰边界',   skillDesc: '把话说清楚不拖泥带水' },
    { id: 't12', name: '情绪过山车',   intro: '我没事！……好吧我有事',         strong: ['empathy', 'express'],  weak: 'composure', skill: '情绪直球', skillDesc: '把真实情绪甩出来' },
    { id: 't13', name: '深藏不露型',   intro: '嗯，还好（其实什么都记得）',    strong: ['insight', 'action'],   weak: 'express',  skill: '隐藏实力',   skillDesc: '关键时刻露一手' },
    { id: 't14', name: '焦虑卷王',     intro: '我还能再学一会儿',             strong: ['action', 'composure'], weak: 'empathy',   skill: '卷王冲刺',   skillDesc: '逼自己再冲一把' },
    { id: 't15', name: '依赖型朋友',   intro: '你去哪？带上我呗',             strong: ['empathy', 'express'],  weak: 'action',   skill: '撒娇求援',   skillDesc: '软磨硬泡也要拿下' },
    { id: 't16', name: '人间清醒',     intro: '我看开了，就这样吧',           strong: ['insight', 'composure'], weak: 'express', skill: '一眼看穿',   skillDesc: '直击本质' },
  ];
  const TRAIT_MAP = {};
  TRAITS.forEach((t) => { TRAIT_MAP[t.id] = t; });

  // 3 关 BOSS：血量 = 预计成功次数 × 2；每关含多道「难题」（tasks），每题指定要求属性
  // 每个 BOSS 有「普通形态」（hp/dc/special，排前两关）与「困难形态」（hard，排第 3 关）。
  // 困难形态统一：12 血 / DC 13 / 需连续 2 次成功才扣血。
  // 概率调整（v8）：普通 DC 12/14/12 → 11/12/11，困难 DC 15 → 13；
  // 气势加成由「每 2 层 +1」改为「每 3 层 +1，最多 +2」，避免失败后 DC 螺旋升高。
  // 目标：常规打法单次鉴定成功率约 6 成（强项+技能约 6~7 成，中性约 5~6 成）。
  const BOSSES = [
    {
      name: '已读不回怪',
      hp: 8, dc: 11, sprite: 'boss-read', scene: 's1', glow: '#7fe0d0',
      desc: '发出去的消息永远石沉大海',
      special: '普通规则：成功扣 2 血',
      specialKey: null,
      attack: { type: 'composure', name: '定力', text: 'TA 把消息晾了一整晚，用沉默冷着你' },
      hard: { hp: 12, dc: 13, special: '特殊规则：需连续 2 次成功才扣血', specialKey: 'streak2' },
      particles: [
        { type: 'pill', label: '已读', x: 72, y: 18, dur: 7, op: .5 },
        { type: 'dots', x: 20, y: 55, dur: 5, op: .45 },
        { type: 'moon', x: 88, y: 8, dur: 9, op: .4 },
      ],
      tasks: [
        { story: '你给 TA 发了条消息问周末的安排，两个小时过去，消息显示「已读」却迟迟没有回复。你想知道 TA 到底怎么了。', require: 'insight' },
        { story: 'TA 终于回了，只有两个字：「没事」。可你分明感觉 TA 情绪不太对。你该怎么接？', require: 'empathy' },
        { story: '你决定直接把话说开，想告诉 TA「我在乎你，也尊重你的空间」，但要说得不让人有压力。', require: 'express' },
        { story: 'TA 开始慢慢打开话匣子，说到一半又停住了。这时候你需要沉住气，别急着抢话。', require: 'composure' },
      ],
    },
    {
      name: '甩锅巨兽',
      hp: 10, dc: 12, sprite: 'boss-blame', scene: 's2', glow: '#b8c7e0',
      desc: '出了事永远是别人的锅',
      special: '特殊规则：用「行动」成功时扣 3 血',
      specialKey: 'action3',
      attack: { type: 'insight', name: '洞察', text: 'TA 甩来一句「这也不能全怪我吧」，把锅往你这边推' },
      hard: { hp: 12, dc: 13, special: '特殊规则：需连续 2 次成功才扣血', specialKey: 'streak2' },
      particles: [
        { type: 'ppt', x: 14, y: 14, dur: 7, op: .4 },
        { type: 'ppt', x: 82, y: 30, dur: 9, op: .35 },
        { type: 'pot', x: 70, y: 60, dur: 6, op: .4 },
      ],
      tasks: [
        { story: '小组汇报的数据出了错，老师当场点名。可那份 PPT 明明是 TA 做的，TA 却转头看你，想让你接这个锅。', require: 'insight' },
        { story: '你想点破「这部分是你负责的」，但又要留足体面，不把场面弄僵。', require: 'express' },
        { story: 'TA 开始把锅往外甩，说「大家都有责任」。你需要稳住立场，不被情绪带偏。', require: 'composure' },
        { story: '与其继续争论，不如直接行动：把正确的数据重新核对一遍，用事实说话。', require: 'action' },
        { story: '最后你看向 TA，想用一句话让 TA 明白——你可以扛，但 TA 也得认。', require: 'empathy' },
      ],
    },
    {
      name: '内耗魔王',
      hp: 8, dc: 11, sprite: 'boss-burnout', scene: 's3', glow: '#ffd9a0',
      desc: '越想越乱，越想越停不下来',
      special: '普通规则：成功扣 2 血',
      specialKey: null,
      attack: { type: 'empathy', name: '共情', text: 'TA 把一团焦虑甩过来「我是不是特别差劲」' },
      hard: { hp: 12, dc: 13, special: '特殊规则：需连续 2 次成功才扣血', specialKey: 'streak2' },
      particles: [
        { type: 'card', label: '卷', x: 14, y: 20, dur: 8, op: .45 },
        { type: 'card', label: '摆', x: 84, y: 12, dur: 6, op: .45 },
        { type: 'card', label: '悔', x: 78, y: 52, dur: 7, op: .45 },
      ],
      tasks: [
        { story: '深夜，TA 在群里发了一句「我是不是做得不够好」。你知道 TA 又陷入内耗了，想先看懂 TA 卡在哪。', require: 'insight' },
        { story: 'TA 说「别人都那么优秀，我怎么这么没用」。你需要先接住 TA 的情绪，而不是讲道理。', require: 'empathy' },
        { story: '你想告诉 TA「你已经很棒了」，但要说得具体，让 TA 真正听进去。', require: 'express' },
        { story: 'TA 越想越停不下来。你需要帮 TA 把注意力拉回当下，稳住节奏。', require: 'composure' },
        { story: '与其光劝，不如陪 TA 做一件具体的小事，把内耗的能量转成行动。', require: 'action' },
        { story: '最后，TA 看向你问「我是不是很没用」。你要用一句话，让 TA 看到自己的价值。', require: 'empathy' },
      ],
    },
  ];

  // 属性修正值
  const STRONG_MOD = 2;
  const WEAK_MOD = -2;

  // 队伍共享血量
  // 设计依据：三关 BOSS 血 8/10/12，攻击失手才会引来反击，防御失败扣 2 血。
  // 12 点血量约等于 6 次防御失手的容错，足够玩家在第三关困难形态仍有翻盘空间。
  const PARTY_MAX_HP = 12;

  /* ==========================================================
   * 二、全局状态
   * ========================================================== */
  const state = {
    screen: 'home',
    party: [],                // 4 个角色
    activeIndex: 0,           // 当前主角（掷骰的人）下标 0..3
    stageIndex: 0,            // 当前关卡序号 0..2
    stageOrder: [0, 1, 2],    // 洗牌后的 BOSS 出场顺序（存 BOSSES 下标）
    taskIndex: 0,             // 当前难题下标
    bossHP: BOSSES[0].hp,
    momentum: 0,              // 气势层数
    streak: 0,                // 第 3 关连续成功计数
    skillsToUse: [],          // 本回合要叠加的技能：{ index }
    usedSkills: {},           // 本关已锁定的技能：{ [partyIndex]: true }
    rolling: false,           // 是否正在投掷中
    lastResult: null,         // 最近一次结算结果
    rollOpen: false,          // 投掷弹窗是否打开
    partyHP: 0,               // 队伍共享血量
    partyMaxHP: 0,            // 队伍血量上限
    rerollUsed: false,        // 本次投掷是否已用过「重掷」
    phase: 'attack',          // 当前回合阶段：'attack' 玩家攻击 | 'defend' BOSS 反击防御
    stats: null,              // 本局统计（用于成就判定），startBattle 时初始化
  };

  /* ==========================================================
   * 二·补、成就系统（回合制专属）
   * ========================================================== */
  const ACH_KEY = 'decodeTaBattleAchievements';
  const BATTLE_ACHIEVEMENTS = [
    { id: 'first_win',   name: '初出茅庐',     icon: '🎯', desc: '击败任意一个 BOSS' },
    { id: 'dice_god',    name: '骰神附体',     icon: '🎲', desc: '单局打出 3 次暴击' },
    { id: 'jinx',        name: '倒霉蛋',       icon: '☠️', desc: '单局投出 3 次自然 1（大失败）' },
    { id: 'parry_master',name: '格挡大师',     icon: '🛡️', desc: '单局完美格挡 5 次（防御暴击）' },
    { id: 'flawless',    name: '无伤通关',     icon: '💎', desc: '整局队伍血量全程满血通关' },
    { id: 'streak_king', name: '连击达人',     icon: '⚡', desc: '一次打出「连续 2 次成功」击败困难 BOSS' },
    { id: 'custom_win',  name: '自成一派',     icon: '✍️', desc: '带上自建角色通关' },
    { id: 'sharp_shooter', name: '弹无虚发',   icon: '🏹', desc: '连续 5 次攻击成功不失误' },
    { id: 'comeback',    name: '逆风翻盘',     icon: '🔥', desc: '队伍血量 ≤ 2 时仍坚持通关' },
    { id: 'clear_all',   name: '通关大师',     icon: '🏆', desc: '完整通关全部三关' },
  ];

  function loadAchievements() {
    try {
      const v = localStorage.getItem(ACH_KEY);
      return v ? JSON.parse(v) : [];
    } catch (e) { return []; }
  }

  function saveAchievements(list) {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
  }

  function unlockAchievement(id) {
    const list = loadAchievements();
    if (list.includes(id)) return false;
    list.push(id);
    saveAchievements(list);
    const ach = BATTLE_ACHIEVEMENTS.find((a) => a.id === id);
    if (ach) showToast(`🏅 解锁成就：${ach.name} — ${ach.desc}`);
    return true;
  }

  /* ==========================================================
   * 三、DOM 引用
   * ========================================================== */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ==========================================================
   * 四、工具函数
   * ========================================================== */
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
  function rollD20() { return randInt(1, 20); }
  function rollD4() { return randInt(1, 4); }

  function showToast(msg) {
    const area = $('#toastArea');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    area.appendChild(el);
    setTimeout(() => { el.remove(); }, 2200);
  }

  function showScreen(name) {
    state.screen = name;
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const el = $('#screen-' + name);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ==========================================================
   * 五、角色构建
   * ========================================================== */
  // 构建一个预设角色（固定强项/软肋/技能，符合人设）
  function buildCharacter(traitId) {
    const trait = TRAIT_MAP[traitId] || TRAITS[0];
    return {
      traitId: trait.id,
      name: trait.name,
      intro: trait.intro,
      strong: trait.strong.slice(),
      weak: trait.weak,
      skillName: trait.skill,
      skillDesc: trait.skillDesc,
      isCustom: false,
    };
  }

  // 构建一个自建角色（玩家自定义名字 + 自由搭配强项/软肋/技能）
  function buildCustomCharacter(customName, strong, weak, skillName, skillDesc) {
    const s = (strong && strong.length === 2 && strong[0] !== strong[1])
      ? strong.slice()
      : randomTwoStrong();
    const w = (weak && !s.includes(weak)) ? weak : randomWeak(s);
    return {
      traitId: 'custom',
      name: customName && customName.trim() ? customName.trim() : '无名勇士',
      intro: '你自己捏出来的角色',
      strong: s,
      weak: w,
      skillName: skillName && skillName.trim() ? skillName.trim() : '自定技能',
      skillDesc: skillDesc && skillDesc.trim() ? skillDesc.trim() : '自己定义的本事',
      isCustom: true,
    };
  }

  function randomTwoStrong() {
    const pool = CHECK_TYPES.map((t) => t.id);
    const a = pick(pool);
    let b = pick(pool);
    while (b === a) b = pick(pool);
    return [a, b];
  }
  function randomWeak(strong) {
    const pool = CHECK_TYPES.map((t) => t.id).filter((id) => !strong.includes(id));
    return pick(pool);
  }

  // 随机生成整队（4 个不同特征，且特征不重复）
  function randomParty() {
    const traitPool = TRAITS.slice();
    const party = [];
    for (let i = 0; i < 4; i++) {
      const idx = randInt(0, traitPool.length - 1);
      const trait = traitPool.splice(idx, 1)[0];
      party.push(buildCharacter(trait.id));
    }
    return party;
  }

  /* ==========================================================
   * 六、派生状态
   * ========================================================== */
  function activeCharacter() { return state.party[state.activeIndex]; }

  // 当前是否为第 3 关（困难形态）：stageIndex 是关卡序号 0..2，第 3 关 = index 2
  function isHardStage() { return state.stageIndex === BOSSES.length - 1; }

  // 当前 BOSS：根据出场位置返回普通或困难形态（合并 hp/dc/special/specialKey）
  function currentBoss() {
    const base = BOSSES[state.stageOrder[state.stageIndex]];
    if (isHardStage() && base.hard) {
      return Object.assign({}, base, base.hard);
    }
    return base;
  }
  function currentTask() { return currentBoss().tasks[state.taskIndex]; }

  // 当前阶段要鉴定的属性：攻击阶段 = 难题要求属性；防御阶段 = BOSS 的攻击属性
  function currentRequireType() {
    if (state.phase === 'defend') {
      return currentBoss().attack.type;
    }
    return currentTask().require;
  }

  // Fisher-Yates 洗牌
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 有效 DC = 基础 DC + min(2, floor(气势 / 3))
  // v8：放缓气势带来的 DC 攀升，失败后不至于越投越难
  function effectiveDC() {
    return currentBoss().dc + Math.min(2, Math.floor(state.momentum / 3));
  }

  function modifierFor(char, typeId) {
    if (char.strong.includes(typeId)) return STRONG_MOD;
    if (char.weak === typeId) return WEAK_MOD;
    return 0;
  }

  function modifierLabel(mod) {
    if (mod > 0) return '+' + mod;
    if (mod < 0) return '' + mod;
    return '±0';
  }

  /* ==========================================================
   * 七、创角页渲染
   * ========================================================== */
  function renderCreate() {
    if (state.party.length === 0) state.party = randomParty();
    const container = $('#partySlots');
    container.innerHTML = '';

    state.party.forEach((char, idx) => {
      const card = document.createElement('div');
      card.className = 'slot-card';
      card.dataset.index = idx;
      card.innerHTML = char.isCustom
        ? renderCustomCard(char, idx)
        : renderPresetCard(char, idx);
      container.appendChild(card);
    });

    validateParty();
  }

  // 预设角色卡：固定属性，只读展示（可换特征/随机，但属性不可改）
  function renderPresetCard(char, idx) {
    const strongNames = char.strong.map((id) => CHECK_TYPE_MAP[id].name).join('、');
    const weakName = CHECK_TYPE_MAP[char.weak].name;
    return `
      <div class="slot-head">
        <span class="slot-title">队友 ${idx + 1} · 预设</span>
        <button class="slot-random" data-random="${idx}" type="button">换一个</button>
      </div>
      <div class="slot-field">
        <label>角色特征</label>
        <select data-field="trait" data-index="${idx}">
          ${TRAITS.map((t) => `<option value="${t.id}" ${t.id === char.traitId ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="slot-intro">「${char.intro}」</div>
      <div class="slot-fixed">
        <span class="badge strong">强项 ${strongNames} +2</span>
        <span class="badge weak">软肋 ${weakName} -2</span>
        <span class="badge skill">技能 ${char.skillName} +1d4</span>
      </div>
      <div class="slot-skill-desc">${char.skillDesc}</div>
    `;
  }

  // 自建角色卡：名字 + 强项/软肋/技能 全部可自定义
  function renderCustomCard(char, idx) {
    return `
      <div class="slot-head">
        <span class="slot-title">队友 ${idx + 1} · 自建</span>
        <button class="slot-random" data-random="${idx}" type="button">随机</button>
      </div>
      <div class="slot-field">
        <label>角色名字</label>
        <input class="slot-input" type="text" data-field="name" data-index="${idx}" value="${escapeAttr(char.name)}" placeholder="给 TA 起个名字" maxlength="8" />
      </div>
      <div class="slot-stats">
        <div class="slot-field">
          <label>强项 1 (+2)</label>
          <select data-field="strong0" data-index="${idx}">${typeOptions(char.strong[0])}</select>
        </div>
        <div class="slot-field">
          <label>强项 2 (+2)</label>
          <select data-field="strong1" data-index="${idx}">${typeOptions(char.strong[1])}</select>
        </div>
        <div class="slot-field">
          <label>软肋 (-2)</label>
          <select data-field="weak" data-index="${idx}">${typeOptions(char.weak)}</select>
        </div>
      </div>
      <div class="slot-field">
        <label>技能名（+1d4）</label>
        <input class="slot-input" type="text" data-field="skill" data-index="${idx}" value="${escapeAttr(char.skillName)}" placeholder="给技能起个名字" maxlength="8" />
      </div>
      <div class="badge-row" data-preview="${idx}">${previewBadges(char)}</div>
    `;
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function typeOptions(selectedId) {
    return CHECK_TYPES.map((t) => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name}</option>`).join('');
  }

  function previewBadges(char) {
    const strongNames = char.strong.map((id) => CHECK_TYPE_MAP[id].name).join(' / ');
    const weakName = CHECK_TYPE_MAP[char.weak].name;
    return `<span class="badge strong">强项 ${strongNames}</span><span class="badge weak">软肋 ${weakName}</span><span class="badge">技能 ${char.skillName}</span>`;
  }

  function validateParty() {
    const errors = [];
    state.party.forEach((char, idx) => {
      if (!char.strong || char.strong.length !== 2) errors.push(`队友${idx + 1} 需选 2 个强项`);
      if (char.strong && char.strong[0] === char.strong[1]) errors.push(`队友${idx + 1} 两个强项不能相同`);
      if (char.strong && char.weak && char.strong.includes(char.weak)) errors.push(`队友${idx + 1} 软肋不能与强项重复`);
      if (!char.weak) errors.push(`队友${idx + 1} 需选 1 个软肋`);
      if (!char.name || !char.name.trim()) errors.push(`队友${idx + 1} 需有名字`);
    });
    const note = $('#createValidate');
    note.textContent = errors.length ? '⚠ ' + errors.join('；') : '';
    return errors.length === 0;
  }

  function onCreateChange(e) {
    const el = e.target;
    const idx = Number(el.dataset.index);
    const field = el.dataset.field;
    const char = state.party[idx];
    if (!char) return;

    // 预设角色的 trait 切换
    if (field === 'trait') {
      const trait = TRAIT_MAP[el.value];
      // 预设角色换特征：整体替换为新的预设角色（固定属性）
      state.party[idx] = buildCharacter(trait.id);
      renderCreate();
      return;
    }

    // 自建角色的字段编辑
    if (!char.isCustom) return;

    if (field === 'name') {
      char.name = el.value;
    } else if (field === 'strong0') {
      char.strong[0] = el.value;
    } else if (field === 'strong1') {
      char.strong[1] = el.value;
    } else if (field === 'weak') {
      char.weak = el.value;
    } else if (field === 'skill') {
      char.skillName = el.value;
    }
    updatePreview(idx);
    validateParty();
  }

  function updatePreview(idx) {
    const char = state.party[idx];
    const box = document.querySelector(`[data-preview="${idx}"]`);
    if (box) box.innerHTML = previewBadges(char);
  }

  function onRandomSlot(idx) {
    const usedTraitIds = state.party.map((c) => c.traitId);
    const pool = TRAITS.filter((t) => !usedTraitIds.includes(t.id) || t.id === state.party[idx].traitId);
    state.party[idx] = buildCharacter(pick(pool).id);
    renderCreate();
  }

  // 把某个槽位改为「自建角色」
  function onMakeCustom(idx) {
    state.party[idx] = buildCustomCharacter('', null, null, '', '');
    renderCreate();
    // 聚焦名字输入框
    const nameInput = document.querySelector(`input[data-field="name"][data-index="${idx}"]`);
    if (nameInput) nameInput.focus();
  }

  /* ==========================================================
   * 八、战斗：状态初始化与推进
   * ========================================================== */
  function startBattle() {
    if (!validateParty()) {
      showToast('请先完善 4 名队友的配置');
      return;
    }
    state.stageIndex = 0;
    state.stageOrder = shuffle([0, 1, 2]);  // 随机 BOSS 出场顺序
    state.activeIndex = 0;
    state.skillsToUse = [];
    state.usedSkills = {};
    state.lastResult = null;
    state.rolling = false;
    state.rollOpen = false;
    state.partyMaxHP = PARTY_MAX_HP;
    state.partyHP = PARTY_MAX_HP;
    state.rerollUsed = false;
    // 初始化本局统计（用于成就判定）
    state.stats = {
      critCount: 0,        // 暴击次数（攻击 + 防御）
      fumbleCount: 0,      // 大失败次数
      parryCount: 0,       // 防御暴击（完美格挡）次数
      attackStreak: 0,     // 当前连续攻击成功数
      maxAttackStreak: 0,  // 单局最大连续攻击成功数
      tookDamage: false,   // 是否扣过血
      rolls: 0,            // 总投骰次数
    };
    setupStage();
    showScreen('battle');
    renderBattle();
  }

  function setupStage() {
    const boss = currentBoss();
    state.bossHP = boss.hp;
    state.taskIndex = 0;
    state.momentum = 0;
    state.streak = 0;
    state.usedSkills = {};   // 打赢一关，全员技能解禁
    state.skillsToUse = [];
    state.lastResult = null;
    state.rerollUsed = false;
    state.phase = 'attack';  // 每关从「玩家攻击回合」开始
  }

  function advanceStage() {
    // 击败了一个 BOSS → 初出茅庐
    unlockAchievement('first_win');
    if (state.stageIndex >= BOSSES.length - 1) {
      renderVictory();
      showScreen('victory');
      return;
    }
    state.stageIndex += 1;
    setupStage();
    showToast(`第 ${state.stageIndex + 1} 关开始：${currentBoss().name}`);
    renderBattle();
  }

  // 推进到下一道难题；若全部通过则击败 BOSS
  function advanceTask() {
    const boss = currentBoss();
    if (state.taskIndex >= boss.tasks.length - 1) {
      // 全部难题通过 → 击败 BOSS
      showToast(`击败「${boss.name}」！`);
      setTimeout(advanceStage, 900);
    } else {
      state.taskIndex += 1;
      state.rerollUsed = false;
      showToast('难题推进：新的情况出现了');
      renderBattle();
    }
  }

  /* ==========================================================
   * 九、战斗渲染
   * ========================================================== */
  function renderBattle() {
    const boss = currentBoss();
    const task = currentTask();
    const isDefend = state.phase === 'defend';
    $('#battleStageTitle').textContent = `第 ${state.stageIndex + 1} / ${BOSSES.length} 关 · 难题 ${state.taskIndex + 1}/${boss.tasks.length}`;
    // 困难形态标识：第 3 关时在 BOSS 名后追加「困难」标签
    renderBossAvatar(boss);
    $('#bossName').innerHTML = boss.name + (isHardStage() ? '<span class="boss-hard-tag">困难</span>' : '');
    $('#bossDesc').textContent = boss.desc;
    $('#bossSpecial').textContent = boss.special;

    // 更新「开始应对」按钮文案，反映当前阶段
    const rollText = document.querySelector('#btnRoll .roll-text');
    if (rollText) rollText.textContent = isDefend ? '防御（掷骰抵挡）' : '开始应对（掷骰）';

    renderScene(boss);
    renderBossBars();
    renderPartyHP();
    renderTask(task);
    renderActiveHero();
    renderRoster();
    renderResult();
  }

  // 渲染队伍共享血量条
  function renderPartyHP() {
    const bar = $('#partyHpBar');
    if (!bar) return;
    $('#partyHpText').textContent = `${state.partyHP} / ${state.partyMaxHP}`;
    $('#partyHpFill').style.width = `${(state.partyHP / state.partyMaxHP) * 100}%`;
    // 低血量警示
    const low = state.partyHP / state.partyMaxHP <= 0.25;
    bar.classList.toggle('low', low);
  }

  function renderBossAvatar(boss) {
    const box = $('#bossAvatar');
    box.innerHTML = `<svg class="boss-svg pixelated"><use href="#${boss.sprite}"/></svg>`;
  }

  function renderScene(boss) {
    const scene = $('#battleScene');
    if (!scene) return;
    scene.className = 'battle-scene scene ' + boss.scene;
    const particleBox = $('#sceneParticles');
    if (!particleBox) return;
    particleBox.innerHTML = '';
    (boss.particles || []).forEach((p, i) => {
      const el = document.createElement('i');
      el.className = 'particle';
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
      el.style.setProperty('--dur', (p.dur || 7) + 's');
      el.style.setProperty('--op', p.op || .5);
      el.style.animationDelay = (i * 0.7) + 's';
      if (p.type === 'pill') {
        el.innerHTML = `<span style="border:1px solid ${boss.glow};color:${boss.glow};border-radius:999px;padding:1px 8px;font-size:10px;">${p.label}</span>`;
      } else if (p.type === 'dots') {
        el.innerHTML = `<span style="color:${boss.glow};font-size:16px;letter-spacing:2px;">···</span>`;
      } else if (p.type === 'moon') {
        el.innerHTML = `<span style="color:#f4e9d3;font-size:14px;">☾</span>`;
      } else if (p.type === 'ppt') {
        el.innerHTML = `<span style="display:block;width:26px;height:32px;background:rgba(255,255,255,.85);border-radius:3px;transform:rotate(-4deg);box-shadow:0 2px 0 rgba(0,0,0,.3);"></span>`;
      } else if (p.type === 'pot') {
        el.innerHTML = `<span style="display:block;width:18px;height:14px;background:#8a6a4a;border-radius:3px 3px 6px 6px;box-shadow:0 2px 0 rgba(0,0,0,.35);"></span>`;
      } else if (p.type === 'card') {
        el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:#241f3a;border:1px solid #d4af6a;color:#d4af6a;font-size:10px;border-radius:2px;">${p.label}</span>`;
      }
      particleBox.appendChild(el);
    });
  }

  function renderBossBars() {
    const boss = currentBoss();
    $('#bossHpText').textContent = `${Math.max(0, state.bossHP)} / ${boss.hp}`;
    $('#bossHpFill').style.width = `${Math.max(0, (state.bossHP / boss.hp) * 100)}%`;

    const dcBonus = Math.min(2, Math.floor(state.momentum / 3));
    const plusTag = dcBonus > 0 ? `<span class="momentum-plus">+${dcBonus}</span>` : '';
    $('#bossMomentumText').innerHTML = `${state.momentum} 层 · 下次 DC +${dcBonus}${plusTag}`;
    $('#bossMomentumFill').style.width = `${Math.min(100, state.momentum * 10)}%`;
    $('#dcValue').textContent = effectiveDC();
  }

  // 渲染当前难题（故事背景 + 本次要求属性）
  function renderTask(task) {
    const isDefend = state.phase === 'defend';
    const boss = currentBoss();
    const requireType = currentRequireType();
    const type = CHECK_TYPE_MAP[requireType];
    if (isDefend) {
      // 防御阶段：显示 BOSS 反击
      $('#taskStory').textContent = boss.attack.text;
      $('#taskRequireType').textContent = `${type.icon} ${type.name}`;
      $('#taskDc').textContent = effectiveDC();
      // 切换标签文字
      const label = document.querySelector('.task-require-label');
      if (label) label.textContent = '防御鉴定';
    } else {
      $('#taskStory').textContent = task.story;
      $('#taskRequireType').textContent = `${type.icon} ${type.name}`;
      $('#taskDc').textContent = effectiveDC();
      const label = document.querySelector('.task-require-label');
      if (label) label.textContent = '本次鉴定';
    }
  }

  function renderActiveHero() {
    const char = activeCharacter();
    $('#activeHeroName').textContent = char ? char.name : '—';
    const modEl = $('#activeHeroMod');
    if (char) {
      const requireType = currentRequireType();
      const mod = modifierFor(char, requireType);
      modEl.textContent = `${CHECK_TYPE_MAP[requireType].name}修正 ${modifierLabel(mod)}`;
    } else {
      modEl.textContent = '';
    }
  }

  function renderRoster() {
    const box = $('#partyRoster');
    box.innerHTML = state.party.map((char, idx) => {
      const active = idx === state.activeIndex ? 'active' : '';
      const locked = !!state.usedSkills[idx];
      const spriteId = partySprite(idx);
      const canSkill = char.strong.includes(currentRequireType());
      const skillTag = locked
        ? '<span class="member-tag locked-tag">已锁定</span>'
        : (canSkill ? '<span class="member-tag can-tag">可辅助</span>' : '');
      return `<div class="member-card ${active}" data-member="${idx}">
        <div class="member-top">
          <div class="member-sprite"><svg class="party-svg"><use href="#${spriteId}"/></svg></div>
          <div>
            <div class="member-name">${char.name}</div>
            ${active ? '<span class="member-active-tag">主角</span>' : ''}
          </div>
        </div>
        <div class="member-tags">
          ${char.strong.map((id) => `<span class="member-tag strong">${CHECK_TYPE_MAP[id].name}+2</span>`).join('')}
          <span class="member-tag weak">${CHECK_TYPE_MAP[char.weak].name}-2</span>
          ${skillTag}
        </div>
        <div class="member-skill">
          <span class="member-skill-name"><b>${char.skillName}</b><br>${char.skillDesc}</span>
        </div>
      </div>`;
    }).join('');
  }

  function partySprite(idx) {
    if (idx === state.activeIndex) return 'party-hero';
    const variants = ['party-blue', 'party-pink', 'party-orange'];
    return variants[idx % variants.length];
  }

  function renderResult() {
    const placeholder = $('#resultPlaceholder');
    const body = $('#resultBody');
    const r = state.lastResult;
    if (!r) {
      placeholder.hidden = false;
      body.hidden = true;
      return;
    }
    placeholder.hidden = true;
    body.hidden = false;

    const cls = { success: 'hit', crit: 'crit', fail: 'miss', fumble: 'fumble' }[r.outcome];
    const isDefend = r.isDefend;
    const headlineText = isDefend
      ? { success: '🛡️ 抵挡成功', crit: '🛡️ 完美格挡！', fail: '💔 被击中', fumble: '💔 完全没挡住！' }[r.outcome]
      : { success: '✅ 鉴定成功', crit: '✨ 暴击！', fail: '❌ 鉴定失败', fumble: '💥 大失败！' }[r.outcome];
    const emojiId = { success: 'emoji-shiba', crit: 'emoji-shiba', fail: 'emoji-subway', fumble: 'emoji-panda' }[r.outcome];
    const emojiIcon = `<span class="emoji-icon"><svg><use href="#${emojiId}"/></svg></span>`;
    const skillDetail = r.skillDice && r.skillDice.length ? r.skillDice.join('+') + ' = ' + r.skillBonus : r.skillBonus;
    const succeeded = (r.outcome === 'success' || r.outcome === 'crit');

    body.innerHTML = `
      <div class="result-headline ${cls}">${headlineText} ${emojiIcon}</div>
      <div class="result-breakdown">
        D20=${r.natural}
        <span class="result-tag prop">属性修正 ${modifierLabel(r.mod)}</span>
        <span class="result-tag skill">技能加成 +${skillDetail}</span>
        = <b>${r.total}</b> vs DC ${r.dc}
      </div>
      ${(!isDefend && r.damage > 0) ? `<div class="result-damage">造成 ${r.damage} 点伤害</div>` : ''}
      ${(isDefend && !succeeded) ? `<div class="result-damage">队伍扣 2 点血量</div>` : ''}
      ${r.note ? `<div class="result-breakdown">${r.note}</div>` : ''}
    `;
  }

  function renderVictory() {
    $('#victorySub').textContent = `你击败了 ${BOSSES.map((b) => b.name).join('、')}，全程无人生还——除了骰子。`;

    // 通关成就判定
    evaluateEndAchievements();
    // 渲染本次新解锁的成就
    renderVictoryAchievements();
  }

  // 通关时判定各项成就
  function evaluateEndAchievements() {
    const s = state.stats;
    if (!s) return;
    unlockAchievement('clear_all');                 // 通关大师
    if (s.critCount >= 3) unlockAchievement('dice_god');        // 骰神附体
    if (s.fumbleCount >= 3) unlockAchievement('jinx');          // 倒霉蛋
    if (s.parryCount >= 5) unlockAchievement('parry_master');   // 格挡大师
    if (!s.tookDamage) unlockAchievement('flawless');           // 无伤通关
    if (s.maxAttackStreak >= 5) unlockAchievement('sharp_shooter'); // 弹无虚发
    if (state.partyHP <= 2) unlockAchievement('comeback');      // 逆风翻盘
    if (state.party.some((c) => c.isCustom)) unlockAchievement('custom_win'); // 自成一派
  }

  // 渲染已解锁的成就（通关页展示）
  function renderVictoryAchievements() {
    const box = $('#victoryAchievements');
    if (!box) return;
    const unlocked = loadAchievements();
    const list = BATTLE_ACHIEVEMENTS.filter((a) => unlocked.includes(a.id));
    if (list.length === 0) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `
      <div class="victory-ach-title">本局成就（已解锁 ${list.length} / ${BATTLE_ACHIEVEMENTS.length}）</div>
      <div class="victory-ach-grid">
        ${list.map((a) => `<div class="victory-ach-item"><span class="vai-icon">${a.icon}</span><div><div class="vai-name">${a.name}</div><div class="vai-desc">${a.desc}</div></div></div>`).join('')}
      </div>
    `;
  }

  // 渲染独立成就图鉴：展示全部成就（含未解锁）
  function renderAchievementsPage() {
    const unlocked = loadAchievements();
    const got = BATTLE_ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length;
    const total = BATTLE_ACHIEVEMENTS.length;
    const summary = $('#achSummary');
    if (summary) summary.textContent = `已解锁 ${got} / ${total}`;
    const fill = $('#achProgressFill');
    if (fill) fill.style.width = `${(got / total) * 100}%`;

    const grid = $('#achGrid');
    if (!grid) return;
    grid.innerHTML = BATTLE_ACHIEVEMENTS.map((a) => {
      const on = unlocked.includes(a.id);
      return `<div class="ach-card ${on ? 'unlocked' : 'locked'}">
        <div class="ach-icon" aria-hidden="true">${a.icon}</div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        <div class="ach-state">${on ? '✓ 已解锁' : '未解锁'}</div>
      </div>`;
    }).join('');
  }

  /* ==========================================================
   * 十、投掷弹窗（BG3 式）
   * ========================================================== */
  function openRollModal() {
    if (state.bossHP <= 0) return;
    state.skillsToUse = [];
    state.rollOpen = true;
    renderRollModal();
  }

  function closeRollModal() {
    state.rollOpen = false;
    const overlay = $('#rollOverlay');
    if (overlay) overlay.remove();
  }

  // 渲染投掷弹窗：骰子居中 + 可用技能列表
  function renderRollModal() {
    closeRollModal();
    const task = currentTask();
    const boss = currentBoss();
    const isDefend = state.phase === 'defend';
    const requireType = currentRequireType();
    const type = CHECK_TYPE_MAP[requireType];
    const dc = effectiveDC();

    const overlay = document.createElement('div');
    overlay.className = 'roll-overlay';
    overlay.id = 'rollOverlay';

    // 收集可用技能：强项含当前要求属性的队友（含主角自己），且未锁定
    const skillCandidates = state.party.map((char, idx) => {
      const canUse = char.strong.includes(requireType);
      const locked = !!state.usedSkills[idx];
      return { idx, char, canUse, locked };
    });

    const skillListHtml = skillCandidates.map((s) => {
      if (!s.canUse) {
        return `<div class="roll-skill-item disabled">
          <span class="roll-skill-check"></span>
          <span class="roll-skill-body">
            <span class="roll-skill-name">${s.char.skillName}</span>
            <span class="roll-skill-owner">${s.char.name}</span>
            <span class="roll-skill-why">强项不含「${type.name}」，无法辅助</span>
          </span>
          <span class="roll-skill-bonus">+1d4</span>
        </div>`;
      }
      if (s.locked) {
        return `<div class="roll-skill-item locked">
          <span class="roll-skill-check"></span>
          <span class="roll-skill-body">
            <span class="roll-skill-name">${s.char.skillName}</span>
            <span class="roll-skill-owner">${s.char.name}</span>
            <span class="roll-skill-why">本关已用过，BOSS 击败后解禁</span>
          </span>
          <span class="roll-skill-bonus">+1d4</span>
        </div>`;
      }
      const on = state.skillsToUse.some((x) => x.index === s.idx);
      return `<div class="roll-skill-item ${on ? 'on' : ''}" data-skill-toggle="${s.idx}">
        <span class="roll-skill-check">${on ? '✓' : ''}</span>
        <span class="roll-skill-body">
          <span class="roll-skill-name">${s.char.skillName}</span>
          <span class="roll-skill-owner">${s.char.name}</span>
          <span class="roll-skill-why">强项含「${type.name}」，可释放辅助</span>
        </span>
        <span class="roll-skill-bonus">+1d4</span>
      </div>`;
    }).join('');

    const emptyHtml = skillCandidates.filter((s) => s.canUse && !s.locked).length === 0
      ? '<div class="roll-skill-empty">当前没有可用技能，直接掷骰吧</div>'
      : '';

    overlay.innerHTML = `
      <div class="roll-modal ${isDefend ? 'defend' : ''}">
        <div class="roll-modal-head">
          <div class="roll-modal-task">${isDefend ? 'BOSS 反击' : '你的回合'} · 难题 ${state.taskIndex + 1} / ${currentBoss().tasks.length}</div>
          <div class="roll-modal-type">${isDefend ? '防御鉴定' : '本次鉴定'}：<b>${type.icon} ${type.name}</b></div>
          ${isDefend ? `<div class="roll-modal-boss-attack">${boss.attack.text}</div>` : ''}
          <div class="roll-modal-dc">目标 DC ${dc}（主角 ${activeCharacter().name} 修正 ${modifierLabel(modifierFor(activeCharacter(), requireType))}）</div>
        </div>

        <div class="roll-dice-stage">
          <svg class="d20-big" id="modalDice"><use href="#d20"/></svg>
          <div class="roll-dice-num" id="modalDiceNum">?</div>
          <div class="roll-hint" id="rollHint">点击骰子开始投掷</div>
        </div>

        <div class="roll-skills">
          <div class="roll-skills-title">可用技能（勾选叠加 +1d4，可多选）</div>
          ${emptyHtml || skillListHtml}
        </div>

        <div class="roll-result" id="rollResult" hidden></div>

        <div class="roll-modal-actions" id="rollModalActions">
          <button class="btn btn-ghost" id="rollCancel">取消</button>
          <button class="btn btn-primary" id="rollConfirm">掷出 D20</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 事件
    overlay.querySelectorAll('[data-skill-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.skillToggle);
        toggleSkillInModal(idx);
        renderRollModal();
      });
    });
    $('#rollCancel').addEventListener('click', closeRollModal);
    $('#rollConfirm').addEventListener('click', doRollInModal);
    $('#modalDice').addEventListener('click', doRollInModal);
  }

  function toggleSkillInModal(idx) {
    const existing = state.skillsToUse.findIndex((s) => s.index === idx);
    if (existing >= 0) {
      state.skillsToUse.splice(existing, 1);
    } else {
      state.skillsToUse.push({ index: idx });
    }
  }

  // 弹窗内掷骰
  function doRollInModal() {
    if (state.rolling) return;
    state.rolling = true;

    const dice = $('#modalDice');
    const hint = $('#rollHint');
    const numEl = $('#modalDiceNum');
    hint.textContent = '投掷中……';
    dice.classList.add('rolling');
    dice.classList.add('disabled');
    if (numEl) numEl.classList.add('rolling');

    // 投掷开始即隐藏原始动作区（取消/掷出D20），结果由结果区按钮承接
    const actionsBox = $('#rollModalActions');
    if (actionsBox) actionsBox.hidden = true;

    // 数字快速滚动
    const timer = setInterval(() => {
      if (numEl) numEl.textContent = randInt(1, 20);
    }, 60);

    setTimeout(() => {
      clearInterval(timer);
      dice.classList.remove('rolling');
      if (numEl) numEl.classList.remove('rolling');
      resolveRollInModal(dice, numEl);
    }, 1100);
  }

  function resolveRollInModal(dice, numEl) {
    const char = activeCharacter();
    const task = currentTask();
    const boss = currentBoss();
    const isDefend = state.phase === 'defend';
    const typeId = currentRequireType();
    const dc = effectiveDC();

    const natural = rollD20();
    const mod = modifierFor(char, typeId);

    let skillBonus = 0;
    const skillDice = [];
    state.skillsToUse.forEach((s) => {
      const d = rollD4();
      skillDice.push(d);
      skillBonus += d;
    });

    const total = natural + mod + skillBonus;

    let outcome;
    if (natural === 1) outcome = 'fumble';
    else if (natural >= 18) outcome = 'crit';
    else if (total >= dc) outcome = 'success';
    else outcome = 'fail';

    let damage = 0;
    let note = '';

    if (isDefend) {
      // 防御阶段：判定的是「抵挡 BOSS 攻击」，不是扣 BOSS 血
      if (outcome === 'fumble') {
        note = '自然 1：大失败，没能挡住';
      } else if (outcome === 'crit') {
        note = '自然 18-20：完美格挡！';
      } else if (outcome === 'success') {
        note = '成功抵挡 BOSS 的攻击';
      } else {
        note = '防御失败，被 BOSS 击中';
      }
    } else {
      // 攻击阶段
      if (outcome === 'fumble') {
        note = '自然 1：大失败';
      } else if (outcome === 'crit') {
        damage = 4;
        note = '自然 18-20：暴击，双倍伤害 4 点';
      } else if (outcome === 'success') {
        damage = (boss.specialKey === 'action3' && typeId === 'action') ? 3 : 2;
        note = boss.specialKey === 'action3' && typeId === 'action' ? '行动成功：扣 3 血' : '成功：扣 2 血';
      } else {
        note = '失败：BOSS 气势上升，将发起反击';
      }
    }

    // 第 3 关：需连续 2 次成功才扣血（仅攻击阶段，此处只算成功计数，扣血在提交时处理）
    let streakNote = '';
    if (!isDefend && boss.specialKey === 'streak2' && (outcome === 'success' || outcome === 'crit')) {
      const wouldStreak = state.streak + 1;
      if (wouldStreak >= 2) {
        streakNote = `（本次成功后连续 ${wouldStreak} 次，将真正扣血）`;
      } else {
        streakNote = `（连续 ${wouldStreak}/2 次，暂不扣血）`;
        damage = 0;
      }
    }

    state.lastResult = {
      outcome, natural, mod, skillBonus, skillDice, total, dc, damage,
      note: note + streakNote,
      typeId,
      isDefend,
      // 记录本次投掷用到的技能，提交时才锁定
      usedSkillIndexes: state.skillsToUse.map((s) => s.index),
    };
    state.rolling = false;

    // 累加本局统计（成就判定）
    if (state.stats) {
      state.stats.rolls += 1;
      if (outcome === 'crit') {
        state.stats.critCount += 1;
        if (isDefend) state.stats.parryCount += 1;
      }
      if (outcome === 'fumble') state.stats.fumbleCount += 1;
      // 攻击连击统计（仅攻击阶段）
      if (!isDefend) {
        if (outcome === 'success' || outcome === 'crit') {
          state.stats.attackStreak += 1;
          state.stats.maxAttackStreak = Math.max(state.stats.maxAttackStreak, state.stats.attackStreak);
        } else {
          state.stats.attackStreak = 0;
        }
      }
    }

    // 骰子定格 + 状态
    const diceCls = outcome === 'crit' ? 'crit' : (outcome === 'fumble' ? 'fumble' : '');
    if (numEl) {
      numEl.textContent = natural;
      numEl.className = 'roll-dice-num ' + diceCls;
    }
    dice.setAttribute('class', 'd20-big ' + diceCls);
    $('#rollHint').textContent = '投掷完成';

    // 弹窗内展示结果 + 操作按钮
    showRollResultInModal();

    // BOSS 状态演出
    if (outcome === 'crit') {
      shakeScene();
      setBossState('hurt');
    } else if (outcome === 'fumble' || outcome === 'fail') {
      setBossState(isDefend ? 'charge' : 'charge');
    } else {
      setBossState('hurt');
    }
  }

  // 提交本次投掷结果到 state，由「继续」按钮触发
  function commitResult() {
    const r = state.lastResult;
    if (!r) return;
    const boss = currentBoss();
    const succeeded = (r.outcome === 'success' || r.outcome === 'crit');

    // 锁定本次用到的技能
    r.usedSkillIndexes.forEach((idx) => { state.usedSkills[idx] = true; });
    state.skillsToUse = [];

    if (r.isDefend) {
      // 防御阶段：成功/大成功抵挡；失败/大失败扣玩家 2 血
      if (!succeeded) {
        deductPartyHP(2);
      }
      // 防御不影响气势、不影响 streak
    } else {
      // 攻击阶段：成功/暴击扣 BOSS 血；失败/大失败气势结算
      if (succeeded) {
        if (boss.specialKey === 'streak2') {
          state.streak += 1;
          if (state.streak >= 2) {
            state.bossHP = Math.max(0, state.bossHP - r.damage);
            state.streak = 0;
            unlockAchievement('streak_king');  // 连击达人：一次打出连续 2 次成功
          }
        } else {
          state.bossHP = Math.max(0, state.bossHP - r.damage);
          state.streak = 0;
        }
      } else {
        state.streak = 0;
        if (r.outcome === 'fumble') {
          state.momentum += 2;
        } else {
          state.momentum += 1;
        }
      }
    }
    state.rerollUsed = false;
  }

  function showRollResultInModal() {
    const resultBox = $('#rollResult');
    if (!resultBox) return;
    // 结果展示时，隐藏原始「取消/掷出D20」动作区
    const actionsBox = $('#rollModalActions');
    if (actionsBox) actionsBox.hidden = true;
    resultBox.hidden = false;
    const r = state.lastResult;
    const isDefend = r.isDefend;
    const cls = { success: 'hit', crit: 'crit', fail: 'miss', fumble: 'fumble' }[r.outcome];
    const succeeded = (r.outcome === 'success' || r.outcome === 'crit');
    const head = isDefend
      ? { success: '🛡️ 抵挡成功！', crit: '🛡️ 完美格挡！', fail: '💔 被击中了', fumble: '💔 完全没挡住！' }[r.outcome]
      : { success: '✅ 成功！', crit: '✨ 暴击！', fail: '❌ 失败 · 反击来了', fumble: '💥 大失败 · 反击来了！' }[r.outcome];
    const skillDetail = r.skillDice.length ? r.skillDice.join('+') + ' = ' + r.skillBonus : r.skillBonus;

    resultBox.innerHTML = `
      <div class="roll-result-head ${cls}">${head}</div>
      <div class="roll-result-breakdown">
        D20=${r.natural} + 属性(${modifierLabel(r.mod)}) + 技能(+${skillDetail}) = <b>${r.total}</b> vs DC ${r.dc}
        ${(!isDefend && r.damage > 0) ? `<br>造成 <b>${r.damage}</b> 点伤害` : ''}
        ${(!isDefend && !succeeded) ? `<br>失手了，BOSS 接下来会反击` : ''}
        ${(isDefend && !succeeded) ? `<br>队伍扣 <b>2</b> 点血量` : ''}
        ${r.note ? `<br>${r.note}` : ''}
      </div>
      <div class="roll-modal-actions" id="rollResultActions"></div>
    `;

    const actions = $('#rollResultActions');
    actions.innerHTML = `<button class="btn btn-primary" id="rollDone">继续</button>`;
    $('#rollDone').addEventListener('click', () => {
      commitResult();
      closeRollModal();
      // 判定推进
      if (!isDefend && state.bossHP <= 0) {
        // 攻击击杀了 BOSS
        renderBattle();
        showToast(`击败「${currentBoss().name}」！`);
        setTimeout(advanceStage, 900);
      } else if (!isDefend && !succeeded) {
        // 攻击失败 / 大失败 → 才进入 BOSS 反击（防御阶段）
        state.phase = 'defend';
        renderBattle();
        setTimeout(openRollModal, 350);
      } else if (!isDefend) {
        // 攻击成功 / 暴击 → BOSS 不反击，直接进入下一道难题
        renderBattle();
        advanceTask();
      } else {
        // 防御阶段结束 → 回到攻击阶段，推进到下一道难题
        state.phase = 'attack';
        if (state.partyHP <= 0) {
          showToast('小队力竭，本关重新挑战');
          setTimeout(() => { restartStage(); }, 900);
        } else {
          advanceTask();
        }
      }
    });
  }

  function deductPartyHP(n) {
    state.partyHP = Math.max(0, state.partyHP - n);
    if (n > 0 && state.stats) state.stats.tookDamage = true;
    // 血量条在 renderBattle 里刷新
  }

  // 本关重开（队伍血量归零时）
  function restartStage() {
    state.partyHP = state.partyMaxHP;
    setupStage();
    renderBattle();
  }

  // 设置 BOSS 状态类
  function setBossState(cls) {
    const box = $('#bossAvatar');
    if (!box) return;
    box.classList.remove('state-hurt', 'state-charge');
    if (cls) box.classList.add('state-' + cls);
    clearTimeout(setBossState._t);
    setBossState._t = setTimeout(() => {
      box.classList.remove('state-hurt', 'state-charge');
    }, 700);
  }

  function shakeScene() {
    const scene = $('#battleScene');
    if (!scene) return;
    scene.classList.remove('fx-shake');
    void scene.offsetWidth;
    scene.classList.add('fx-shake');
  }

  /* ==========================================================
   * 十一、事件绑定
   * ========================================================== */
  function bindEvents() {
    $('#btnEnterCreate').addEventListener('click', () => {
      showScreen('create');
      renderCreate();
    });

    $('#btnOpenAchievements').addEventListener('click', () => {
      renderAchievementsPage();
      showScreen('achievements');
    });

    // 自建角色按钮：把第一个预设槽位（或新增）改为自建
    $('#btnAddCustom').addEventListener('click', () => {
      // 找到第一个非自建的槽位，改为自建；若全是自建则提示
      const idx = state.party.findIndex((c) => !c.isCustom);
      if (idx === -1) {
        showToast('最多 4 名队友，已经都是自建了');
        return;
      }
      onMakeCustom(idx);
    });

    $('#partySlots').addEventListener('change', onCreateChange);
    $('#partySlots').addEventListener('input', onCreateChange);
    $('#partySlots').addEventListener('click', (e) => {
      const randBtn = e.target.closest('[data-random]');
      if (randBtn) onRandomSlot(Number(randBtn.dataset.random));
      const customBtn = e.target.closest('[data-custom]');
      if (customBtn) onMakeCustom(Number(customBtn.dataset.custom));
    });
    $('#btnRandomParty').addEventListener('click', () => {
      state.party = randomParty();
      renderCreate();
      showToast('已随机生成整队');
    });
    $('#btnStartBattle').addEventListener('click', startBattle);

    $$('.back-btn[data-back]').forEach((btn) => {
      btn.addEventListener('click', () => showScreen(btn.dataset.back));
    });

    $('#btnExitBattle').addEventListener('click', () => showScreen('home'));

    // 打开投掷弹窗
    $('#btnRoll').addEventListener('click', openRollModal);

    // 队伍栏：点击切换主角
    $('#partyRoster').addEventListener('click', (e) => {
      const member = e.target.closest('[data-member]');
      if (member) {
        state.activeIndex = Number(member.dataset.member);
        renderBattle();
      }
    });

    $('#btnReplay').addEventListener('click', () => {
      state.party = randomParty();
      showScreen('create');
      renderCreate();
    });
    $('#btnVictoryAchievements').addEventListener('click', () => {
      renderAchievementsPage();
      showScreen('achievements');
    });
    $('#btnVictoryHome').addEventListener('click', () => showScreen('home'));
  }

  /* ==========================================================
   * 十二、启动
   * ========================================================== */
  function init() {
    state.party = randomParty();
    bindEvents();
    showScreen('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
