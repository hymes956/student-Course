/* ===========================================================
 * store.js — 业务逻辑层（不依赖 DOM，可用 node 直接加载测试）
 *
 * 真实实现的部分：
 *   1. 选课并发控制（三种实现对比：naive / naive-index / atomic）
 *   2. 上课时间冲突检测（星期 + 节次区间 + 周次区间 + 单双周）
 *   3. 学分上限校验
 *   4. 签到码生成 / 刷新 / 校验 + 出勤状态判定
 *   5. 作业截止时间判定 + 迟交标记 + 批改
 *   6. 学分与出勤统计
 * =========================================================== */
(function (global) {
  'use strict';

  var KEY = 'course-demo-state-v1';
  var state = null;

  var DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var WEEK_TYPE_LABEL = { all: '每周', odd: '单周', even: '双周' };

  /* ---------- 工具 ---------- */

  function nowFn() { return new Date(); }
  var nowOverride = null;
  function now() { return nowOverride ? new Date(nowOverride) : nowFn(); }

  function tick(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms == null ? 0 : ms); });
  }

  function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDateTime(d) {
    if (typeof d === 'string') d = parseDateTime(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function parseDateTime(s) {
    if (!s) return null;
    var m = String(s).replace('T', ' ').match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0);
  }

  function fmtDate(d) {
    if (typeof d === 'string') d = parseDateTime(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtTime(d) {
    if (typeof d === 'string') d = parseDateTime(d);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 把节次区间转成可读文字：3-4 → "第 3-4 节" */
  function periodText(start, end) {
    return start === end ? ('第 ' + start + ' 节') : ('第 ' + start + '-' + end + ' 节');
  }

  function slotText(s) {
    var wt = s.weekType && s.weekType !== 'all' ? ('（' + WEEK_TYPE_LABEL[s.weekType] + '）') : '';
    return DAY_NAMES[s.day] + ' ' + periodText(s.start, s.end) + wt;
  }

  /* 周次区间 + 单双周是否相容 */
  function weekOverlap(a, b) {
    if (a.weekStart > b.weekEnd || b.weekStart > a.weekEnd) return false;
    var ta = a.weekType || 'all', tb = b.weekType || 'all';
    if (ta === 'all' || tb === 'all') return true;
    if (ta === tb) return true;
    return false; /* 单周 vs 双周：即使周次区间重叠也不会撞上 */
  }

  /* 两个排课是否冲突：同一天 + 节次区间重叠 + 周次相容 */
  function slotsConflict(a, b) {
    if (a.day !== b.day) return false;
    if (a.start > b.end || b.start > a.end) return false;
    return weekOverlap(a, b);
  }

  /* ---------- 持久化 ---------- */

  var storageCache;
  var storageProbed = false;
  function tryStorage() {
    if (storageProbed) return storageCache;
    storageProbed = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__probe__', '1');
        localStorage.removeItem('__probe__');
        storageCache = localStorage;
      }
    } catch (e) { /* file:// 下 Safari 等可能禁用，降级为内存态 */ }
    return storageCache || null;
  }

  function save() {
    var ls = tryStorage();
    if (!ls) return;
    try { ls.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 配额满，忽略 */ }
  }

  /* 选课轮次相对"今天"生成，而不是写死日期。
     写死日期的演示工程过几周就会变成「本轮选课已结束」，一键选课全废。 */
  function roundWindow() {
    var t = now();
    return {
      openAt: fmtDateTime(new Date(t.getTime() - 7 * 86400000)),
      closeAt: fmtDateTime(new Date(t.getTime() + 30 * 86400000))
    };
  }

  /* 老 localStorage 里存的截止日可能已经过去，自动顺延一期 */
  function ensureRoundOpen() {
    if (!state) return;
    var r = state.enrollRound;
    if (!r || !r.closeAt || now() > parseDateTime(r.closeAt)) {
      state.enrollRound = roundWindow();
      save();
    }
  }

  function buildFresh() {
    var s = {
      version: 1,
      term: SEED.term,
      termKey: SEED.termKey,
      maxCredit: SEED.maxCredit,
      weeks: SEED.weeks,
      enrollRound: roundWindow(),
      currentUserId: null,
      offerings: clone(SEED.offerings),
      enrollments: [],
      sessions: clone(SEED.pastSessions),
      submissions: clone(SEED.submissions),
      messages: clone(SEED.messages)
    };

    /* 关键：把每门课的 selectedCount 落成真实的选课行，
       否则"已选 31 人"只是个数字，教师端名单和出勤统计全是空的。 */
    var pool = SEED.students.filter(function (st) { return /^20230[1-9][0-9]$/.test(st.id) && +st.id.slice(-3) >= 10; });
    var seq = 0, pi = 0;
    s.offerings.forEach(function (o) {
      var rows = [];
      if (SEED.myEnrollments.indexOf(o.id) >= 0) rows.push('2023001');
      while (rows.length < o.selectedCount && pool.length) {
        var cand = pool[pi % pool.length].id;
        pi++;
        if (rows.indexOf(cand) < 0) rows.push(cand);
      }
      rows.forEach(function (sid) {
        seq++;
        s.enrollments.push({
          id: 'ENR-' + seq,
          studentId: sid,
          offeringId: o.id,
          status: 'selected',
          selectTime: '2026-09-' + pad(21 + (seq % 8)) + ' ' + pad(8 + (seq % 12)) + ':' + pad(seq % 60)
        });
      });
    });

    /* 满员的课挂上候补队列，否则"名额已满"在演示里是个死胡同。
       林晓阳固定排在 DAR301-01 的第 1 位，方便演示递补。 */
    s.offerings.forEach(function (o) {
      if (o.selectedCount < o.capacity) return;
      var n = 3 + (o.id.length % 5);
      for (var k = 0; k < n; k++) {
        var cand = pool[(pi++) % pool.length].id;
        if (s.enrollments.some(function (e) { return e.offeringId === o.id && e.studentId === cand; })) continue;
        seq++;
        s.enrollments.push({
          id: 'WL-' + seq, studentId: cand, offeringId: o.id, status: 'waitlisted',
          waitlistOrder: k + 2, selectTime: '2026-09-' + pad(22 + (k % 6)) + ' ' + pad(9 + (k % 8)) + ':' + pad((k * 7) % 60)
        });
      }
      if (o.id === 'DAR301-01') {
        s.enrollments.push({
          id: 'WL-ME', studentId: '2023001', offeringId: o.id, status: 'waitlisted',
          waitlistOrder: 1, selectTime: '2026-09-22 08:31'
        });
      }
    });

    /* 历史签到的明细也要落成真实记录，否则出勤率永远是 0% */
    s.sessions.forEach(function (sess) {
      var rows = s.enrollments.filter(function (e) {
        return e.offeringId === sess.offeringId && e.status === 'selected';
      });
      var base = parseDateTime(sess.startTime);
      sess.records = [];
      rows.forEach(function (e, i) {
        if (i % 11 === 5) return;                    /* 约 9% 缺勤 */
        var late = (i % 13 === 7);                   /* 约 8% 迟到 */
        var t = new Date(base.getTime() + (late ? 12 : 2 + (i % 5)) * 60000);
        sess.records.push({
          studentId: e.studentId, checkTime: fmtDateTime(t),
          status: late ? 'late' : 'present'
        });
      });
    });

    /* 预置的提交记录必须落在真实名单里的人身上，
       否则教师端会出现"提交了但名单里查无此人"的脏数据。 */
    s.submissions.forEach(function (sub) {
      var a = null;
      for (var i = 0; i < SEED.assignments.length; i++) {
        if (SEED.assignments[i].id === sub.assignmentId) a = SEED.assignments[i];
      }
      if (!a) return;
      var rows = s.enrollments.filter(function (e) {
        return e.offeringId === a.offeringId && e.status === 'selected';
      });
      var isMember = rows.some(function (e) { return e.studentId === sub.studentId; });
      if (isMember) return;
      var alt = rows.filter(function (e) { return e.studentId !== '2023001'; })[0];
      if (alt) sub.studentId = alt.studentId;
    });

    return s;
  }

  function load() {
    if (state) return state;
    var ls = tryStorage();
    if (ls) {
      try {
        var raw = ls.getItem(KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.version === 1) { state = parsed; ensureRoundOpen(); return state; }
        }
      } catch (e) { /* 数据损坏则重建 */ }
    }
    state = buildFresh();
    save();
    return state;
  }

  /* ---------- 查询 ---------- */

  function getCourse(code) {
    for (var i = 0; i < SEED.courses.length; i++) if (SEED.courses[i].code === code) return SEED.courses[i];
    return null;
  }
  function getTeacher(id) {
    for (var i = 0; i < SEED.teachers.length; i++) if (SEED.teachers[i].id === id) return SEED.teachers[i];
    return null;
  }
  function getCategory(id) {
    for (var i = 0; i < SEED.categories.length; i++) if (SEED.categories[i].id === id) return SEED.categories[i];
    return null;
  }
  function getStudent(id) {
    for (var i = 0; i < SEED.students.length; i++) if (SEED.students[i].id === id) return SEED.students[i];
    return { id: id, name: id, major: '—', className: '—', earnedCredit: 0 };
  }
  function getOffering(id) {
    var s = load();
    for (var i = 0; i < s.offerings.length; i++) if (s.offerings[i].id === id) return s.offerings[i];
    return null;
  }

  /* 开课 + 课程 + 教师 的合并视图，UI 直接用这个 */
  function offeringView(id) {
    var o = getOffering(id);
    if (!o) return null;
    var c = o.isLab ? { code: o.id, name: '并发实验室虚拟课程', credit: 0, hours: 0, cat: 'dar', type: '演示' } : getCourse(o.code);
    var t = getTeacher(o.teacherId);
    var left = o.capacity - o.selectedCount;
    return {
      id: o.id, offering: o, course: c, teacher: t,
      left: left,
      full: left <= 0,
      schedules: o.schedules || [],
      slotLabel: (o.schedules || []).map(slotText).join(' / '),
      category: getCategory(c ? c.cat : 'dar')
    };
  }

  function listOfferings(filter) {
    filter = filter || {};
    var s = load();
    var out = [];
    for (var i = 0; i < s.offerings.length; i++) {
      if (s.offerings[i].isLab) continue;
      var v = offeringView(s.offerings[i].id);
      if (!v) continue;
      if (filter.cat && v.course.cat !== filter.cat) continue;
      if (filter.keyword) {
        var k = filter.keyword.toLowerCase();
        var hay = (v.course.name + ' ' + v.course.code + ' ' + (v.teacher ? v.teacher.name : '') + ' ' + v.category.name).toLowerCase();
        if (hay.indexOf(k) < 0) continue;
      }
      if (filter.onlyLeft && v.full) continue;
      if (filter.offeringIds && filter.offeringIds.indexOf(v.id) < 0) continue;
      out.push(v);
    }
    out.sort(function (a, b) {
      if (a.course.cat !== b.course.cat) return a.course.cat < b.course.cat ? -1 : 1;
      return a.course.code < b.course.code ? -1 : 1;
    });
    return out;
  }

  function myEnrollments(studentId) {
    var s = load();
    return s.enrollments.filter(function (e) {
      return e.studentId === studentId && e.status === 'selected';
    });
  }

  function isEnrolled(studentId, offeringId) {
    return myEnrollments(studentId).some(function (e) { return e.offeringId === offeringId; });
  }

  function selectedCredit(studentId) {
    var list = myEnrollments(studentId), sum = 0;
    for (var i = 0; i < list.length; i++) {
      var o = getOffering(list[i].offeringId);
      if (!o || o.isLab) continue;
      var c = getCourse(o.code);
      if (c) sum += c.credit;
    }
    return sum;
  }

  /* ---------- 时间冲突检测 ---------- */

  /* 返回与已选课程冲突的第一个排课，无冲突返回 null */
  function findConflict(studentId, offeringId) {
    var target = getOffering(offeringId);
    if (!target) return null;
    var mine = myEnrollments(studentId);
    for (var i = 0; i < mine.length; i++) {
      if (mine[i].offeringId === offeringId) continue;
      var other = getOffering(mine[i].offeringId);
      if (!other || other.isLab) continue;
      for (var a = 0; a < (target.schedules || []).length; a++) {
        for (var b = 0; b < (other.schedules || []).length; b++) {
          if (slotsConflict(target.schedules[a], other.schedules[b])) {
            return {
              offeringId: other.id,
              course: getCourse(other.code),
              targetSlot: slotText(target.schedules[a]),
              otherSlot: slotText(other.schedules[b])
            };
          }
        }
      }
    }
    return null;
  }

  /* 我的课表：按节次展开的二维结构 */
  function scheduleOf(studentId) {
    var mine = myEnrollments(studentId);
    var items = [];
    for (var i = 0; i < mine.length; i++) {
      var v = offeringView(mine[i].offeringId);
      if (!v) continue;
      for (var j = 0; j < v.schedules.length; j++) {
        var s = v.schedules[j];
        items.push({
          offeringId: v.id, course: v.course, teacher: v.teacher, category: v.category,
          day: s.day, start: s.start, end: s.end, room: s.room,
          weekStart: s.weekStart, weekEnd: s.weekEnd, weekType: s.weekType || 'all',
          slotLabel: slotText(s), conflict: false
        });
      }
    }
    /* 标记互相冲突的格子 */
    for (var m = 0; m < items.length; m++) {
      for (var n = m + 1; n < items.length; n++) {
        if (slotsConflict(items[m], items[n])) { items[m].conflict = true; items[n].conflict = true; }
      }
    }
    return items;
  }

  /* ---------- 选课（三种实现，供并发实验室对比） ---------- */

  /**
   * mode:
   *   'naive'       先查后写，无唯一索引      → 会超卖、也会重复选
   *   'naive-index' 先查后写，写入时查唯一索引 → 不重复选，但仍然超卖
   *   'atomic'      条件扣减（判断与写入之间不让出事件循环）+ 唯一索引 → 正确
   */
  async function enroll(studentId, offeringId, mode) {
    mode = mode || 'atomic';
    var s = load();
    var o = getOffering(offeringId);
    if (!o) return { ok: false, reason: '课程不存在' };

    function hasDup() {
      return s.enrollments.some(function (e) {
        return e.studentId === studentId && e.offeringId === offeringId && e.status === 'selected';
      });
    }
    function pushEnrollment() {
      o.selectedCount += 1;
      s.enrollments.push({
        id: 'ENR-' + offeringId + '-' + studentId + '-' + s.enrollments.length,
        studentId: studentId, offeringId: offeringId, status: 'selected',
        selectTime: fmtDateTime(now())
      });
    }

    /* 模拟一次客户端到服务端的网络往返 */
    await tick(randInt(1, 3));

    if (mode === 'atomic') {
      /* ↓↓↓ 关键：判断与写入之间没有任何 await，这段在事件循环里是原子的 ↓↓↓ */
      if (hasDup()) return { ok: false, reason: '你已选过这门课' };
      if (o.selectedCount >= o.capacity) return { ok: false, reason: '名额已满' };
      pushEnrollment();
      /* ↑↑↑ 同步块结束 ↑↑↑ */
      save();
      return { ok: true };
    }

    /* 朴素实现：先读出来判断…… */
    var dup = hasDup();
    var full = o.selectedCount >= o.capacity;
    /* ……中间让出事件循环（真实系统里这段时间够别人抢走名额了） */
    await tick(randInt(1, 3));

    if (dup) return { ok: false, reason: '你已选过这门课' };
    if (full) return { ok: false, reason: '名额已满' };

    if (mode === 'naive-index') {
      /* 数据库唯一索引兜底：能挡住重复选，挡不住超卖 */
      if (hasDup()) return { ok: false, reason: '唯一索引冲突：已选过这门课' };
    }
    pushEnrollment();
    save();
    return { ok: true };
  }

  /* 学生端"选课"按钮走的完整业务链路 */
  async function selectCourse(studentId, offeringId, opts) {
    opts = opts || {};
    var s = load();
    var o = getOffering(offeringId);
    if (!o) return { ok: false, reason: '课程不存在' };

    var closeAt = parseDateTime(s.enrollRound.closeAt);
    if (now() > closeAt) return { ok: false, reason: '本轮选课已结束（截止 ' + s.enrollRound.closeAt + '）' };
    if (o.status === 'closed') return { ok: false, reason: '该教学班已停开' };

    var c = getCourse(o.code);
    if (isEnrolled(studentId, offeringId)) return { ok: false, reason: '你已选过这门课' };
    if (isWaitlisted(studentId, offeringId)) return { ok: false, reason: '你已在候补队列中（第 ' + waitlistOrderOf(studentId, offeringId) + ' 位）' };

    var mine = myEnrollments(studentId);
    for (var i = 0; i < mine.length; i++) {
      var oo = getOffering(mine[i].offeringId);
      if (oo && oo.code === o.code) return { ok: false, reason: '你已选过《' + c.name + '》的其他教学班' };
    }

    var cf = findConflict(studentId, offeringId);
    if (cf) {
      return { ok: false, reason: '与《' + cf.course.name + '》时间冲突（' + cf.targetSlot + ' ↔ ' + cf.otherSlot + '）' };
    }

    var used = selectedCredit(studentId);
    if (used + c.credit > s.maxCredit) {
      return { ok: false, reason: '超出本学期学分上限（已选 ' + used + ' + 本课 ' + c.credit + ' > ' + s.maxCredit + '）' };
    }

    /* 满员：默认拒绝；调用方明确要求候补时进队列 */
    if (o.selectedCount >= o.capacity) {
      if (opts.waitlist) return joinWaitlist(studentId, offeringId);
      return { ok: false, reason: '名额已满' };
    }

    var res = await enroll(studentId, offeringId, 'atomic');
    if (res.ok) {
      pushMessage('enroll', '选课成功：《' + c.name + '》',
        '教学班 ' + o.id + '，' + c.credit + ' 学分，' + (o.schedules || []).map(slotText).join(' / ') + '。可到「我的课表」查看。');
    }
    return res;
  }

  /* ---------- 候补队列 ---------- */

  function isWaitlisted(studentId, offeringId) {
    return load().enrollments.some(function (e) {
      return e.studentId === studentId && e.offeringId === offeringId && e.status === 'waitlisted';
    });
  }

  function waitlistOrderOf(studentId, offeringId) {
    var hit = load().enrollments.filter(function (e) {
      return e.studentId === studentId && e.offeringId === offeringId && e.status === 'waitlisted';
    })[0];
    return hit ? hit.waitlistOrder : null;
  }

  function waitlistCount(offeringId) {
    return load().enrollments.filter(function (e) {
      return e.offeringId === offeringId && e.status === 'waitlisted';
    }).length;
  }

  function waitlistOf(offeringId) {
    return load().enrollments.filter(function (e) {
      return e.offeringId === offeringId && e.status === 'waitlisted';
    }).sort(function (a, b) { return (a.waitlistOrder || 0) - (b.waitlistOrder || 0); });
  }

  function myWaitlist(studentId) {
    return load().enrollments.filter(function (e) {
      return e.studentId === studentId && e.status === 'waitlisted';
    }).sort(function (a, b) { return (a.waitlistOrder || 0) - (b.waitlistOrder || 0); })
      .map(function (e) {
        var v = offeringView(e.offeringId);
        return { offeringId: e.offeringId, order: e.waitlistOrder, selectTime: e.selectTime, view: v, total: waitlistCount(e.offeringId) };
      }).filter(function (x) { return x.view; });
  }

  function joinWaitlist(studentId, offeringId) {
    var s = load();
    var o = getOffering(offeringId);
    if (!o) return { ok: false, reason: '课程不存在' };
    if (isEnrolled(studentId, offeringId)) return { ok: false, reason: '你已选过这门课' };
    if (isWaitlisted(studentId, offeringId)) return { ok: false, reason: '你已在候补队列中' };
    if (o.selectedCount < o.capacity) return { ok: false, reason: '还有名额，请直接选课' };

    var order = waitlistCount(offeringId) + 1;
    s.enrollments.push({
      id: 'WL-' + offeringId + '-' + studentId + '-' + Date.now(),
      studentId: studentId, offeringId: offeringId, status: 'waitlisted',
      waitlistOrder: order, selectTime: fmtDateTime(now())
    });
    var c = getCourse(o.code);
    pushMessage('enroll', '已加入候补：《' + c.name + '》',
      '你排在第 ' + order + ' 位。有同学退课时，系统会按候补顺序自动递补，无需手动操作。');
    save();
    return { ok: true, order: order, reason: '已加入候补，第 ' + order + ' 位' };
  }

  function dropWaitlist(studentId, offeringId) {
    var s = load();
    var hit = null;
    for (var i = 0; i < s.enrollments.length; i++) {
      var e = s.enrollments[i];
      if (e.studentId === studentId && e.offeringId === offeringId && e.status === 'waitlisted') { hit = e; break; }
    }
    if (!hit) return { ok: false, reason: '你不在候补队列中' };
    hit.status = 'waitlist-cancelled';
    /* 排位后面的往前挪，保持队列连续 */
    var rest = waitlistOf(offeringId);
    rest.forEach(function (e, i) { e.waitlistOrder = i + 1; });
    save();
    return { ok: true };
  }

  /**
   * 退课后自动递补。
   * 注意这里用的是 while + 条件判断，和选课一样不能留间隙：
   * 递补过程中一旦名额填满立刻停手，否则一样会超卖。
   */
  function promoteFromWaitlist(offeringId) {
    var s = load();
    var o = getOffering(offeringId);
    if (!o) return [];
    var promoted = [];
    while (o.selectedCount < o.capacity) {
      var queue = waitlistOf(offeringId);
      if (!queue.length) break;
      var next = queue[0];
      next.status = 'selected';
      next.waitlistOrder = null;
      next.selectTime = fmtDateTime(now());
      next.promotedAt = fmtDateTime(now());
      o.selectedCount += 1;
      promoted.push(next);
      if (s.currentUserId === next.studentId) {
        var c = getCourse(o.code);
        pushMessage('enroll', '候补成功：《' + c.name + '》已自动选上',
          '有同学退课，你按候补顺序递补成功。教学班 ' + o.id + '，请到「我的课表」查看。');
      }
    }
    save();
    return promoted;
  }

  /* 演示用：让某门课随机一名学生退课，用来触发候补递补 */
  function simulateDrop(offeringId) {
    var s = load();
    var rows = s.enrollments.filter(function (e) {
      return e.offeringId === offeringId && e.status === 'selected' && e.studentId !== s.currentUserId;
    });
    if (!rows.length) return { ok: false, reason: '没有可退课的选课记录' };
    var pick = rows[Math.floor(Math.random() * rows.length)];
    var st = getStudent(pick.studentId);
    var r = dropCourse(pick.studentId, offeringId);
    if (!r.ok) return r;
    return { ok: true, student: st, promoted: r.promoted };
  }

  function dropCourse(studentId, offeringId) {
    var s = load();
    var hit = null;
    for (var i = 0; i < s.enrollments.length; i++) {
      var e = s.enrollments[i];
      if (e.studentId === studentId && e.offeringId === offeringId && e.status === 'selected') { hit = e; break; }
    }
    if (!hit) return { ok: false, reason: '你未选这门课' };
    hit.status = 'dropped';
    hit.dropTime = fmtDateTime(now());
    var o = getOffering(offeringId);
    if (o && o.selectedCount > 0) o.selectedCount -= 1;
    save();

    /* 退课立刻触发候补递补：名额不能空着 */
    var promoted = promoteFromWaitlist(offeringId);

    if (s.currentUserId === studentId && o) {
      var c = getCourse(o.code);
      pushMessage('enroll', '已退课：《' + c.name + '》',
        '名额已释放' + (promoted.length ? '，并自动递补给了候补队列的第 1 位同学。' : '。'));
    }
    save();
    return { ok: true, promoted: promoted };
  }

  /* ---------- 签到 ---------- */

  function genCode() {
    var c = '';
    for (var i = 0; i < 6; i++) c += randInt(0, 9);
    return c;
  }

  var CODE_TTL_SEC = 60;   /* 签到码 60 秒自动刷新 */
  var LATE_AFTER_SEC = 300; /* 开始 5 分钟内算准时，之后算迟到 */

  function openSession(offeringId, teacherId, minutes) {
    var s = load();
    var t0 = now();
    var sess = {
      id: 'SES-' + Date.now(),
      offeringId: offeringId,
      teacherId: teacherId || (getOffering(offeringId) || {}).teacherId,
      code: genCode(),
      codeExpireAt: fmtDateTime(new Date(t0.getTime() + CODE_TTL_SEC * 1000)),
      startTime: fmtDateTime(t0),
      endTime: fmtDateTime(new Date(t0.getTime() + (minutes || 10) * 60 * 1000)),
      status: 'open',
      records: []
    };
    s.sessions.push(sess);
    save();
    return sess;
  }

  function refreshCode(sessionId) {
    var s = load();
    for (var i = 0; i < s.sessions.length; i++) {
      if (s.sessions[i].id === sessionId && s.sessions[i].status === 'open') {
        s.sessions[i].code = genCode();
        s.sessions[i].codeExpireAt = fmtDateTime(new Date(now().getTime() + CODE_TTL_SEC * 1000));
        save();
        return s.sessions[i];
      }
    }
    return null;
  }

  function closeSession(sessionId) {
    var s = load();
    for (var i = 0; i < s.sessions.length; i++) {
      if (s.sessions[i].id === sessionId) { s.sessions[i].status = 'closed'; save(); return s.sessions[i]; }
    }
    return null;
  }

  function activeSessionOf(offeringId) {
    var s = load();
    var list = s.sessions.filter(function (x) {
      return x.offeringId === offeringId && x.status === 'open' && now() <= parseDateTime(x.endTime);
    });
    return list.length ? list[list.length - 1] : null;
  }

  function checkIn(studentId, code) {
    var s = load();
    code = String(code || '').trim();
    if (!code) return { ok: false, reason: '请输入签到码' };

    var t = now();
    var open = s.sessions.filter(function (x) { return x.status === 'open' && t <= parseDateTime(x.endTime); });
    if (!open.length) return { ok: false, reason: '当前没有进行中的签到' };

    var sess = null;
    for (var i = 0; i < open.length; i++) if (open[i].code === code) { sess = open[i]; break; }
    if (!sess) return { ok: false, reason: '签到码不正确，或已被刷新' };

    if (t > parseDateTime(sess.codeExpireAt)) {
      return { ok: false, reason: '该签到码已失效（每 ' + CODE_TTL_SEC + ' 秒自动刷新），请查看教师屏幕上的最新码' };
    }
    if (!isEnrolled(studentId, sess.offeringId)) {
      return { ok: false, reason: '你没有选修这门课，无法签到' };
    }
    var dup = sess.records.some(function (r) { return r.studentId === studentId; });
    if (dup) return { ok: false, reason: '你已经签过到了' };

    var elapsed = (t - parseDateTime(sess.startTime)) / 1000;
    var status = elapsed <= LATE_AFTER_SEC ? 'present' : 'late';
    sess.records.push({ studentId: studentId, checkTime: fmtDateTime(t), status: status });
    var oc = getCourse((getOffering(sess.offeringId) || {}).code);
    pushMessage('attendance', '签到成功：' + (status === 'present' ? '出勤' : '迟到'),
      '《' + (oc ? oc.name : sess.offeringId) + '》于 ' + fmtTime(t) + ' 完成签到。');
    save();
    return { ok: true, status: status, session: sess };
  }

  /* 签到明细（含未签到学生，供教师端看板用） */
  function sessionRoster(sessionId) {
    var s = load();
    var sess = null;
    for (var i = 0; i < s.sessions.length; i++) if (s.sessions[i].id === sessionId) { sess = s.sessions[i]; break; }
    if (!sess) return [];
    var enrolled = myEnrollments2(sess.offeringId);
    var map = {};
    sess.records.forEach(function (r) { map[r.studentId] = r; });
    return enrolled.map(function (sid) {
      var st = getStudent(sid);
      var r = map[sid];
      return {
        studentId: sid, name: st.name, className: st.className,
        status: r ? r.status : 'absent',
        checkTime: r ? r.checkTime : '—'
      };
    });
  }

  /* 某门课的选课学生（不限当前用户） */
  function myEnrollments2(offeringId) {
    var s = load();
    return s.enrollments.filter(function (e) {
      return e.offeringId === offeringId && e.status === 'selected';
    }).map(function (e) { return e.studentId; });
  }

  /* 教师端：某门课的选课名单（直接来自选课行，与已选人数严格一致） */
  function rosterOf(offeringId) {
    return myEnrollments2(offeringId).map(function (sid) {
      var st = getStudent(sid);
      return { studentId: sid, name: st.name, className: st.className, major: st.major };
    });
  }

  function attendanceStats(studentId) {
    var s = load();
    var stat = { present: 0, late: 0, absent: 0, total: 0 };
    var mine = myEnrollments(studentId).map(function (e) { return e.offeringId; });
    s.sessions.forEach(function (sess) {
      if (mine.indexOf(sess.offeringId) < 0) return;
      stat.total += 1;
      var r = null;
      for (var i = 0; i < sess.records.length; i++) if (sess.records[i].studentId === studentId) { r = sess.records[i]; break; }
      if (!r) stat.absent += 1;
      else if (r.status === 'present') stat.present += 1;
      else stat.late += 1;
    });
    return stat;
  }

  /* ---------- 作业 ---------- */

  function assignmentView(assignmentId) {
    var a = null;
    for (var i = 0; i < SEED.assignments.length; i++) if (SEED.assignments[i].id === assignmentId) a = SEED.assignments[i];
    if (!a) return null;
    var s = load();
    var subs = s.submissions.filter(function (x) { return x.assignmentId === assignmentId; });
    var v = offeringView(a.offeringId);
    var deadline = parseDateTime(a.deadline);
    return {
      assignment: a, offering: v, course: v ? v.course : null, teacher: v ? v.teacher : null,
      submissions: subs, submitCount: subs.length,
      expired: now() > deadline,
      msLeft: deadline - now()
    };
  }

  function myAssignmentList(studentId) {
    var mine = myEnrollments(studentId).map(function (e) { return e.offeringId; });
    var s = load();
    var out = [];
    SEED.assignments.forEach(function (a) {
      if (mine.indexOf(a.offeringId) < 0) return;
      var sub = null;
      for (var i = 0; i < s.submissions.length; i++) {
        if (s.submissions[i].assignmentId === a.id && s.submissions[i].studentId === studentId) { sub = s.submissions[i]; break; }
      }
      var deadline = parseDateTime(a.deadline);
      var expired = now() > deadline;
      var status = sub ? (sub.gradedAt ? 'graded' : 'submitted') : (expired ? (a.allowLate ? 'overdue' : 'closed') : 'pending');
      out.push({
        assignment: a, submission: sub, offering: offeringView(a.offeringId),
        course: (offeringView(a.offeringId) || {}).course,
        expired: expired, deadline: deadline, status: status,
        msLeft: deadline - now()
      });
    });
    out.sort(function (x, y) { return x.deadline - y.deadline; });
    return out;
  }

  function submitHomework(assignmentId, studentId, content, fileName, fileSize) {
    var s = load();
    var a = null;
    for (var i = 0; i < SEED.assignments.length; i++) if (SEED.assignments[i].id === assignmentId) a = SEED.assignments[i];
    if (!a) return { ok: false, reason: '作业不存在' };
    if (!content && !fileName) return { ok: false, reason: '请填写作业内容或上传附件' };

    var t = now();
    var deadline = parseDateTime(a.deadline);
    var late = t > deadline;
    if (late && !a.allowLate) {
      return { ok: false, reason: '已超过截止时间（' + a.deadline + '），该作业不允许迟交' };
    }

    var existing = null;
    for (var j = 0; j < s.submissions.length; j++) {
      if (s.submissions[j].assignmentId === assignmentId && s.submissions[j].studentId === studentId) existing = s.submissions[j];
    }
    if (existing) {
      existing.content = content;
      existing.fileName = fileName || existing.fileName;
      existing.fileSize = fileSize || existing.fileSize;
      existing.submitTime = fmtDateTime(t);
      existing.isLate = late;
      existing.score = null;
      existing.comment = '';
      existing.gradedAt = null;
      pushMessage('homework', '已重新提交：' + a.title,
        '提交时间 ' + fmtDateTime(t) + (late ? '（迟交）' : '') + '。原有评分已清除，等待教师重新批改。');
      save();
      return { ok: true, updated: true, late: late };
    }
    s.submissions.push({
      id: 'SUB-' + Date.now(), assignmentId: assignmentId, studentId: studentId,
      content: content, fileName: fileName || '', fileSize: fileSize || 0,
      submitTime: fmtDateTime(t), isLate: late, score: null, comment: '', gradedAt: null
    });
    pushMessage('homework', '提交成功：' + a.title,
      '提交时间 ' + fmtDateTime(t) + (late ? '（迟交）' : '') + '。教师批改后会通知你。');
    save();
    return { ok: true, updated: false, late: late };
  }

  function gradeSubmission(submissionId, score, comment) {
    var s = load();
    for (var i = 0; i < s.submissions.length; i++) {
      if (s.submissions[i].id === submissionId) {
        var sub = s.submissions[i];
        sub.score = Number(score);
        sub.comment = comment || '';
        sub.gradedAt = fmtDateTime(now());
        /* 只给当事学生推消息（演示里就是当前登录用户） */
        if (s.currentUserId === sub.studentId) {
          var a = null;
          for (var k = 0; k < SEED.assignments.length; k++) if (SEED.assignments[k].id === sub.assignmentId) a = SEED.assignments[k];
          pushMessage('grade', '作业已批改：' + (a ? a.title : '') + ' ' + sub.score + ' 分',
            '评语：' + (sub.comment || '教师未填写评语'));
        }
        save();
        return { ok: true, submission: sub };
      }
    }
    return { ok: false, reason: '提交记录不存在' };
  }

  function homeworkStats(studentId) {
    var list = myAssignmentList(studentId);
    var stat = { total: list.length, pending: 0, submitted: 0, graded: 0, closed: 0, overdue: 0, avgScore: null };
    var sum = 0, cnt = 0;
    list.forEach(function (x) {
      if (x.status === 'pending') stat.pending += 1;
      else if (x.status === 'submitted') stat.submitted += 1;
      else if (x.status === 'graded') { stat.graded += 1; sum += x.submission.score; cnt += 1; }
      else if (x.status === 'closed') stat.closed += 1;
      else if (x.status === 'overdue') stat.overdue += 1;
    });
    if (cnt) stat.avgScore = Math.round(sum / cnt * 10) / 10;
    return stat;
  }

  /* ---------- 并发实验室 ---------- */

  function createLabOffering(capacity) {
    var s = load();
    var id = 'LAB-' + Date.now() + '-' + randInt(100, 999);
    s.offerings.push({
      id: id, code: id, teacherId: 'T01', capacity: capacity, selectedCount: 0,
      status: 'open', schedules: [], isLab: true
    });
    save();
    return id;
  }

  function clearLab() {
    var s = load();
    s.offerings = s.offerings.filter(function (o) { return !o.isLab; });
    s.enrollments = s.enrollments.filter(function (e) { return e.offeringId.indexOf('LAB-') !== 0; });
    save();
  }

  /**
   * 运行一次并发选课实验
   * @param {string} mode      'naive' | 'naive-index' | 'atomic'
   * @param {number} capacity  名额
   * @param {number} requests  并发请求数
   * @param {boolean} sameUser 是否用同一个学生反复请求（演示重复选课）
   */
  async function runConcurrencyLab(mode, capacity, requests, sameUser) {
    var offeringId = createLabOffering(capacity);
    var tasks = [];
    for (var i = 0; i < requests; i++) {
      var sid = sameUser ? 'LAB-USER' : ('LAB-S-' + pad3(i));
      tasks.push(enroll(sid, offeringId, mode));
    }
    var results = await Promise.all(tasks);
    var okCount = 0, reasons = {};
    results.forEach(function (r) {
      if (r.ok) okCount += 1;
      else reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    });
    var o = getOffering(offeringId);
    var rowCount = load().enrollments.filter(function (e) { return e.offeringId === offeringId && e.status === 'selected'; }).length;
    var out = {
      mode: mode, capacity: capacity, requests: requests, sameUser: !!sameUser,
      success: okCount,
      rejected: requests - okCount,
      selectedCount: o.selectedCount,
      rowCount: rowCount,
      oversold: Math.max(0, rowCount - capacity),
      dupRows: sameUser ? Math.max(0, rowCount - 1) : 0,
      reasons: reasons
    };
    clearLab();
    return out;
  }

  function pad3(n) { return ('00' + n).slice(-3); }

  /* ---------- 消息 ---------- */

  function messages() { return load().messages; }
  function unreadCount() { return load().messages.filter(function (m) { return !m.read; }).length; }

  /* 业务事件统一从这里推消息，消息中心才是"活"的 */
  function pushMessage(type, title, body) {
    var s = load();
    s.messages.unshift({
      id: 'MSG-' + Date.now() + '-' + randInt(100, 999),
      type: type, title: title, body: body,
      time: fmtDateTime(now()), read: false
    });
    if (s.messages.length > 60) s.messages.length = 60;
    save();
  }
  function readMessage(id) {
    var s = load();
    s.messages.forEach(function (m) { if (m.id === id) m.read = true; });
    save();
  }
  function readAllMessages() {
    var s = load();
    s.messages.forEach(function (m) { m.read = true; });
    save();
  }

  /* ---------- 统计（教务看板 / 教师端） ---------- */

  function enrolledCountOf(offeringId) {
    return load().enrollments.filter(function (e) {
      return e.offeringId === offeringId && e.status === 'selected';
    }).length;
  }

  /* 某门课每个学生的出勤汇总 */
  function attendanceMapOf(offeringId) {
    var s = load();
    var sessions = s.sessions.filter(function (x) { return x.offeringId === offeringId; });
    var map = {};
    sessions.forEach(function (sess) {
      sess.records.forEach(function (r) {
        if (!map[r.studentId]) map[r.studentId] = { present: 0, late: 0 };
        if (r.status === 'present') map[r.studentId].present += 1;
        else map[r.studentId].late += 1;
      });
    });
    return { sessions: sessions.length, map: map };
  }

  function statsOverview() {
    var s = load();
    var offerings = s.offerings.filter(function (o) { return !o.isLab; });
    var capacity = 0, selected = 0;
    offerings.forEach(function (o) { capacity += o.capacity; selected += o.selectedCount; });

    var waitlisted = s.enrollments.filter(function (e) { return e.status === 'waitlisted'; }).length;
    var enrollRows = s.enrollments.filter(function (e) { return e.status === 'selected'; }).length;

    /* 出勤率 = 实际签到人次 / 应签到人次 */
    var signedTotal = 0, expectedTotal = 0;
    s.sessions.forEach(function (sess) {
      expectedTotal += enrolledCountOf(sess.offeringId);
      signedTotal += sess.records.length;
    });

    /* 作业提交率 */
    var hwExpected = 0, hwSubmitted = 0;
    SEED.assignments.forEach(function (a) {
      hwExpected += enrolledCountOf(a.offeringId);
      hwSubmitted += s.submissions.filter(function (x) { return x.assignmentId === a.id; }).length;
    });

    return {
      students: SEED.students.length,
      teachers: SEED.teachers.length,
      courses: SEED.courses.length,
      offerings: offerings.length,
      capacity: capacity,
      selected: selected,
      enrollRows: enrollRows,
      fillRate: capacity ? selected / capacity : 0,
      waitlisted: waitlisted,
      sessions: s.sessions.length,
      signedTotal: signedTotal,
      expectedTotal: expectedTotal,
      attendanceRate: expectedTotal ? signedTotal / expectedTotal : 0,
      assignments: SEED.assignments.length,
      hwExpected: hwExpected,
      hwSubmitted: hwSubmitted,
      hwRate: hwExpected ? hwSubmitted / hwExpected : 0,
      messages: s.messages.length
    };
  }

  function statsByCategory() {
    var acc = {};
    SEED.categories.forEach(function (c) {
      acc[c.id] = { cat: c, offerings: 0, capacity: 0, selected: 0, waitlisted: 0 };
    });
    load().offerings.forEach(function (o) {
      if (o.isLab) return;
      var c = getCourse(o.code);
      if (!c || !acc[c.cat]) return;
      acc[c.cat].offerings += 1;
      acc[c.cat].capacity += o.capacity;
      acc[c.cat].selected += o.selectedCount;
      acc[c.cat].waitlisted += waitlistCount(o.id);
    });
    return SEED.categories.map(function (c) {
      var a = acc[c.id];
      a.rate = a.capacity ? a.selected / a.capacity : 0;
      return a;
    });
  }

  function statsOfferings() {
    return load().offerings.filter(function (o) { return !o.isLab; })
      .map(function (o) {
        var v = offeringView(o.id);
        return { v: v, waitlist: waitlistCount(o.id), rate: o.capacity ? o.selectedCount / o.capacity : 0 };
      })
      .sort(function (a, b) { return b.rate - a.rate; });
  }

  /* 教师端：某次作业的批改统计 + 未提交名单 */
  function gradingStats(assignmentId) {
    var s = load();
    var a = null;
    for (var i = 0; i < SEED.assignments.length; i++) if (SEED.assignments[i].id === assignmentId) a = SEED.assignments[i];
    if (!a) return null;

    var subs = s.submissions.filter(function (x) { return x.assignmentId === assignmentId; });
    var graded = subs.filter(function (x) { return x.score != null; });
    var scores = graded.map(function (x) { return x.score; });
    var submittedIds = subs.map(function (x) { return x.studentId; });

    var missing = s.enrollments.filter(function (e) {
      return e.offeringId === a.offeringId && e.status === 'selected' && submittedIds.indexOf(e.studentId) < 0;
    }).map(function (e) { return getStudent(e.studentId); });

    var buckets = [
      { label: '90-100', n: 0 }, { label: '80-89', n: 0 }, { label: '70-79', n: 0 },
      { label: '60-69', n: 0 }, { label: '<60', n: 0 }
    ];
    scores.forEach(function (sc) {
      if (sc >= 90) buckets[0].n += 1;
      else if (sc >= 80) buckets[1].n += 1;
      else if (sc >= 70) buckets[2].n += 1;
      else if (sc >= 60) buckets[3].n += 1;
      else buckets[4].n += 1;
    });

    return {
      assignment: a,
      enrolled: enrolledCountOf(a.offeringId),
      submitted: subs.length,
      graded: graded.length,
      late: subs.filter(function (x) { return x.isLate; }).length,
      missing: missing,
      avg: scores.length ? Math.round(scores.reduce(function (p, c) { return p + c; }, 0) / scores.length * 10) / 10 : null,
      max: scores.length ? Math.max.apply(null, scores) : null,
      min: scores.length ? Math.min.apply(null, scores) : null,
      buckets: buckets,
      bucketMax: Math.max.apply(null, buckets.map(function (b) { return b.n; }).concat([1])),
      submissions: subs
    };
  }

  /* ---------- CSV 导出（只生成文本，下载动作交给 UI 层） ---------- */

  function csvCell(v) {
    var t = String(v == null ? '' : v);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function buildCsv(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function rosterCsv(offeringId) {
    var v = offeringView(offeringId);
    if (!v) return null;
    var att = attendanceMapOf(offeringId);
    var rows = [
      ['选课名单'],
      ['课程', v.course.name, '教学班', v.id],
      ['教师', v.teacher ? v.teacher.name : '', '上课时间', v.slotLabel],
      ['已选', v.offering.selectedCount + ' / ' + v.offering.capacity, '候补', waitlistCount(offeringId) + ' 人'],
      [],
      ['学号', '姓名', '班级', '专业', '出勤', '迟到', '缺勤', '签到次数']
    ];
    rosterOf(offeringId).forEach(function (r) {
      var a = att.map[r.studentId] || { present: 0, late: 0 };
      var absent = Math.max(0, att.sessions - a.present - a.late);
      rows.push([r.studentId, r.name, r.className, r.major, a.present, a.late, absent, att.sessions]);
    });
    return { fileName: v.course.name + '_选课名单.csv', text: buildCsv(rows) };
  }

  function gradeCsv(assignmentId) {
    var g = gradingStats(assignmentId);
    if (!g) return null;
    var v = offeringView(g.assignment.offeringId);
    var rows = [
      ['作业成绩单'],
      ['课程', v ? v.course.name : '', '教学班', g.assignment.offeringId],
      ['作业', g.assignment.title, '满分', g.assignment.fullScore],
      ['截止', g.assignment.deadline, '已交', g.submitted + ' / ' + g.enrolled, '已批改', g.graded],
      ['平均分', g.avg == null ? '—' : g.avg, '最高', g.max == null ? '—' : g.max, '最低', g.min == null ? '—' : g.min],
      [],
      ['学号', '姓名', '提交时间', '是否迟交', '分数', '评语']
    ];
    g.submissions.forEach(function (sub) {
      var st = getStudent(sub.studentId);
      rows.push([sub.studentId, st.name, sub.submitTime, sub.isLate ? '是' : '否',
                 sub.score == null ? '未批改' : sub.score, sub.comment || '']);
    });
    rows.push([]);
    rows.push(['未提交（' + g.missing.length + ' 人）']);
    rows.push(['学号', '姓名', '班级']);
    g.missing.forEach(function (st) { rows.push([st.id, st.name, st.className]); });
    return { fileName: g.assignment.title + '_成绩单.csv', text: buildCsv(rows) };
  }

  /* ---------- 会话 / 重置 ---------- */

  function login(loginName, password) {
    var st = null;
    for (var i = 0; i < SEED.students.length; i++) if (SEED.students[i].id === loginName) st = SEED.students[i];
    if (!st) return { ok: false, reason: '学号不存在（演示账号：2023001 / 123456）' };
    if (password !== st.password) return { ok: false, reason: '密码不正确（演示密码：123456）' };
    var s = load();
    s.currentUserId = st.id;
    save();
    return { ok: true, student: st };
  }

  function logout() {
    var s = load();
    s.currentUserId = null;
    save();
  }

  function currentUser() {
    var s = load();
    return s.currentUserId ? getStudent(s.currentUserId) : null;
  }

  function reset() {
    state = buildFresh();
    var ls = tryStorage();
    if (ls) { try { ls.removeItem(KEY); } catch (e) {} }
    save();
    return state;
  }

  /* 导出给测试用 */
  global.Store = {
    /* 基础 */
    load: load, reset: reset, save: save,
    DAY_NAMES: DAY_NAMES, WEEK_TYPE_LABEL: WEEK_TYPE_LABEL,
    slotText: slotText, periodText: periodText, fmtDateTime: fmtDateTime, fmtDate: fmtDate, fmtTime: fmtTime,
    parseDateTime: parseDateTime, slotsConflict: slotsConflict,
    /* 查询 */
    getCourse: getCourse, getTeacher: getTeacher, getCategory: getCategory, getStudent: getStudent,
    getOffering: getOffering, offeringView: offeringView, listOfferings: listOfferings,
    myEnrollments: myEnrollments, isEnrolled: isEnrolled, selectedCredit: selectedCredit,
    /* 选课 */
    findConflict: findConflict, scheduleOf: scheduleOf,
    enroll: enroll, selectCourse: selectCourse, dropCourse: dropCourse,
    /* 候补 */
    isWaitlisted: isWaitlisted, waitlistCount: waitlistCount, waitlistOrderOf: waitlistOrderOf,
    waitlistOf: waitlistOf, myWaitlist: myWaitlist, joinWaitlist: joinWaitlist,
    dropWaitlist: dropWaitlist, promoteFromWaitlist: promoteFromWaitlist, simulateDrop: simulateDrop,
    /* 签到 */
    openSession: openSession, refreshCode: refreshCode, closeSession: closeSession,
    activeSessionOf: activeSessionOf, checkIn: checkIn, sessionRoster: sessionRoster,
    rosterOf: rosterOf, attendanceStats: attendanceStats,
    CODE_TTL_SEC: CODE_TTL_SEC,
    /* 作业 */
    assignmentView: assignmentView, myAssignmentList: myAssignmentList,
    submitHomework: submitHomework, gradeSubmission: gradeSubmission, homeworkStats: homeworkStats,
    gradingStats: gradingStats,
    /* 统计与导出 */
    enrolledCountOf: enrolledCountOf, attendanceMapOf: attendanceMapOf,
    statsOverview: statsOverview, statsByCategory: statsByCategory, statsOfferings: statsOfferings,
    buildCsv: buildCsv, rosterCsv: rosterCsv, gradeCsv: gradeCsv,
    /* 消息推送 */
    pushMessage: pushMessage,
    /* 实验室 */
    runConcurrencyLab: runConcurrencyLab, clearLab: clearLab, createLabOffering: createLabOffering,
    /* 消息与登录 */
    messages: messages, unreadCount: unreadCount, readMessage: readMessage, readAllMessages: readAllMessages,
    login: login, logout: logout, currentUser: currentUser,
    /* 测试钩子 */
    _setNow: function (s) { nowOverride = s; },
    _now: now
  };
})(typeof window !== 'undefined' ? window : globalThis);
