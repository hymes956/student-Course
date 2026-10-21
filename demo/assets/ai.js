/* ===========================================================
 * ai.js — AI 选课推荐（规则引擎）
 *
 * 三条设计原则：
 *   1. 纯逻辑、不碰 DOM，可以被 node 直接测试
 *   2. 每一条推荐都带"评分明细"，分数怎么算出来可以逐项追溯
 *   3. provider 可插拔：现在是 'rule'，将来接真模型只换实现，调用方不用改
 * =========================================================== */
(function (global) {
  'use strict';

  var S = global.Store;

  /* 五个维度的权重，合计 100。
     UI 直接读这张表渲染"算法说明"，避免文档和代码各写一份、改了对不上。 */
  var WEIGHTS = [
    { key: 'direction', label: '方向匹配', max: 30, color: 'var(--primary)' },
    { key: 'chain',     label: '课程衔接', max: 25, color: 'var(--ok)' },
    { key: 'schedule',  label: '课表负担', max: 20, color: 'var(--purple)' },
    { key: 'capacity',  label: '名额情况', max: 15, color: 'var(--warn)' },
    { key: 'teacher',   label: '教师熟悉度', max: 10, color: 'var(--text-3)' }
  ];

  /* 专业 → 方向偏好：第一个是主方向，第二个是相关方向 */
  var MAJOR_CATS = {
    '建筑学': ['arc', 'dar'],
    '土木工程': ['icb', 'dar'],
    '智能建造': ['icb', 'arc'],
    '数字媒体技术': ['scg', 'dar']
  };

  /* ---------- 课程编号解析 ---------- */

  /* 'DAR201' → 'DAR'（课程系列） */
  function prefix(code) {
    return String(code || '').slice(0, 3);
  }

  /* 'DAR201' → 2（层级：1 基础 / 2 进阶 / 3 高阶） */
  function level(code) {
    var n = parseInt(String(code || '').slice(3), 10);
    return isNaN(n) ? 0 : Math.floor(n / 100);
  }

  /* ---------- 学生画像 ---------- */

  function buildProfile(studentId) {
    var s = S.load();
    var stu = S.getStudent(studentId);

    var enrolls = s.enrollments.filter(function (e) {
      return e.studentId === studentId && e.status === 'selected';
    });

    /* 已修课程：方向分布、课程系列、以及"这位老师带过的课你考了多少分" */
    var hist = { cats: {}, courses: [], teachers: {} };
    enrolls.forEach(function (e) {
      var o = S.getOffering(e.offeringId);
      if (!o || o.isLab) return;
      var c = S.getCourse(o.code);
      if (!c) return;
      hist.courses.push(c.code);
      hist.cats[c.cat] = (hist.cats[c.cat] || 0) + 1;
    });

    /* 作业定义在 SEED 上，不在 state 里（state 只存会变的提交记录） */
    var asgs = (global.SEED && global.SEED.assignments) || [];

    s.submissions.forEach(function (sub) {
      if (sub.studentId !== studentId || sub.score == null) return;
      var asg = null;
      for (var i = 0; i < asgs.length; i++) {
        if (asgs[i].id === sub.assignmentId) { asg = asgs[i]; break; }
      }
      if (!asg) return;
      var off = S.getOffering(asg.offeringId);
      if (!off || off.isLab) return;
      var t = hist.teachers[off.teacherId];
      if (!t) t = hist.teachers[off.teacherId] = { n: 0, sum: 0 };
      t.n += 1;
      t.sum += sub.score;
    });

    /* 每天已有几门课：用来判断"再加一门会不会堆在同一天" */
    var dayLoad = {};
    S.scheduleOf(studentId).forEach(function (it) {
      dayLoad[it.day] = (dayLoad[it.day] || 0) + 1;
    });

    return {
      id: stu.id, name: stu.name, major: stu.major, grade: stu.grade,
      className: stu.className, earnedCredit: stu.earnedCredit || 0,
      cats: MAJOR_CATS[stu.major] || ['arc', 'dar'],
      hist: hist,
      dayLoad: dayLoad,
      selectedCredit: S.selectedCredit(studentId),
      maxCredit: s.maxCredit,
      courseCount: enrolls.length
    };
  }

  /* ---------- 五个打分器，每个返回 { delta, detail } ---------- */

  function scoreDirection(profile, course) {
    var rank = profile.cats.indexOf(course.cat);
    var base = rank === 0 ? 22 : (rank === 1 ? 17 : 5);
    var n = profile.hist.cats[course.cat] || 0;
    var delta = Math.min(30, base + Math.min(8, n * 4));

    var detail = rank === 0 ? '与主修方向一致'
      : (rank === 1 ? '属于相关方向' : '跨方向选修');
    if (n > 0) detail += '，已修 ' + n + ' 门同方向课程';
    return { delta: delta, detail: detail };
  }

  function scoreChain(profile, course) {
    var p = prefix(course.code);
    var lv = level(course.code);
    var mine = profile.hist.courses.filter(function (c) { return prefix(c) === p; });

    if (!mine.length) {
      var base = profile.cats.indexOf(course.cat) >= 0 ? 12 : 6;
      return { delta: base, detail: '尚无同系列先修课，属于新领域' };
    }

    var ref = mine[0];
    mine.forEach(function (c) { if (level(c) > level(ref)) ref = c; });
    var refLv = level(ref);

    if (lv === refLv + 1) return { delta: 25, detail: '接上《' + ref + '》，正好是下一级' };
    if (lv === refLv + 2) return { delta: 17, detail: '在《' + ref + '》之上跨一级，跨度较大' };
    if (lv > refLv + 2) return { delta: 10, detail: '比已修的《' + ref + '》高 ' + (lv - refLv) + ' 级，跨度很大' };
    if (lv === refLv) return { delta: 8, detail: '与已修的《' + ref + '》同层级' };
    return { delta: 5, detail: '低于已修的《' + ref + '》，属于回头补基础' };
  }

  function scoreSchedule(profile, offering) {
    var load = 0;
    (offering.schedules || []).forEach(function (s) {
      if ((profile.dayLoad[s.day] || 0) > load) load = profile.dayLoad[s.day] || 0;
    });
    if (load === 0) return { delta: 20, detail: '上课当天没有其他课，时间从容' };
    if (load === 1) return { delta: 18, detail: '上课当天已有 1 门课' };
    if (load === 2) return { delta: 14, detail: '上课当天已有 2 门课，略挤' };
    return { delta: 9, detail: '上课当天已有 ' + load + ' 门课，偏挤' };
  }

  function scoreCapacity(offering) {
    var left = offering.capacity - offering.selectedCount;
    if (left > 0) {
      var delta = Math.min(15, 8 + Math.round(7 * left / offering.capacity));
      return { delta: delta, detail: '还剩 ' + left + ' / ' + offering.capacity + ' 个名额' };
    }
    var q = S.waitlistCount(offering.id);
    return { delta: 4, detail: '已满，可排候补第 ' + (q + 1) + ' 位' };
  }

  function scoreTeacher(profile, offering) {
    var t = profile.hist.teachers[offering.teacherId];
    if (t && t.n > 0) {
      var avg = Math.round(t.sum / t.n);
      return {
        delta: Math.max(4, Math.round(10 * avg / 100)),
        detail: '你上过他 ' + t.n + ' 门课，作业均分 ' + avg
      };
    }
    return { delta: 5, detail: '没上过这位老师的课，按中性计分' };
  }

  /* ---------- 主入口 ---------- */

  function recommend(studentId, opts) {
    opts = opts || {};
    var topN = opts.top || 4;
    var s = S.load();
    var profile = buildProfile(studentId);
    var myEnrolls = S.myEnrollments(studentId);

    var stats = {
      total: 0, enrolled: 0, waitlisted: 0,
      sameCourse: 0, conflict: 0, credit: 0, recommended: 0
    };
    var items = [];

    S.listOfferings().forEach(function (v) {
      stats.total++;
      var o = v.offering, c = v.course;

      /* 硬约束：这些不是"分数低"，是"根本选不了"，直接从候选里剔除 */
      if (S.isEnrolled(studentId, o.id)) { stats.enrolled++; return; }
      if (S.isWaitlisted(studentId, o.id)) { stats.waitlisted++; return; }

      var same = myEnrolls.some(function (e) {
        var oo = S.getOffering(e.offeringId);
        return oo && oo.code === o.code;
      });
      if (same) { stats.sameCourse++; return; }

      if (S.findConflict(studentId, o.id)) { stats.conflict++; return; }
      if (profile.selectedCredit + c.credit > profile.maxCredit) { stats.credit++; return; }

      var breakdown = [
        { key: 'direction', label: '方向匹配', max: 30, detail: '' },
        { key: 'chain',     label: '课程衔接', max: 25, detail: '' },
        { key: 'schedule',  label: '课表负担', max: 20, detail: '' },
        { key: 'capacity',  label: '名额情况', max: 15, detail: '' },
        { key: 'teacher',   label: '教师熟悉度', max: 10, detail: '' }
      ];
      var parts = {
        direction: scoreDirection(profile, c),
        chain: scoreChain(profile, c),
        schedule: scoreSchedule(profile, o),
        capacity: scoreCapacity(o),
        teacher: scoreTeacher(profile, o)
      };
      var total = 0;
      breakdown.forEach(function (b) {
        var r = parts[b.key];
        b.delta = r.delta;
        b.detail = r.detail;
        total += r.delta;
      });

      items.push({
        offeringId: v.id,
        code: c.code,
        name: c.name,
        credit: c.credit,
        cat: c.cat,
        catName: v.category ? v.category.name : c.cat,
        teacher: v.teacher ? v.teacher.name : '—',
        teacherTitle: v.teacher ? v.teacher.title : '',
        slotLabel: v.slotLabel || '待定',
        capacity: o.capacity,
        selectedCount: o.selectedCount,
        left: v.left,
        full: v.full,
        score: total,
        verdict: total >= 80 ? 'strong' : (total >= 65 ? 'good' : 'ok'),
        breakdown: breakdown
      });
    });

    items.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.left !== a.left) return b.left - a.left;
      return a.offeringId < b.offeringId ? -1 : 1;
    });

    stats.recommended = items.length;

    return {
      provider: 'rule',
      studentId: studentId,
      profile: profile,
      stats: stats,
      items: items.slice(0, topN),
      all: items
    };
  }

  global.AI = {
    provider: 'rule',
    WEIGHTS: WEIGHTS,
    MAJOR_CATS: MAJOR_CATS,
    recommend: recommend,
    profile: buildProfile,
    /* 暴露给测试用 */
    _prefix: prefix,
    _level: level
  };
})(typeof window !== 'undefined' ? window : globalThis);
