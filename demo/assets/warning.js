/* ===========================================================
 * warning.js — 学业预警规则引擎
 *
 * 和 ai.js / grading.js 同一套路：纯规则、不碰 DOM、可被 node 直接测试。
 *
 * 三条设计原则：
 *   1. 每条预警都能展开到证据 —— 哪门课、哪次签到、哪份作业，差多少
 *   2. 阈值用「相对位置 + 绝对下限」双条件 —— 这套种子数据的学分是分档的
 *      （20/26/32/38/44），单用绝对阈值会把整档学生一次性标红
 *   3. 解除靠重算，不靠人工点掉 —— reconcile() 只认规则结果，
 *      否则演示会退化成"点一下就没了"
 * ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store;

  /* ---------- 等级 ---------- */

  var LEVELS = {
    none:     { key: 'none',     name: '正常', rank: 0, weight: 0 },
    watch:    { key: 'watch',    name: '关注', rank: 1, weight: 12 },
    warn:     { key: 'warn',     name: '预警', rank: 2, weight: 26 },
    critical: { key: 'critical', name: '严重', rank: 3, weight: 42 }
  };

  function levelOf(key) { return LEVELS[key] || LEVELS.none; }

  /* ---------- 培养方案与年级基准 ---------- */

  function plan() {
    return (global.SEED && global.SEED.plan) ||
      { total: 96, terms: 8, passedTerm: 4 };
  }

  /* 年级学分基准（中位数）。只算一次，后面所有学生共用 ——
     否则每次 evaluate 都遍历 90 个学生会明显变慢。 */
  var cohortCache = null;
  function cohort() {
    if (cohortCache) return cohortCache;
    var arr = ((global.SEED && global.SEED.students) || [])
      .map(function (x) { return x.earnedCredit || 0; })
      .sort(function (a, b) { return a - b; });
    var n = arr.length;
    var median = n ? (n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2) : 0;
    var mean = n ? arr.reduce(function (a, b) { return a + b; }, 0) / n : 0;
    cohortCache = { median: median, mean: mean, n: n, min: arr[0] || 0, max: arr[n - 1] || 0 };
    return cohortCache;
  }

  function resetCache() { cohortCache = null; }

  /* ---------- 取数：一次算齐，规则只读 ---------- */

  function contextOf(studentId) {
    var stu = S.getStudent(studentId);
    if (!stu) return null;

    var att = S.attendanceStats(studentId);
    var hw = S.homeworkStats(studentId);
    var list = S.myAssignmentList(studentId);
    var p = plan();

    /* 逾期清单：closed（不许补交）和 overdue（还能补交）都算逾期 */
    var overdue = list.filter(function (x) {
      return x.status === 'overdue' || x.status === 'closed';
    }).map(function (x) {
      return {
        kind: 'assignment',
        ref: x.assignment.id,
        title: (x.course ? x.course.name : '') + ' · ' + x.assignment.title,
        detail: x.assignment.deadline + ' 截止，' +
          (x.status === 'closed' ? '已关闭补交' : '仍可补交但按迟交计分'),
        late: true
      };
    });

    /* 低分作业 */
    var low = list.filter(function (x) {
      return x.status === 'graded' && x.submission && x.submission.score != null && x.submission.score < 60;
    }).map(function (x) {
      return {
        kind: 'assignment',
        ref: x.assignment.id,
        title: (x.course ? x.course.name : '') + ' · ' + x.assignment.title,
        detail: '得分 ' + x.submission.score + ' 分，低于及格线',
        score: x.submission.score
      };
    });

    /* 缺勤场次：该学生已选课程里，有签到记录但本人没有记录的场次 */
    var mine = S.myEnrollments(studentId).map(function (e) { return e.offeringId; });
    var absentSessions = [];
    S.load().sessions.forEach(function (sess) {
      if (mine.indexOf(sess.offeringId) < 0) return;
      var rec = null;
      for (var i = 0; i < sess.records.length; i++) {
        if (sess.records[i].studentId === studentId) { rec = sess.records[i]; break; }
      }
      if (rec && rec.status === 'present') return;
      var v = S.offeringView(sess.offeringId);
      absentSessions.push({
        kind: 'session',
        ref: sess.id,
        title: (v && v.course ? v.course.name : sess.offeringId) + ' · ' + sess.date,
        detail: rec ? '签到状态：迟到' : '该场次无签到记录，记为缺勤',
        lateOnly: !!(rec && rec.status === 'late')
      });
    });

    var earned = stu.earnedCredit || 0;
    var remainTerms = Math.max(1, p.terms - p.passedTerm);
    var speed = earned / Math.max(1, p.passedTerm);
    var projected = Math.round((earned + speed * remainTerms) * 10) / 10;
    var gap = Math.round((p.total - projected) * 10) / 10;

    return {
      student: stu,
      att: att,
      hw: hw,
      list: list,
      overdue: overdue,
      low: low,
      absentSessions: absentSessions,
      credit: {
        earned: earned,
        current: S.selectedCredit(studentId),
        median: cohort().median,
        speed: Math.round(speed * 10) / 10,
        projected: projected,
        gap: gap,
        total: p.total,
        remainTerms: remainTerms
      },
      attendanceRate: att.total ? (att.present + att.late) / att.total : 1
    };
  }

  /* ---------- 规则表 ----------
     每条规则 grade(c) 返回 null（不命中）或等级 key。
     一条规则内部分档，避免同一维度拆成多条后重复计分。 */

  var RULES = [
    {
      id: 'ATT-ABSENT', dim: '出勤', label: '缺勤次数',
      grade: function (c) {
        var n = c.att.absent;
        if (n >= 4) return 'critical';
        if (n >= 2) return 'warn';
        return null;
      },
      value: function (c) { return c.att.absent; },
      unit: ' 次',
      threshold: '≥ 2 次预警，≥ 4 次严重',
      evidence: function (c) { return c.absentSessions.filter(function (x) { return !x.lateOnly; }); },
      advice: '缺勤已达上限，再缺课将直接影响考试资格，尽快联系任课教师'
    },
    {
      id: 'ATT-RATE', dim: '出勤', label: '出勤率',
      grade: function (c) {
        if (c.att.total < 3) return null;
        if (c.attendanceRate < 0.6) return 'critical';
        if (c.attendanceRate < 0.8) return 'warn';
        return null;
      },
      value: function (c) { return Math.round(c.attendanceRate * 100); },
      unit: '%',
      threshold: '低于 80% 预警，低于 60% 严重',
      evidence: function (c) { return c.absentSessions; },
      advice: '出勤率低于学校要求，缺勤累计到规定学时会被取消考试资格'
    },
    {
      id: 'HW-OVERDUE', dim: '作业', label: '作业逾期',
      grade: function (c) {
        var n = c.overdue.length;
        if (n >= 6) return 'critical';
        if (n >= 4) return 'warn';
        if (n >= 2) return 'watch';
        return null;
      },
      value: function (c) { return c.overdue.length; },
      unit: ' 份',
      threshold: '≥ 2 份关注，≥ 4 份预警，≥ 6 份严重',
      evidence: function (c) { return c.overdue; },
      advice: '逾期作业按迟交计分，补齐后成绩才能回升'
    },
    {
      id: 'HW-LOW', dim: '作业', label: '单次成绩不及格',
      grade: function (c) {
        if (!c.low.length) return null;
        return c.low.length >= 2 ? 'warn' : 'watch';
      },
      value: function (c) { return c.low.length; },
      unit: ' 份',
      threshold: '1 份关注，≥ 2 份预警',
      evidence: function (c) { return c.low; },
      advice: '不及格作业通常可以重交，先找教师确认重交规则'
    },
    {
      id: 'HW-AVG', dim: '作业', label: '课程均分',
      grade: function (c) {
        if (!c.hw.graded) return null;
        if (c.hw.avgScore < 60) return 'critical';
        if (c.hw.avgScore < 70) return 'warn';
        return null;
      },
      value: function (c) { return c.hw.avgScore; },
      unit: ' 分',
      threshold: '低于 70 分预警，低于 60 分严重',
      evidence: function (c) { return c.low; },
      advice: '均分偏低，先看是单次失误还是整体理解有偏差'
    },
    {
      id: 'CREDIT', dim: '学分', label: '学分进度',
      /* 横向 + 纵向一起看，但只给一条结论 —— 拆成两条规则会把同一批学生
         重复计分，风险分虚高。
           横向：落后年级中位数 10 分以上，且低于绝对下限 26 分
           纵向：按当前修课速度外推，毕业缺口 ≥ 16 学分
         两个条件都要"双阈值"，因为这套种子数据的学分是分档的
         （20/26/32/38/44），单用绝对阈值会把整档学生一次性标出来。
         等级封顶在「关注」：学分慢说明"进度偏后"，不等于"马上要出事"。 */
      grade: function (c) {
        var cr = c.credit;
        var behind = cr.median - cr.earned;
        if (behind >= 10 && cr.earned < 26) return 'watch';
        if (cr.gap >= 16) return 'watch';
        return null;
      },
      value: function (c) { return Math.max(0, c.credit.gap); },
      unit: ' 学分',
      threshold: '落后中位数 ≥ 10 且低于 26 学分，或毕业缺口 ≥ 16',
      evidence: function (c) {
        var cr = c.credit;
        return [{
          kind: 'credit', ref: 'CREDIT-NOW',
          title: '已修 ' + cr.earned + ' 学分，年级中位数 ' + cr.median,
          detail: cr.earned < cr.median
            ? '比同年级中位少 ' + Math.round((cr.median - cr.earned) * 10) / 10 + ' 学分'
            : '不低于同年级中位'
        }, {
          kind: 'credit', ref: 'CREDIT-PROJ',
          title: '每学期约修 ' + cr.speed + ' 学分，预计毕业时 ' + cr.projected + ' 学分',
          detail: '培养方案要求 ' + cr.total + '，剩余 ' + cr.remainTerms +
            ' 学期可再修约 ' + Math.round(cr.speed * cr.remainTerms * 10) / 10 +
            ' 学分，预计缺口 ' + cr.gap + ' 学分'
        }];
      },
      advice: '下轮选课优先补齐必修，别再只挑轻松的选修'
    }
  ];

  /* ---------- 评估 ---------- */

  /* 多条规则同时命中时升一级：单一指标不足以定性，
     真正的"严重"是几个维度一起塌。 */
  function escalate(base, hitCount) {
    if (hitCount >= 5) return 'critical';
    if (hitCount >= 3 && base !== 'critical') {
      return base === 'warn' ? 'critical' : 'warn';
    }
    return base;
  }

  function evaluate(studentId) {
    var c = contextOf(studentId);
    if (!c) return { ok: false, reason: '学生不存在' };

    var signals = [];
    RULES.forEach(function (rule) {
      var g = rule.grade(c);
      if (!g) return;
      signals.push({
        id: rule.id,
        dim: rule.dim,
        label: rule.label,
        level: g,
        levelName: levelOf(g).name,
        value: rule.value(c),
        unit: rule.unit,
        threshold: rule.threshold,
        evidence: rule.evidence(c),
        advice: rule.advice
      });
    });

    var base = 'none';
    signals.forEach(function (s) {
      if (levelOf(s.level).rank > levelOf(base).rank) base = s.level;
    });
    var level = escalate(base, signals.length);

    /* 风险分：命中规则权重求和，再按叠加条数加成，封顶 100 */
    var score = signals.reduce(function (a, s) { return a + levelOf(s.level).weight; }, 0);
    if (signals.length >= 3) score += (signals.length - 2) * 6;
    score = Math.min(100, Math.round(score));

    /* 只在等级真的被叠加规则抬升时，才提示"多重风险" */
    var boosted = levelOf(level).rank > levelOf(base).rank;

    return {
      ok: true,
      studentId: studentId,
      student: c.student,
      level: level,
      levelName: levelOf(level).name,
      score: score,
      boosted: boosted,
      signals: signals,
      metrics: {
        attendanceRate: Math.round(c.attendanceRate * 100),
        attendanceTotal: c.att.total,
        absent: c.att.absent,
        overdue: c.overdue.length,
        graded: c.hw.graded,
        avgScore: c.hw.avgScore,
        earned: c.credit.earned,
        currentCredit: c.credit.current,
        median: c.credit.median,
        gap: c.credit.gap
      },
      summary: summarize(level, signals, c),
      actions: actionsOf(level, signals)
    };
  }

  function summarize(level, signals, c) {
    if (!signals.length) {
      return '各项指标正常：出勤 ' + c.att.total + ' 场全到，已修 ' +
        c.credit.earned + ' 学分，作业无逾期。';
    }
    var top = signals.slice().sort(function (a, b) {
      return levelOf(b.level).rank - levelOf(a.level).rank;
    })[0];
    var names = signals.map(function (s) { return s.label; }).join('、');
    return '触发 ' + signals.length + ' 条规则（' + names + '），' +
      '其中「' + top.label + '」最严重：' + top.value + top.unit + '。';
  }

  function actionsOf(level, signals) {
    if (level === 'none') return [];
    /* 按等级从高到低给出建议动作，最多三条 */
    var out = [];
    signals.slice().sort(function (a, b) {
      return levelOf(b.level).rank - levelOf(a.level).rank;
    }).forEach(function (s) {
      if (out.length < 3 && out.indexOf(s.advice) < 0) out.push(s.advice);
    });
    return out;
  }

  /* ---------- 状态机：预警的生命周期 ----------
     active（已生成）→ intervening（已干预）→ resolved（已解除）
     解除条件只有一个：规则重算后不再命中。 */

  function nowStr() { return S.fmtDateTime(S._now()); }

  function activeWarningsOf(studentId) {
    var s = S.load();
    if (!s.warnings) s.warnings = [];
    return s.warnings.filter(function (w) {
      return w.studentId === studentId && w.status !== 'resolved';
    });
  }

  /**
   * 重算某个学生的预警，并同步到状态表。
   * 返回 { created, updated, resolved }，界面据此提示"哪些变了"。
   */
  function reconcile(studentId) {
    var r = evaluate(studentId);
    if (!r.ok) return { created: [], updated: [], resolved: [] };

    var s = S.load();
    if (!s.warnings) s.warnings = [];
    var created = [], updated = [], resolved = [];
    var seen = {};

    r.signals.forEach(function (sig) {
      seen[sig.id] = true;
      var cur = null;
      for (var i = 0; i < s.warnings.length; i++) {
        var w = s.warnings[i];
        if (w.studentId === studentId && w.ruleId === sig.id && w.status !== 'resolved') { cur = w; break; }
      }
      if (!cur) {
        var rec = {
          id: 'WRN-' + studentId + '-' + sig.id + '-' + s.warnings.length,
          studentId: studentId,
          ruleId: sig.id,
          dim: sig.dim,
          label: sig.label,
          level: sig.level,
          status: 'active',
          value: sig.value,
          unit: sig.unit,
          createdAt: nowStr(),
          updatedAt: nowStr(),
          resolvedAt: null,
          resolvedReason: null
        };
        s.warnings.push(rec);
        created.push(rec);
      } else if (cur.level !== sig.level) {
        cur.level = sig.level;
        cur.value = sig.value;
        cur.updatedAt = nowStr();
        updated.push(cur);
      } else if (cur.value !== sig.value) {
        cur.value = sig.value;
        cur.updatedAt = nowStr();
      }
    });

    /* 规则不再命中的，自动解除 —— 这是"不能人工点掉"的落点 */
    s.warnings.forEach(function (w) {
      if (w.studentId !== studentId) return;
      if (w.status === 'resolved') return;
      if (seen[w.ruleId]) return;
      w.status = 'resolved';
      w.resolvedAt = nowStr();
      w.resolvedReason = '重算后该项指标已回到正常范围';
      w.updatedAt = nowStr();
      resolved.push(w);
    });

    S.save();
    return { created: created, updated: updated, resolved: resolved };
  }

  /* 重算所有学生 —— 教务端"跑一次全量预警"用 */
  function reconcileAll() {
    var out = { created: 0, updated: 0, resolved: 0, students: 0 };
    ((global.SEED && global.SEED.students) || []).forEach(function (st) {
      var r = reconcile(st.id);
      out.students += 1;
      out.created += r.created.length;
      out.updated += r.updated.length;
      out.resolved += r.resolved.length;
    });
    return out;
  }

  /* 发起干预：把预警推进到 intervening，并留一条记录 */
  function intervene(warningId, note, type) {
    var s = S.load();
    if (!s.interventions) s.interventions = [];
    var w = null;
    (s.warnings || []).forEach(function (x) { if (x.id === warningId) w = x; });
    if (!w) return { ok: false, reason: '预警不存在' };
    if (!String(note || '').trim()) return { ok: false, reason: '请填写干预说明' };

    var itv = {
      id: 'ITV-' + Date.now(),
      studentId: w.studentId,
      ruleId: w.ruleId,
      type: type || 'reminder',
      at: nowStr(),
      by: 'T01',
      byName: '张明远',
      note: String(note).trim(),
      result: 'pending'
    };
    s.interventions.push(itv);
    w.status = 'intervening';
    w.updatedAt = nowStr();
    w.lastInterventionId = itv.id;
    S.save();
    return { ok: true, intervention: itv };
  }

  function interventionsOf(studentId) {
    var s = S.load();
    return (s.interventions || []).filter(function (x) {
      return !studentId || x.studentId === studentId;
    }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }

  /* ---------- 汇总视图 ---------- */

  /* 教师端：某个教学班的学生预警名单 */
  function roster(offeringId) {
    var rows = [];
    S.rosterOf(offeringId).forEach(function (stu) {
      var r = evaluate(stu.studentId);
      if (!r.ok || r.level === 'none') return;
      rows.push(r);
    });
    rows.sort(function (a, b) {
      if (levelOf(b.level).rank !== levelOf(a.level).rank) {
        return levelOf(b.level).rank - levelOf(a.level).rank;
      }
      return b.score - a.score;
    });
    return rows;
  }

  /* 教务端：全校分布 */
  function school() {
    var all = ((global.SEED && global.SEED.students) || []);
    var dist = { none: 0, watch: 0, warn: 0, critical: 0 };
    var rows = [];
    var ruleHits = {};
    all.forEach(function (stu) {
      var r = evaluate(stu.id);
      if (!r.ok) return;
      dist[r.level] = (dist[r.level] || 0) + 1;
      r.signals.forEach(function (s) { ruleHits[s.id] = (ruleHits[s.id] || 0) + 1; });
      if (r.level !== 'none') rows.push(r);
    });
    rows.sort(function (a, b) {
      if (levelOf(b.level).rank !== levelOf(a.level).rank) {
        return levelOf(b.level).rank - levelOf(a.level).rank;
      }
      return b.score - a.score;
    });
    return {
      total: all.length,
      dist: dist,
      rate: all.length ? Math.round((dist.watch + dist.warn + dist.critical) / all.length * 1000) / 10 : 0,
      rows: rows,
      ruleHits: ruleHits,
      cohort: cohort(),
      plan: plan()
    };
  }

  global.Warning = {
    LEVELS: LEVELS, levelOf: levelOf, RULES: RULES,
    evaluate: evaluate, contextOf: contextOf,
    reconcile: reconcile, reconcileAll: reconcileAll,
    intervene: intervene, interventionsOf: interventionsOf,
    activeWarningsOf: activeWarningsOf,
    roster: roster, school: school, cohort: cohort,
    _resetCache: resetCache
  };
})(typeof window !== 'undefined' ? window : globalThis);
