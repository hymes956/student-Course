/* ===========================================================
 * views.js — 页面渲染（返回 HTML 字符串，事件用 data-act 委托给 app.js）
 * =========================================================== */
(function (global) {
  'use strict';

  var S = global.Store;

  /* ---------- 小工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtLeft(ms) {
    if (ms <= 0) return '已结束';
    var sec = Math.floor(ms / 1000);
    var d = Math.floor(sec / 86400); sec %= 86400;
    var h = Math.floor(sec / 3600); sec %= 3600;
    var m = Math.floor(sec / 60);
    if (d > 0) return d + ' 天 ' + h + ' 小时';
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分钟';
    return '不足 1 分钟';
  }

  function fmtSize(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function catName(id) {
    var c = S.getCategory(id);
    return c ? c.name : id;
  }

  function todayDayNum() {
    var d = new Date().getDay();
    return d === 0 ? 7 : d;
  }

  function capBar(v) {
    var pct = Math.min(100, Math.round(v.offering.selectedCount / v.offering.capacity * 100));
    var cls = v.full ? 'danger' : (pct >= 80 ? 'warn' : '');
    return '<div class="bar"><i class="' + cls + '" style="width:' + pct + '%"></i></div>';
  }

  function hwStatusBadge(st) {
    var map = {
      pending: ['待提交', 'badge-warn'],
      submitted: ['已提交', 'badge-info'],
      graded: ['已批改', 'badge-ok'],
      closed: ['已截止', 'badge-danger'],
      overdue: ['已过期·可迟交', 'badge-danger']
    };
    var m = map[st] || ['未知', ''];
    return '<span class="badge ' + m[1] + '">' + m[0] + '</span>';
  }

  function enrollBtn(v, enrolled, wlOrder, wlCount) {
    if (enrolled) {
      return '<button class="btn btn-sm btn-danger" data-act="drop" data-id="' + v.id + '">退课</button>';
    }
    if (wlOrder) {
      return '<button class="btn btn-sm" disabled>候补中 · 第 ' + wlOrder + ' 位</button>';
    }
    if (v.full) {
      return '<button class="btn btn-sm btn-warn" data-act="waitlist" data-id="' + v.id + '">' +
             (wlCount ? '候补（' + wlCount + ' 人排队）' : '加入候补') + '</button>';
    }
    return '<button class="btn btn-sm btn-primary" data-act="enroll" data-id="' + v.id + '">选课</button>';
  }

  /* 某门课的出勤统计（按学生） */
  function attendanceOfOffering(offeringId) {
    var st = S.load();
    var sessions = st.sessions.filter(function (x) { return x.offeringId === offeringId; });
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

  /* ---------- 登录 ---------- */
  function login() {
    return '' +
      '<div class="login-wrap"><div class="login-card">' +
        '<div class="login-brand"><div class="brand-dot">选</div>' +
          '<div><div style="font-size:16px;font-weight:600">大学生选课系统</div>' +
          '<div class="small dim">数字建筑 · 建筑设计 · 智能建造 · 空间计算与图形学</div></div></div>' +
        '<div class="mt24"></div>' +
        '<div class="field"><label>学号</label>' +
          '<input class="input" id="login-name" placeholder="请输入学号" value="2023001" autocomplete="off"></div>' +
        '<div class="field"><label>密码</label>' +
          '<input class="input" id="login-pass" type="password" placeholder="请输入密码" value="123456"></div>' +
        '<button class="btn btn-primary btn-lg btn-block" data-act="do-login">登 录</button>' +
        '<div class="alert alert-info mt16"><span class="ico">i</span><div>' +
          '演示账号 <b>2023001</b>，密码 <b>123456</b>。' +
          '也可以直接用 <b>2023002 ~ 2023006</b> 登录（各自选课情况不同）。</div></div>' +
        '<div class="small dim mt12 center">纯前端演示 · 数据保存在浏览器本地，不联网</div>' +
      '</div></div>';
  }

  /* ---------- 工作台 ---------- */
  function dashboard() {
    var me = S.currentUser();
    var sid = me.id;
    var enrolled = S.myEnrollments(sid);
    var credit = S.selectedCredit(sid);
    var hs = S.homeworkStats(sid);
    var att = S.attendanceStats(sid);
    var maxCredit = S.load().maxCredit;
    var items = S.scheduleOf(sid);
    var today = todayDayNum();
    var todayItems = items.filter(function (x) { return x.day === today; })
                          .sort(function (a, b) { return a.start - b.start; });

    var attTotal = att.present + att.late + att.absent;
    var attRate = attTotal ? Math.round((att.present + att.late) / attTotal * 100) : 100;

    /* 进行中的签到 */
    var st = S.load();
    var myIds = enrolled.map(function (e) { return e.offeringId; });
    var live = st.sessions.filter(function (x) {
      return myIds.indexOf(x.offeringId) >= 0 && x.status === 'open' && S.parseDateTime(x.endTime) >= new Date();
    });

    /* 待办作业 */
    var todos = S.myAssignmentList(sid).filter(function (x) {
      return x.status === 'pending' || x.status === 'overdue';
    }).slice(0, 4);

    var h = '';
    h += '<div class="page-head"><h2>你好，' + esc(me.name) + '</h2>' +
         '<div class="sub">' + esc(S.load().term) + ' · ' + esc(me.className) + ' · 今天 ' + S.DAY_NAMES[today] + '</div></div>';

    /* 选课轮次提示 */
    var round = S.load().enrollRound;
    h += '<div class="alert alert-info mb16"><span class="ico">i</span><div>' +
         '本轮选课开放至 <b>' + esc(round.closeAt) + '</b>，剩余 <b>' + fmtLeft(S.parseDateTime(round.closeAt) - new Date()) + '</b>。' +
         '本学期学分上限 ' + maxCredit + ' 学分。</div></div>';

    if (live.length) {
      h += '<div class="alert alert-warn mb16"><span class="ico">!</span><div class="grow">' +
           '<b>正在签到：</b>' + live.map(function (x) {
             var v = S.offeringView(x.offeringId);
             return esc(v.course.name) + '（截止 ' + fmtLeft(S.parseDateTime(x.endTime) - new Date()) + '）';
           }).join('、') +
           '</div><button class="btn btn-sm btn-primary" data-act="goto" data-href="#/signin">去签到</button></div>';
    }

    h += '<div class="grid grid-4 mb16">' +
      '<div class="stat"><div class="stat-num">' + enrolled.length + '<span class="unit">门</span></div><div class="stat-label">已选课程</div></div>' +
      '<div class="stat"><div class="stat-num">' + credit + '<span class="unit">/ ' + maxCredit + '</span></div>' +
        '<div class="stat-label">已选学分</div><div class="bar mt8"><i style="width:' + Math.round(credit / maxCredit * 100) + '%"></i></div></div>' +
      '<div class="stat"><div class="stat-num ' + (hs.pending + hs.overdue > 0 ? 'warn' : 'ok') + '">' + (hs.pending + hs.overdue) + '<span class="unit">项</span></div>' +
        '<div class="stat-label">待完成作业</div></div>' +
      '<div class="stat"><div class="stat-num ' + (attRate >= 90 ? 'ok' : 'warn') + '">' + attRate + '<span class="unit">%</span></div>' +
        '<div class="stat-label">出勤率（' + attTotal + ' 次记录）</div></div>' +
    '</div>';

    h += '<div class="grid grid-2">';

    /* 今日课程 */
    h += '<div class="card"><div class="card-head"><div><h3>今日课程</h3>' +
         '<div class="sub">' + S.DAY_NAMES[today] + ' · 共 ' + todayItems.length + ' 个时段</div></div>' +
         '<button class="btn btn-sm btn-ghost" data-act="goto" data-href="#/schedule">查看完整课表</button></div>' +
         '<div class="card-body flush">';
    if (!todayItems.length) {
      h += '<div class="empty"><div class="big">—</div>今天没有课，安排点自习吧</div>';
    } else {
      h += '<div class="list">';
      todayItems.forEach(function (x) {
        h += '<div class="list-item clickable" data-act="goto" data-href="#/classroom/' + x.offeringId + '">' +
          '<div class="li-ico">' + esc(S.periodText(x.start, x.end).replace('第 ', '').replace(' 节', '')) + '</div>' +
          '<div class="grow"><div class="li-title">' + esc(x.course.name) + '</div>' +
          '<div class="li-sub">' + esc(x.teacher ? x.teacher.name : '') + ' · ' + esc(x.room) +
          (x.conflict ? ' <span class="badge badge-danger">时间冲突</span>' : '') + '</div></div>' +
          '<div class="li-time">' + esc(S.periodText(x.start, x.end)) + '</div></div>';
      });
      h += '</div>';
    }
    h += '</div></div>';

    /* 待办作业 */
    h += '<div class="card"><div class="card-head"><div><h3>待办作业</h3>' +
         '<div class="sub">按截止时间排序</div></div>' +
         '<button class="btn btn-sm btn-ghost" data-act="goto" data-href="#/homework">全部作业</button></div>' +
         '<div class="card-body flush">';
    if (!todos.length) {
      h += '<div class="empty"><div class="big">✓</div>所有作业都已完成</div>';
    } else {
      h += '<div class="list">';
      todos.forEach(function (x) {
        var left = x.deadline - new Date();
        h += '<div class="list-item clickable" data-act="goto" data-href="#/homework/' + x.assignment.id + '">' +
          '<div class="li-ico ' + (left < 0 ? 'danger' : (left < 3 * 86400000 ? 'warn' : '')) + '">作</div>' +
          '<div class="grow"><div class="li-title">' + esc(x.assignment.title) + '</div>' +
          '<div class="li-sub">' + esc(x.course ? x.course.name : '') + '</div></div>' +
          '<div style="text-align:right">' + hwStatusBadge(x.status) +
          '<div class="li-time mt8">' + (left < 0 ? '已过期 ' + fmtLeft(-left) : '还剩 ' + fmtLeft(left)) + '</div></div></div>';
      });
      h += '</div>';
    }
    h += '</div></div></div>';

    return h;
  }

  /* ---------- 课程广场 ---------- */
  function courses() {
    var ui = global.App.ui;
    var me = S.currentUser();
    var sid = me.id;
    var list = S.listOfferings({ cat: ui.courseCat === 'all' ? null : ui.courseCat, keyword: ui.keyword });

    var h = '';
    h += '<div class="page-head row-between wrap">' +
         '<div><h2>课程广场</h2><div class="sub">共 ' + list.length + ' 个教学班 · 点卡片看详情</div></div>' +
         '<div class="search"><span class="dim">搜</span><input id="course-search" placeholder="课程名 / 代码 / 教师" value="' + esc(ui.keyword) + '"></div>' +
         '</div>';

    h += '<div class="row wrap mb16"><div class="seg">' +
         '<button class="seg-item ' + (ui.courseCat === 'all' ? 'active' : '') + '" data-act="cat" data-cat="all">全部</button>';
    global.SEED.categories.forEach(function (c) {
      h += '<button class="seg-item ' + (ui.courseCat === c.id ? 'active' : '') + '" data-act="cat" data-cat="' + c.id + '">' + esc(c.name) + '</button>';
    });
    h += '</div></div>';

    if (!list.length) {
      h += '<div class="card"><div class="empty"><div class="big">—</div>没有匹配的课程，换个关键词试试</div></div>';
      return h;
    }

    h += '<div class="grid grid-cards">';
    list.forEach(function (v) {
      var enrolled = S.isEnrolled(sid, v.id);
      var wlOrder = S.waitlistOrderOf(sid, v.id);
      var wlCount = S.waitlistCount(v.id);
      var cf = (enrolled || wlOrder) ? null : S.findConflict(sid, v.id);
      h += '<div class="card course-card">' +
        '<div class="course-top">' +
          '<div class="row-between"><span class="badge">' + esc(v.category.name) + '</span>' +
            '<span class="course-code">' + esc(v.course.code) + '</span></div>' +
          '<div class="course-name mt8">' + esc(v.course.name) + '</div>' +
          '<div class="course-meta">' +
            '<div><span class="k">教师</span> ' + esc(v.teacher ? v.teacher.name + ' · ' + v.teacher.title : '—') + '</div>' +
            '<div><span class="k">学分</span> ' + v.course.credit + ' 学分 / ' + v.course.hours + ' 学时 · ' + esc(v.course.type) + '</div>' +
            '<div><span class="k">时间</span> ' + esc(v.slotLabel) + '</div>' +
          '</div>' +
          (wlOrder ? '<div class="mt8"><span class="badge badge-purple">候补第 ' + wlOrder + ' 位</span></div>' : '') +
          (cf ? '<div class="mt8"><span class="badge badge-danger">与《' + esc(cf.course.name) + '》冲突</span></div>' : '') +
        '</div>' +
        '<div class="course-foot">' +
          '<div class="row-between mb8"><span class="small muted">已选 ' + v.offering.selectedCount + ' / ' + v.offering.capacity + '</span>' +
            (v.full ? '<span class="small" style="color:var(--danger)">已满' +
                        (wlCount ? ' · 候补 ' + wlCount + ' 人' : '') + '</span>'
                    : '<span class="small dim">余 ' + v.left + ' 个名额</span>') + '</div>' +
          capBar(v) +
          '<div class="btn-row mt12">' +
            '<button class="btn btn-sm grow" data-act="goto" data-href="#/course/' + v.id + '">详情</button>' +
            enrollBtn(v, enrolled, wlOrder, wlCount) +
          '</div>' +
        '</div></div>';
    });
    h += '</div>';
    return h;
  }

  /* ---------- 课程详情 ---------- */
  function courseDetail(offeringId) {
    var v = S.offeringView(offeringId);
    if (!v) return '<div class="card"><div class="empty">课程不存在</div></div>';
    var me = S.currentUser();
    var enrolled = S.isEnrolled(me.id, v.id);
    var wlOrder = S.waitlistOrderOf(me.id, v.id);
    var wlCount = S.waitlistCount(v.id);
    var wlList = S.waitlistOf(v.id).slice(0, 5);
    var cf = (enrolled || wlOrder) ? null : S.findConflict(me.id, v.id);
    var credit = S.selectedCredit(me.id);
    var over = credit + v.course.credit > S.load().maxCredit;

    var h = '';
    h += '<button class="btn btn-sm btn-ghost mb16" data-act="goto" data-href="#/courses">← 返回课程广场</button>';
    h += '<div class="grid grid-2">';

    h += '<div class="card"><div class="card-head"><div><h3>' + esc(v.course.name) + '</h3>' +
         '<div class="sub mono">' + esc(v.course.code) + ' · ' + esc(v.category.name) + '</div></div>' +
         (enrolled ? '<span class="badge badge-ok">已选</span>' : '') + '</div>' +
      '<div class="card-body">' +
        '<p class="muted">' + esc(v.course.intro) + '</p>' +
        '<table class="table mt16">' +
          '<tbody>' +
          '<tr><td class="dim" style="width:88px">开课教师</td><td>' + esc(v.teacher ? v.teacher.name + ' · ' + v.teacher.title + ' · ' + v.teacher.dept : '—') + '</td></tr>' +
          '<tr><td class="dim">学分学时</td><td>' + v.course.credit + ' 学分 / ' + v.course.hours + ' 学时 · ' + esc(v.course.type) + '</td></tr>' +
          '<tr><td class="dim">上课时间</td><td>' + v.schedules.map(function (s) {
            return esc(S.slotText(s) + '　' + s.room + '　第 ' + s.weekStart + '-' + s.weekEnd + ' 周');
          }).join('<br>') + '</td></tr>' +
          '<tr><td class="dim">教学班号</td><td class="mono">' + esc(v.id) + '</td></tr>' +
          '</tbody></table>' +
      '</div></div>';

    h += '<div>';
    h += '<div class="card"><div class="card-head"><h3>选课名额</h3></div><div class="card-body">' +
      '<div class="row-between mb8"><span class="muted small">已选 / 容量</span>' +
      '<span><b style="font-size:19px">' + v.offering.selectedCount + '</b> <span class="dim">/ ' + v.offering.capacity + '</span></span></div>' +
      capBar(v) +
      '<div class="mt12 small dim">' + (v.full
          ? '名额已满' + (wlCount ? '，候补队列 ' + wlCount + ' 人' : '，可加入候补')
          : '剩余 ' + v.left + ' 个名额') + '</div>' +
      '<div class="mt16">' +
        (enrolled
          ? '<button class="btn btn-danger btn-block" data-act="drop" data-id="' + v.id + '">退课</button>'
          : (wlOrder
              ? '<button class="btn btn-block" disabled>候补中 · 第 ' + wlOrder + ' 位</button>' +
                '<button class="btn btn-ghost btn-block mt8" data-act="drop-waitlist" data-id="' + v.id + '">放弃候补</button>'
              : (v.full
                  ? '<button class="btn btn-warn btn-block" data-act="waitlist" data-id="' + v.id + '">加入候补队列</button>'
                  : '<button class="btn btn-primary btn-block" data-act="enroll" data-id="' + v.id + '">确认选课</button>'))) +
      '</div>' +
      (wlList.length
        ? '<div class="mt16"><div class="small muted mb8">候补队列（前 ' + wlList.length + ' 位）</div>' +
          wlList.map(function (e, i) {
            var st = S.getStudent(e.studentId);
            var mine = e.studentId === me.id;
            return '<div class="row-between small" style="padding:3px 0' + (mine ? ';color:var(--primary);font-weight:600' : '') + '">' +
                   '<span>' + (i + 1) + '. ' + esc(st.name) + (mine ? '（我）' : '') + '</span>' +
                   '<span class="dim">' + esc(String(e.selectTime || '').slice(5, 16)) + '</span></div>';
          }).join('') +
          '</div>'
        : '') +
      '</div></div>';

    if (enrolled) {
      h += '<div class="alert alert-ok mt16"><span class="ico">✓</span><div>你已选中该教学班，可在「我的课表」查看。</div></div>';
    } else if (wlOrder) {
      h += '<div class="alert alert-info mt16"><span class="ico">i</span><div>' +
           '<b>你在候补队列第 ' + wlOrder + ' 位</b><br>有同学退课时，系统会按顺序自动为你递补，无需手动操作。' +
           '递补成功后会推送消息通知你。</div></div>';
    } else if (cf) {
      h += '<div class="alert alert-danger mt16"><span class="ico">!</span><div>' +
           '<b>时间冲突</b><br>本课 ' + esc(cf.targetSlot) + ' 与已选《' + esc(cf.course.name) + '》的 ' + esc(cf.otherSlot) + ' 冲突，无法选中。</div></div>';
    } else if (over) {
      h += '<div class="alert alert-danger mt16"><span class="ico">!</span><div>超出学分上限（已选 ' + credit + ' + 本课 ' + v.course.credit + ' > ' + S.load().maxCredit + '）</div></div>';
    } else if (v.full) {
      h += '<div class="alert alert-warn mt16"><span class="ico">!</span><div>' +
           '名额已满，无法直接选中。加入候补后，一旦有人退课，系统会按队列顺序自动递补。</div></div>';
    } else {
      h += '<div class="alert alert-info mt16"><span class="ico">i</span><div>校验通过：无时间冲突，学分余量充足，可以选课。</div></div>';
    }

    h += '</div></div>';
    return h;
  }

  /* ---------- 我的课表 ---------- */
  function schedule() {
    var me = S.currentUser();
    var items = S.scheduleOf(me.id);
    var conflicts = items.filter(function (x) { return x.conflict; });

    var h = '';
    h += '<div class="page-head row-between wrap"><div><h2>我的课表</h2>' +
         '<div class="sub">' + esc(S.load().term) + ' · 第 1-' + S.load().weeks + ' 周 · 共 ' + items.length + ' 个时段</div></div>' +
         '<button class="btn btn-sm" data-act="print">打印 / 导出</button></div>';

    if (conflicts.length) {
      h += '<div class="alert alert-danger mb16"><span class="ico">!</span><div>' +
           '<b>检测到 ' + conflicts.length + ' 个时间冲突时段</b>：' +
           conflicts.map(function (x) { return esc(x.course.name) + '（' + esc(x.slotLabel) + '）'; }).join('、') +
           '　—　请尽快退掉其中一门。</div></div>';
    }

    h += '<div class="card"><div class="card-body tight">';
    h += '<div class="timetable">';
    /* 表头 */
    h += '<div class="tt-h">节次</div>';
    for (var d = 1; d <= 7; d++) h += '<div class="tt-h">' + S.DAY_NAMES[d] + '</div>';

    /* 每个节次的空底格 */
    for (var p = 1; p <= 12; p++) {
      h += '<div class="tt-p" style="grid-row:' + (p + 1) + ';grid-column:1">' + p + '</div>';
      for (var dd = 1; dd <= 7; dd++) {
        h += '<div class="tt-cell" style="grid-row:' + (p + 1) + ';grid-column:' + (dd + 1) + '"></div>';
      }
    }
    /* 课程块 */
    items.forEach(function (x) {
      var span = x.end - x.start + 1;
      h += '<div class="tt-block' + (x.conflict ? ' conflict' : '') + '" ' +
           'style="grid-row:' + (x.start + 1) + '/span ' + span + ';grid-column:' + (x.day + 1) + '" ' +
           'data-act="goto" data-href="#/classroom/' + x.offeringId + '" title="' + esc(x.course.name + ' · ' + x.teacher.name + ' · ' + x.room) + '">' +
           '<div class="n">' + esc(x.course.name) + '</div>' +
           '<div class="r">' + esc(x.room) + (x.weekType !== 'all' ? ' · ' + S.WEEK_TYPE_LABEL[x.weekType] : '') + '</div></div>';
    });
    h += '</div>';

    h += '<div class="row wrap mt16 small muted" style="gap:16px">' +
         '<span><span class="badge badge-info">蓝</span> 正常课程</span>' +
         '<span><span class="badge badge-danger">红</span> 时间冲突</span>' +
         '<span>节次 1-4 上午 · 5-8 下午 · 9-12 晚上</span></div>';
    h += '</div></div>';
    return h;
  }

  /* ---------- 我的课程 ---------- */
  function myCourses() {
    var me = S.currentUser();
    var list = S.myEnrollments(me.id).map(function (e) { return S.offeringView(e.offeringId); }).filter(Boolean);
    var wl = S.myWaitlist(me.id);
    var credit = S.selectedCredit(me.id);

    var h = '';
    h += '<div class="page-head"><h2>我的课程</h2><div class="sub">已选 ' + list.length + ' 门 · ' + credit + ' 学分' +
         (wl.length ? ' · 候补 ' + wl.length + ' 门' : '') + '</div></div>';
    if (!list.length) {
      h += '<div class="card"><div class="empty"><div class="big">—</div>还没有选课，去课程广场逛逛' +
           '<div class="mt16"><button class="btn btn-primary" data-act="goto" data-href="#/courses">去选课</button></div></div></div>';
    } else {

    h += '<div class="grid grid-cards">';
    list.forEach(function (v) {
      var live = S.activeSessionOf(v.id);
      var hw = S.myAssignmentList(me.id).filter(function (x) { return x.assignment.offeringId === v.id; });
      var todo = hw.filter(function (x) { return x.status === 'pending' || x.status === 'overdue'; }).length;
      h += '<div class="card course-card">' +
        '<div class="course-top">' +
          '<div class="row-between"><span class="badge">' + esc(v.category.name) + '</span>' +
          (live ? '<span class="badge badge-warn">签到进行中</span>' : '<span class="badge badge-ok">已选</span>') + '</div>' +
          '<div class="course-name mt8">' + esc(v.course.name) + '</div>' +
          '<div class="course-meta">' +
            '<div><span class="k">教师</span> ' + esc(v.teacher ? v.teacher.name : '—') + '</div>' +
            '<div><span class="k">时间</span> ' + esc(v.slotLabel) + '</div>' +
            '<div><span class="k">作业</span> ' + hw.length + ' 项' + (todo ? ' · <span style="color:var(--warn)">待交 ' + todo + '</span>' : '') + '</div>' +
          '</div></div>' +
        '<div class="course-foot"><div class="btn-row">' +
          '<button class="btn btn-sm btn-primary grow" data-act="goto" data-href="#/classroom/' + v.id + '">进入课程</button>' +
          '<button class="btn btn-sm btn-danger" data-act="drop" data-id="' + v.id + '">退课</button>' +
        '</div></div></div>';
    });
    h += '</div>';
    }

    if (wl.length) {
      h += '<div class="card mt16"><div class="card-head"><div><h3>候补中的课程</h3>' +
           '<div class="sub">有人退课时系统会按队列顺序自动为你递补</div></div>' +
           '<span class="badge badge-purple">' + wl.length + ' 门</span></div><div class="card-body flush">' +
           '<div class="list">';
      wl.forEach(function (x) {
        var v = x.view;
        h += '<div class="list-item">' +
          '<div class="li-ico" style="background:var(--purple-50);color:var(--purple)">候</div>' +
          '<div class="grow"><div class="li-title">' + esc(v.course.name) + '</div>' +
          '<div class="li-sub">' + esc(v.slotLabel) + ' · ' + v.course.credit + ' 学分 · ' + esc(v.teacher ? v.teacher.name : '') + '</div>' +
          '<div class="small mt8">排在第 <b style="color:var(--purple)">' + x.order + '</b> 位 / 共 ' + x.total + ' 人' +
          '　<span class="dim">加入于 ' + esc(String(x.selectTime || '').slice(5, 16)) + '</span></div></div>' +
          '<div class="btn-row"><button class="btn btn-sm" data-act="goto" data-href="#/course/' + v.id + '">查看</button>' +
          '<button class="btn btn-sm btn-danger" data-act="drop-waitlist" data-id="' + v.id + '">放弃</button></div>' +
        '</div>';
      });
      h += '</div></div></div>';
    }

    return h;
  }

  /* ---------- 课程主页 ---------- */
  function classroom(offeringId) {
    var v = S.offeringView(offeringId);
    if (!v) return '<div class="card"><div class="empty">课程不存在</div></div>';
    var ui = global.App.ui;
    var me = S.currentUser();
    var tab = ui.classTab || 'signin';
    var enrolled = S.isEnrolled(me.id, v.id);

    var h = '';
    h += '<button class="btn btn-sm btn-ghost mb16" data-act="goto" data-href="#/my">← 返回我的课程</button>';
    h += '<div class="card mb16"><div class="card-body">' +
      '<div class="row-between wrap"><div>' +
        '<div class="row" style="gap:10px"><span class="badge">' + esc(v.category.name) + '</span>' +
        '<span class="course-code">' + esc(v.course.code) + '</span></div>' +
        '<h2 style="font-size:19px;margin-top:6px">' + esc(v.course.name) + '</h2>' +
        '<div class="small muted mt8">' + esc(v.teacher ? v.teacher.name + ' · ' + v.teacher.title : '') + '　|　' +
        esc(v.slotLabel) + '　|　' + v.course.credit + ' 学分</div>' +
      '</div><div class="row">' +
        '<button class="btn btn-sm" data-act="goto" data-href="#/course/' + v.id + '">课程详情</button>' +
        (enrolled ? '<button class="btn btn-sm btn-danger" data-act="drop" data-id="' + v.id + '">退课</button>' : '') +
      '</div></div>' +
    '</div></div>';

    h += '<div class="tabs">' +
      '<button class="tab ' + (tab === 'signin' ? 'active' : '') + '" data-act="ctab" data-tab="signin">签到</button>' +
      '<button class="tab ' + (tab === 'hw' ? 'active' : '') + '" data-act="ctab" data-tab="hw">作业</button>' +
      '<button class="tab ' + (tab === 'roster' ? 'active' : '') + '" data-act="ctab" data-tab="roster">名单与出勤</button>' +
      '<button class="tab ' + (tab === 'msg' ? 'active' : '') + '" data-act="ctab" data-tab="msg">公告</button>' +
      '</div>';

    if (tab === 'signin') h += classroomSignin(v, me);
    else if (tab === 'hw') h += classroomHw(v, me);
    else if (tab === 'roster') h += classroomRoster(v);
    else h += classroomMsg(v);

    return h;
  }

  function classroomSignin(v, me) {
    var live = S.activeSessionOf(v.id);
    var st = S.load();
    var mine = st.sessions.filter(function (x) { return x.offeringId === v.id; });
    var h = '';

    if (live) {
      var left = S.parseDateTime(live.endTime) - new Date();
      h += '<div class="alert alert-warn mb16"><span class="ico">!</span><div class="grow">' +
           '<b>教师正在发起签到</b>，剩余 ' + fmtLeft(left) + '。请到「签到」页面输入签到码。</div>' +
           '<button class="btn btn-sm btn-primary" data-act="goto" data-href="#/signin">立即签到</button></div>';
    }

    h += '<div class="card"><div class="card-head"><div><h3>本课签到记录</h3>' +
         '<div class="sub">共 ' + mine.length + ' 次</div></div></div><div class="card-body flush">';
    if (!mine.length) {
      h += '<div class="empty">还没有签到记录</div>';
    } else {
      h += '<table class="table"><thead><tr><th>时间</th><th>状态</th><th>签到时间</th></tr></thead><tbody>';
      mine.slice().reverse().forEach(function (sess) {
        var r = null;
        sess.records.forEach(function (x) { if (x.studentId === me.id) r = x; });
        var label = r ? (r.status === 'present' ? '<span class="badge badge-ok">出勤</span>' : '<span class="badge badge-warn">迟到</span>')
                      : (sess.status === 'open' ? '<span class="badge badge-info">进行中</span>' : '<span class="badge badge-danger">缺勤</span>');
        h += '<tr><td>' + esc(S.fmtDate(sess.startTime)) + ' ' + esc(S.fmtTime(sess.startTime)) + ' - ' + esc(S.fmtTime(sess.endTime)) + '</td>' +
             '<td>' + label + '</td><td>' + (r ? esc(S.fmtTime(r.checkTime)) : '—') + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '</div></div>';
    return h;
  }

  function classroomHw(v, me) {
    var list = S.myAssignmentList(me.id).filter(function (x) { return x.assignment.offeringId === v.id; });
    var h = '<div class="card"><div class="card-head"><div><h3>课程作业</h3>' +
            '<div class="sub">共 ' + list.length + ' 项</div></div></div><div class="card-body flush">';
    if (!list.length) {
      h += '<div class="empty">本课程还没有布置作业</div>';
    } else {
      h += '<div class="list">';
      list.forEach(function (x) {
        var left = x.deadline - new Date();
        h += '<div class="list-item clickable" data-act="goto" data-href="#/homework/' + x.assignment.id + '">' +
          '<div class="li-ico">作</div><div class="grow">' +
          '<div class="li-title">' + esc(x.assignment.title) + '</div>' +
          '<div class="li-sub">截止 ' + esc(x.assignment.deadline) + ' · 满分 ' + x.assignment.fullScore +
          (x.assignment.allowLate ? ' · 允许迟交' : ' · 不允许迟交') + '</div></div>' +
          '<div style="text-align:right">' + hwStatusBadge(x.status) +
          (x.status === 'graded' ? '<div class="li-time mt8">' + x.submission.score + ' 分</div>'
            : '<div class="li-time mt8">' + (left < 0 ? '已过期' : fmtLeft(left)) + '</div>') +
          '</div></div>';
      });
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  function classroomRoster(v) {
    var roster = S.rosterOf(v.id);
    var att = attendanceOfOffering(v.id);
    var h = '<div class="card"><div class="card-head"><div><h3>选课名单</h3>' +
            '<div class="sub">' + roster.length + ' 人 · 已进行 ' + att.sessions + ' 次签到</div></div></div>' +
            '<div class="card-body flush"><table class="table"><thead><tr>' +
            '<th style="width:110px">学号</th><th>姓名</th><th>班级</th><th>专业</th><th class="num">出勤</th><th class="num">迟到</th><th class="num">缺勤</th>' +
            '</tr></thead><tbody>';
    roster.forEach(function (r) {
      var a = att.map[r.studentId] || { present: 0, late: 0 };
      var absent = Math.max(0, att.sessions - a.present - a.late);
      h += '<tr><td class="mono small">' + esc(r.studentId) + '</td><td>' + esc(r.name) + '</td>' +
           '<td class="small muted">' + esc(r.className) + '</td><td class="small muted">' + esc(r.major) + '</td>' +
           '<td class="num">' + a.present + '</td><td class="num">' + a.late + '</td>' +
           '<td class="num"' + (absent > 0 ? ' style="color:var(--danger)"' : '') + '>' + absent + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function classroomMsg(v) {
    var st = S.load();
    var list = st.messages.filter(function (m) { return m.type === 'course'; });
    var h = '<div class="card"><div class="card-head"><h3>课程公告</h3></div><div class="card-body flush">';
    if (!list.length) h += '<div class="empty">暂无公告</div>';
    else {
      h += '<div class="list">';
      list.forEach(function (m) {
        h += '<div class="list-item"><div class="li-ico">告</div><div class="grow">' +
             '<div class="li-title">' + esc(m.title) + '</div>' +
             '<div class="li-sub">' + esc(m.body) + '</div></div>' +
             '<div class="li-time">' + esc(m.time) + '</div></div>';
      });
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------- 签到 ---------- */
  function signin() {
    var me = S.currentUser();
    var st = S.load();
    var myIds = S.myEnrollments(me.id).map(function (e) { return e.offeringId; });
    var live = st.sessions.filter(function (x) {
      return myIds.indexOf(x.offeringId) >= 0 && x.status === 'open' && S.parseDateTime(x.endTime) >= new Date();
    });
    var att = S.attendanceStats(me.id);

    var h = '';
    h += '<div class="page-head"><h2>课程签到</h2><div class="sub">输入教师屏幕上显示的 6 位签到码</div></div>';

    h += '<div class="grid grid-4 mb16">' +
      '<div class="stat"><div class="stat-num ok">' + att.present + '</div><div class="stat-label">出勤</div></div>' +
      '<div class="stat"><div class="stat-num warn">' + att.late + '</div><div class="stat-label">迟到</div></div>' +
      '<div class="stat"><div class="stat-num danger">' + att.absent + '</div><div class="stat-label">缺勤</div></div>' +
      '<div class="stat"><div class="stat-num">' + att.total + '</div><div class="stat-label">总记录</div></div>' +
    '</div>';

    h += '<div class="grid grid-2">';

    /* 签到输入 */
    h += '<div class="card"><div class="card-head"><h3>输入签到码</h3></div><div class="card-body">';
    if (!live.length) {
      h += '<div class="alert alert-warn mb16"><span class="ico">!</span><div>' +
           '当前没有进行中的签到。<br>演示提示：切到左侧「教师端」发起一次签到，再回来输入。</div></div>';
    } else {
      h += '<div class="alert alert-ok mb16"><span class="ico">✓</span><div>' +
           live.map(function (x) {
             var v = S.offeringView(x.offeringId);
             return '<b>' + esc(v.course.name) + '</b> 正在签到，剩余 ' + fmtLeft(S.parseDateTime(x.endTime) - new Date());
           }).join('<br>') + '</div></div>';
    }
    h += '<div class="field"><input class="input input-code" id="signin-code" maxlength="6" inputmode="numeric" placeholder="······" autocomplete="off"></div>' +
      '<button class="btn btn-primary btn-lg btn-block" data-act="do-signin">提 交 签 到</button>' +
      '<div class="small dim mt12 center">签到码每 ' + S.CODE_TTL_SEC + ' 秒自动刷新，过期需重新输入</div>';

    /* 演示助手：把当前有效码直接露出来，避免演示时卡住 */
    if (live.length) {
      h += '<div class="alert alert-info mt16"><span class="ico">i</span><div>' +
           '<b>演示助手</b>（真实系统不显示）：当前有效码 ' +
           live.map(function (x) { return '<span class="mono" style="font-size:16px">' + esc(x.code) + '</span>'; }).join('、') +
           '　<button class="btn btn-sm btn-ghost" data-act="fill-code">一键填入</button></div></div>';
    }
    h += '</div></div>';

    /* 我的记录 */
    h += '<div class="card"><div class="card-head"><h3>我的签到记录</h3></div><div class="card-body flush">';
    var rows = [];
    st.sessions.forEach(function (sess) {
      if (myIds.indexOf(sess.offeringId) < 0) return;
      var v = S.offeringView(sess.offeringId);
      var r = null;
      sess.records.forEach(function (x) { if (x.studentId === me.id) r = x; });
      rows.push({ sess: sess, v: v, r: r });
    });
    rows.sort(function (a, b) { return S.parseDateTime(b.sess.startTime) - S.parseDateTime(a.sess.startTime); });
    if (!rows.length) h += '<div class="empty">暂无记录</div>';
    else {
      h += '<table class="table"><thead><tr><th>课程</th><th>签到时间</th><th>状态</th></tr></thead><tbody>';
      rows.forEach(function (x) {
        var label = x.r ? (x.r.status === 'present' ? '<span class="badge badge-ok">出勤</span>' : '<span class="badge badge-warn">迟到</span>')
                        : (x.sess.status === 'open' ? '<span class="badge badge-info">进行中</span>' : '<span class="badge badge-danger">缺勤</span>');
        h += '<tr><td>' + esc(x.v ? x.v.course.name : '—') + '<div class="small dim">' + esc(S.fmtDate(x.sess.startTime)) + '</div></td>' +
             '<td class="mono small">' + (x.r ? esc(S.fmtTime(x.r.checkTime)) : '—') + '</td><td>' + label + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '</div></div>';

    h += '</div>';
    return h;
  }

  /* ---------- 作业 ---------- */
  function homework() {
    var me = S.currentUser();
    var ui = global.App.ui;
    var all = S.myAssignmentList(me.id);
    var f = ui.hwFilter || 'all';
    var list = all.filter(function (x) {
      if (f === 'all') return true;
      if (f === 'todo') return x.status === 'pending' || x.status === 'overdue';
      if (f === 'done') return x.status === 'submitted' || x.status === 'graded';
      if (f === 'closed') return x.status === 'closed';
      return true;
    });
    var hs = S.homeworkStats(me.id);

    var h = '';
    h += '<div class="page-head"><h2>我的作业</h2><div class="sub">共 ' + all.length + ' 项 · 待完成 ' + (hs.pending + hs.overdue) + ' 项' +
         (hs.avgScore != null ? ' · 平均分 ' + hs.avgScore : '') + '</div></div>';
    h += '<div class="row wrap mb16"><div class="seg">' +
      '<button class="seg-item ' + (f === 'all' ? 'active' : '') + '" data-act="hwfilter" data-f="all">全部 ' + all.length + '</button>' +
      '<button class="seg-item ' + (f === 'todo' ? 'active' : '') + '" data-act="hwfilter" data-f="todo">待提交 ' + (hs.pending + hs.overdue) + '</button>' +
      '<button class="seg-item ' + (f === 'done' ? 'active' : '') + '" data-act="hwfilter" data-f="done">已完成 ' + (hs.submitted + hs.graded) + '</button>' +
      /* 「已截止未提交」既不是待提交也不是已完成，单独一档，
         否则四档加起来对不上「全部」，一眼就露馅 */
      (hs.closed ? '<button class="seg-item ' + (f === 'closed' ? 'active' : '') + '" data-act="hwfilter" data-f="closed">已截止 ' + hs.closed + '</button>' : '') +
      '</div></div>';

    if (!list.length) {
      h += '<div class="card"><div class="empty"><div class="big">—</div>这个分类下没有作业</div></div>';
      return h;
    }

    h += '<div class="card"><div class="card-body flush"><div class="list">';
    list.forEach(function (x) {
      var left = x.deadline - new Date();
      var urgent = left > 0 && left < 3 * 86400000;
      h += '<div class="list-item clickable" data-act="goto" data-href="#/homework/' + x.assignment.id + '">' +
        '<div class="li-ico ' + (x.status === 'graded' ? 'ok' : (left < 0 ? 'danger' : (urgent ? 'warn' : ''))) + '">' +
          (x.status === 'graded' ? '✓' : '作') + '</div>' +
        '<div class="grow"><div class="li-title">' + esc(x.assignment.title) + '</div>' +
        '<div class="li-sub">' + esc(x.course ? x.course.name : '') + ' · 截止 ' + esc(x.assignment.deadline) +
        ' · 满分 ' + x.assignment.fullScore + (x.assignment.allowLate ? '' : ' · <b>不允许迟交</b>') + '</div></div>' +
        '<div style="text-align:right;min-width:96px">' + hwStatusBadge(x.status) +
        (x.status === 'graded'
          ? '<div class="li-time mt8" style="font-weight:600;color:var(--ok)">' + x.submission.score + ' 分</div>'
          : '<div class="li-time mt8">' + (left < 0 ? '已过期' : '还剩 ' + fmtLeft(left)) + '</div>') +
        '</div></div>';
    });
    h += '</div></div></div>';
    return h;
  }

  function homeworkDetail(assignmentId) {
    var me = S.currentUser();
    var v = S.assignmentView(assignmentId);
    if (!v) return '<div class="card"><div class="empty">作业不存在</div></div>';
    var a = v.assignment;
    var mine = null;
    v.submissions.forEach(function (x) { if (x.studentId === me.id) mine = x; });
    var left = v.deadline - new Date();
    var locked = v.expired && !a.allowLate;

    var h = '';
    h += '<button class="btn btn-sm btn-ghost mb16" data-act="goto" data-href="#/homework">← 返回作业列表</button>';
    h += '<div class="grid grid-2">';

    h += '<div class="card"><div class="card-head"><div><h3>' + esc(a.title) + '</h3>' +
         '<div class="sub">' + esc(v.course ? v.course.name : '') + ' · ' + esc(v.teacher ? v.teacher.name : '') + '</div></div>' +
         (mine ? hwStatusBadge(mine.gradedAt ? 'graded' : 'submitted') : hwStatusBadge(v.expired ? (a.allowLate ? 'overdue' : 'closed') : 'pending')) +
         '</div><div class="card-body">' +
      '<p class="muted">' + esc(a.desc) + '</p>' +
      '<table class="table mt16"><tbody>' +
        '<tr><td class="dim" style="width:88px">发布时间</td><td>' + esc(a.publishAt) + '</td></tr>' +
        '<tr><td class="dim">截止时间</td><td><b>' + esc(a.deadline) + '</b>' +
          (v.expired ? ' <span class="badge badge-danger">已过期</span>' : ' <span class="badge badge-ok">还剩 ' + fmtLeft(left) + '</span>') + '</td></tr>' +
        '<tr><td class="dim">满分</td><td>' + a.fullScore + ' 分</td></tr>' +
        '<tr><td class="dim">迟交</td><td>' + (a.allowLate ? '允许迟交（会标记为迟交）' : '不允许迟交，逾期系统将拒绝提交') + '</td></tr>' +
      '</tbody></table></div></div>';

    h += '<div>';
    if (mine) {
      h += '<div class="card mb16"><div class="card-head"><h3>我的提交</h3>' +
        (mine.isLate ? '<span class="badge badge-warn">迟交</span>' : '<span class="badge badge-ok">按时提交</span>') + '</div>' +
        '<div class="card-body">' +
        '<div class="small dim">提交时间</div><div>' + esc(mine.submitTime) + '</div>' +
        '<div class="small dim mt12">内容</div><div>' + esc(mine.content || '（无）') + '</div>' +
        (mine.fileName ? '<div class="small dim mt12">附件</div><div>📎 ' + esc(mine.fileName) + ' <span class="dim small">' + fmtSize(mine.fileSize) + '</span></div>' : '') +
        (mine.gradedAt
          ? '<div class="alert alert-ok mt16"><span class="ico">✓</span><div><b>得分 ' + mine.score + ' / ' + a.fullScore + '</b>' +
            '<div class="small mt8">' + esc(mine.comment || '教师未填写评语') + '</div>' +
            '<div class="small dim mt8">批改于 ' + esc(mine.gradedAt) + '</div></div></div>'
          : '<div class="alert alert-info mt16"><span class="ico">i</span><div>已提交，等待教师批改。</div></div>') +
        '</div></div>';
    }

    h += '<div class="card"><div class="card-head"><h3>' + (mine ? '重新提交' : '提交作业') + '</h3></div><div class="card-body">';
    if (locked) {
      h += '<div class="alert alert-danger"><span class="ico">!</span><div>' +
           '<b>已超过截止时间</b>（' + esc(a.deadline) + '），该作业不允许迟交，系统已关闭提交入口。</div></div>';
    } else {
      if (v.expired) {
        h += '<div class="alert alert-warn mb16"><span class="ico">!</span><div>' +
             '已超过截止时间，本次提交将被标记为<b>迟交</b>。</div></div>';
      }
      if (mine) {
        h += '<div class="alert alert-warn mb16"><span class="ico">!</span><div>' +
             '重新提交会覆盖上次内容，并清除已有评分（需教师重新批改）。</div></div>';
      }
      h += '<div class="field"><label>作业内容 / 说明</label>' +
        '<textarea class="input" id="hw-content" placeholder="写点说明，或直接上传附件……">' + esc(mine ? mine.content : '') + '</textarea></div>' +
        '<div class="field"><label>附件（演示：仅记录文件名，不做真实上传）</label>' +
        '<input class="input" type="file" id="hw-file"></div>' +
        '<button class="btn btn-primary btn-block" data-act="do-submit" data-id="' + a.id + '">' +
        (mine ? '覆盖提交' : '提交作业') + '</button>';
    }
    h += '</div></div></div></div>';
    return h;
  }

  /* ---------- 消息 ---------- */
  function messages() {
    var st = S.load();
    var list = st.messages.slice().sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    var unread = list.filter(function (m) { return !m.read; }).length;
    var ico = { system: '系', course: '课', homework: '作', grade: '分' };

    var h = '';
    h += '<div class="page-head row-between wrap"><div><h2>消息通知</h2>' +
         '<div class="sub">' + unread + ' 条未读</div></div>' +
         '<button class="btn btn-sm" data-act="read-all">全部标为已读</button></div>';
    h += '<div class="card"><div class="card-body flush"><div class="list">';
    list.forEach(function (m) {
      h += '<div class="list-item clickable" data-act="read-msg" data-id="' + m.id + '">' +
        '<div class="li-ico ' + (m.type === 'homework' ? 'warn' : (m.type === 'grade' ? 'ok' : '')) + '">' + (ico[m.type] || '信') + '</div>' +
        '<div class="grow"><div class="li-title">' + esc(m.title) + '</div>' +
        '<div class="li-sub">' + esc(m.body) + '</div></div>' +
        '<div style="text-align:right"><div class="li-time">' + esc(m.time) + '</div>' +
        (m.read ? '' : '<div class="unread-dot" style="margin-left:auto;margin-top:8px"></div>') + '</div></div>';
    });
    h += '</div></div></div>';
    return h;
  }

  /* ---------- 个人中心 ---------- */
  function profile() {
    var me = S.currentUser();
    var sid = me.id;
    var credit = S.selectedCredit(sid);
    var maxCredit = S.load().maxCredit;
    var att = S.attendanceStats(sid);
    var hs = S.homeworkStats(sid);
    var attTotal = att.present + att.late + att.absent || 1;

    var h = '';
    h += '<div class="page-head"><h2>个人中心</h2><div class="sub">' + esc(S.load().term) + '</div></div>';

    h += '<div class="grid grid-2 mb16">';
    h += '<div class="card"><div class="card-head"><h3>基本信息</h3></div><div class="card-body">' +
      '<div class="row" style="gap:14px"><div class="avatar" style="width:52px;height:52px;font-size:20px">' + esc(me.name.slice(0, 1)) + '</div>' +
      '<div><div style="font-size:17px;font-weight:600">' + esc(me.name) + '</div>' +
      '<div class="small muted">' + esc(me.id) + ' · ' + esc(me.className) + '</div></div></div>' +
      '<table class="table mt16"><tbody>' +
        '<tr><td class="dim" style="width:88px">专业</td><td>' + esc(me.major) + '</td></tr>' +
        '<tr><td class="dim">年级</td><td>' + esc(me.grade) + ' 级</td></tr>' +
        '<tr><td class="dim">已修学分</td><td>' + me.earnedCredit + ' 学分（不含本学期）</td></tr>' +
        '<tr><td class="dim">本学期</td><td>' + credit + ' / ' + maxCredit + ' 学分</td></tr>' +
      '</tbody></table></div></div>';

    h += '<div class="card"><div class="card-head"><h3>本学期数据</h3></div><div class="card-body">' +
      '<div class="small muted">学分进度</div>' +
      '<div class="bar mt8"><i style="width:' + Math.round(credit / maxCredit * 100) + '%"></i></div>' +
      '<div class="small dim mt8">' + credit + ' / ' + maxCredit + ' 学分</div>' +
      '<div class="small muted mt16">出勤构成（共 ' + att.total + ' 次）</div>' +
      '<div class="bar mt8" style="display:flex;height:8px;background:none;gap:2px">' +
        '<i class="ok" style="width:' + (att.present / attTotal * 100) + '%"></i>' +
        '<i class="warn" style="width:' + (att.late / attTotal * 100) + '%"></i>' +
        '<i class="danger" style="width:' + (att.absent / attTotal * 100) + '%"></i>' +
      '</div>' +
      '<div class="row mt8 small muted" style="gap:14px">' +
        '<span><span class="badge badge-ok">出勤 ' + att.present + '</span></span>' +
        '<span><span class="badge badge-warn">迟到 ' + att.late + '</span></span>' +
        '<span><span class="badge badge-danger">缺勤 ' + att.absent + '</span></span></div>' +
      '<div class="small muted mt16">作业完成</div>' +
      '<div class="bar mt8"><i class="' + (hs.pending + hs.overdue ? 'warn' : 'ok') + '" style="width:' +
        Math.round((hs.submitted + hs.graded) / (hs.total || 1) * 100) + '%"></i></div>' +
      '<div class="small dim mt8">已交 ' + (hs.submitted + hs.graded) + ' / ' + hs.total + ' 项' +
        (hs.avgScore != null ? ' · 平均分 ' + hs.avgScore : '') + '</div>' +
    '</div></div>';
    h += '</div>';

    h += '<div class="card"><div class="card-head"><h3>演示数据</h3></div><div class="card-body">' +
      '<div class="row-between wrap"><div class="small muted grow">所有数据保存在浏览器 localStorage。' +
      '演示出错或想重新开始时，点右侧重置（会清空选课、签到、作业记录）。</div>' +
      '<div class="btn-row"><button class="btn btn-sm" data-act="logout">退出登录</button>' +
      '<button class="btn btn-sm btn-danger" data-act="reset">重置演示数据</button></div></div>' +
    '</div></div>';
    return h;
  }

  /* ---------- 教师端 ---------- */
  /* ---------- AI 批改建议面板 ----------
     只在教师点「AI 建议」时展开。刻意做成"建议"而不是"结果"：
     面板里没有任何写入动作，采纳要教师自己点，落库还要再点一次保存。 */
  var AI_CONF = {
    high: { label: '证据充分', cls: 'badge-ok' },
    mid:  { label: '证据一般', cls: 'badge-info' },
    low:  { label: '证据不足', cls: 'badge-warn' }
  };

  function aiSuggestPanel(sub) {
    var G = global.Grading;
    if (!G) return '<div class="small muted">评分助手未加载（assets/grading.js）。</div>';

    var r = G.suggest(sub.id);
    if (!r.ok) return '<div class="small muted">' + esc(r.reason) + '</div>';

    var conf = AI_CONF[r.confidence] || AI_CONF.mid;
    var h = '<div class="ai-sug">';

    /* 头部：分数 + 置信度 + 操作 */
    h += '<div class="row-between wrap" style="gap:12px;align-items:flex-start">' +
      '<div><div class="small muted">AI 批改建议 · 按评分细则逐项核对，不是随机估分</div>' +
        '<div class="row" style="gap:10px;align-items:baseline;margin-top:6px">' +
          '<span class="ai-score">' + r.suggested + '<span class="unit">分</span></span>' +
          '<span class="badge ' + conf.cls + '">' + conf.label + '</span>' +
          '<span class="small dim">内容 ' + r.evidence.chars + ' 字 / 期望 ' + r.evidence.required + ' 字</span>' +
        '</div></div>' +
      '<div class="row" style="gap:6px">' +
        '<button class="btn btn-sm btn-primary" data-act="ai-adopt" data-id="' + sub.id + '">采纳并填入</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="ai-suggest" data-id="' + sub.id + '">收起</button>' +
      '</div></div>';

    /* 分项：每项列出命中了什么、漏了什么 */
    h += '<div class="ai-sug-dims">';
    r.dimensions.forEach(function (d) {
      h += '<div class="ai-sug-dim">' +
        '<div class="ai-sug-head"><span>' + esc(d.label) + '</span>' +
          '<b class="' + (d.rate >= .8 ? 'ok' : (d.rate > 0 ? '' : 'bad')) + '">' +
          d.score + ' / ' + d.max + '</b></div>' +
        '<div class="ai-sug-checks">' +
          d.checks.map(function (c) {
            return '<span class="chk ' + (c.hit ? 'hit' : 'miss') + '">' +
              (c.hit ? '✓' : '✗') + ' ' + esc(c.detail) + '</span>';
          }).join('') +
        '</div></div>';
    });
    h += '</div>';

    /* 提醒项 */
    if (r.flags.length) {
      h += '<div class="ai-sug-flags">' + r.flags.map(function (f) {
        return '<div>⚠ ' + esc(f) + '</div>';
      }).join('') + '</div>';
    }

    /* 评语草稿 */
    h += '<div class="ai-sug-draft"><div class="small muted mb8">评语草稿（采纳后仍可修改）</div>' +
      '<div class="ai-draft-text">' + esc(r.draftComment) + '</div></div>';

    h += '<div class="small dim mt12">AI 不会直接写入成绩。点「采纳并填入」只是把分数和评语填进上面的输入框，' +
      '核对无误后再点「保存」才真正落库。</div>';

    h += '</div>';
    return h;
  }

  function teacher() {
    var ui = global.App.ui;
    var offeringId = ui.teacherOffering || 'DAR201-01';
    var v = S.offeringView(offeringId);
    var myOfferings = S.listOfferings({}).filter(function (x) {
      return x.teacher && (x.teacher.id === 'T01' || x.teacher.id === 'T02');
    });

    var h = '';
    h += '<div class="page-head row-between wrap"><div><h2>教师端（演示）</h2>' +
         '<div class="sub">发起签到 · 实时看板 · 作业批改</div></div>' +
         '<select class="input" style="width:auto" id="teacher-offering">' +
         myOfferings.map(function (x) {
           return '<option value="' + x.id + '"' + (x.id === offeringId ? ' selected' : '') + '>' +
                  esc(x.course.name + '（' + x.id + '）') + '</option>';
         }).join('') + '</select></div>';

    if (!v) return h + '<div class="card"><div class="empty">请选择课程</div></div>';

    var live = S.activeSessionOf(v.id);
    var st = S.load();
    var sessions = st.sessions.filter(function (x) { return x.offeringId === v.id; });
    var latest = sessions.length ? sessions[sessions.length - 1] : null;

    h += '<div class="grid grid-2">';

    /* 发起签到 */
    h += '<div class="card"><div class="card-head"><div><h3>课堂签到</h3>' +
         '<div class="sub">' + esc(v.course.name) + ' · 已选 ' + v.offering.selectedCount + ' 人</div></div>' +
         (live ? '<span class="badge badge-warn">进行中</span>' : '<span class="badge">未开始</span>') + '</div>' +
      '<div class="card-body">';

    if (live) {
      h += '<div class="code-box"><div class="small muted mb8">签到码（每 ' + S.CODE_TTL_SEC + ' 秒自动刷新）</div>' +
        '<div class="code-digits" id="live-code">' + esc(live.code) + '</div>' +
        '<div class="ring"><i id="code-ring" style="width:100%"></i></div>' +
        '<div class="small dim mt12">签到窗口至 ' + esc(S.fmtTime(live.endTime)) + '，剩余 <b id="live-left">' +
          fmtLeft(S.parseDateTime(live.endTime) - new Date()) + '</b></div>' +
        '<div class="btn-row mt16" style="justify-content:center">' +
          '<button class="btn btn-sm" data-act="refresh-code">手动换码</button>' +
          '<button class="btn btn-sm btn-danger" data-act="close-session" data-id="' + live.id + '">结束签到</button>' +
        '</div></div>';
    } else {
      h += '<div class="empty" style="padding:28px 10px">' +
        '<div class="big">码</div>还没有进行中的签到<br>' +
        '<div class="small dim mt8">点下面的按钮发起，学生端就能签到</div></div>' +
        '<div class="field mt16"><label>签到窗口时长</label>' +
        '<select class="input" id="session-minutes">' +
          '<option value="5">5 分钟</option><option value="10" selected>10 分钟</option>' +
          '<option value="15">15 分钟</option><option value="30">30 分钟</option></select></div>' +
        '<button class="btn btn-primary btn-block" data-act="open-session" data-id="' + v.id + '">发起签到</button>';
    }
    h += '</div></div>';

    /* 实时看板 */
    h += '<div class="card"><div class="card-head"><div><h3>签到看板</h3>' +
         '<div class="sub">' + (latest ? '最近一次：' + esc(S.fmtDate(latest.startTime)) + ' ' + esc(S.fmtTime(latest.startTime)) : '暂无记录') + '</div></div>';
    if (latest) {
      var r = S.sessionRoster(latest.id);
      var done = r.filter(function (x) { return x.status !== 'absent'; }).length;
      h += '<span class="badge badge-info">' + done + ' / ' + r.length + ' 已签到</span>';
    }
    h += '</div><div class="card-body flush">';

    if (!latest) {
      h += '<div class="empty">发起一次签到后，这里会实时显示到课情况</div>';
    } else {
      var roster = S.sessionRoster(latest.id);
      var present = roster.filter(function (x) { return x.status === 'present'; }).length;
      var late = roster.filter(function (x) { return x.status === 'late'; }).length;
      var absent = roster.filter(function (x) { return x.status === 'absent'; }).length;
      h += '<div class="card-body" style="padding:12px 16px;border-bottom:1px solid var(--line-2)">' +
        '<div class="row wrap" style="gap:18px">' +
          '<span class="badge badge-ok">出勤 ' + present + '</span>' +
          '<span class="badge badge-warn">迟到 ' + late + '</span>' +
          '<span class="badge badge-danger">缺勤 ' + absent + '</span></div></div>';
      h += '<div style="max-height:290px;overflow:auto"><table class="table"><thead><tr>' +
           '<th>姓名</th><th>班级</th><th>状态</th><th class="num">签到时间</th></tr></thead><tbody>';
      roster.forEach(function (x) {
        var b = x.status === 'present' ? '<span class="badge badge-ok">出勤</span>'
              : x.status === 'late' ? '<span class="badge badge-warn">迟到</span>'
              : '<span class="badge badge-danger">缺勤</span>';
        h += '<tr><td>' + esc(x.name) + '</td><td class="small muted">' + esc(x.className) + '</td>' +
             '<td>' + b + '</td><td class="num mono small">' + esc(x.checkTime === '—' ? '—' : S.fmtTime(x.checkTime)) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    h += '</div>';

    /* 作业批改 */
    var assigns = global.SEED.assignments.filter(function (a) { return a.offeringId === v.id; });
    if (assigns.length) {
      var aid = ui.teacherAssignment && assigns.some(function (a) { return a.id === ui.teacherAssignment; })
        ? ui.teacherAssignment : assigns[0].id;
      var av = S.assignmentView(aid);
      var gs = S.gradingStats(aid);
      var gf = ui.gradeFilter || 'all';

      h += '<div class="card mt16"><div class="card-head">' +
        '<div><h3>作业批改</h3><div class="sub">' + esc(av.assignment.title) +
        ' · 截止 ' + esc(av.assignment.deadline) + ' · 满分 ' + av.assignment.fullScore + '</div></div>' +
        '<div class="row"><select class="input" style="width:auto" id="teacher-assignment">' +
        assigns.map(function (a) {
          return '<option value="' + a.id + '"' + (a.id === aid ? ' selected' : '') + '>' + esc(a.title) + '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-sm" data-act="export-grade" data-id="' + aid + '">导出成绩单</button></div></div>';

      /* 统计条 */
      h += '<div class="card-body" style="padding:14px 16px;border-bottom:1px solid var(--line-2)">' +
        '<div class="grid grid-4">' +
          '<div><div class="small muted">提交情况</div>' +
            '<div style="font-size:19px;font-weight:600">' + gs.submitted + ' <span class="dim" style="font-size:13px">/ ' + gs.enrolled + '</span></div>' +
            '<div class="bar mt8"><i class="' + (gs.submitted / gs.enrolled < .5 ? 'warn' : '') + '" style="width:' +
              Math.round(gs.submitted / (gs.enrolled || 1) * 100) + '%"></i></div></div>' +
          '<div><div class="small muted">已批改</div>' +
            '<div style="font-size:19px;font-weight:600">' + gs.graded + ' <span class="dim" style="font-size:13px">/ ' + gs.submitted + '</span></div>' +
            '<div class="bar mt8"><i class="' + (gs.graded < gs.submitted ? 'warn' : 'ok') + '" style="width:' +
              Math.round(gs.graded / (gs.submitted || 1) * 100) + '%"></i></div></div>' +
          '<div><div class="small muted">平均分</div>' +
            '<div style="font-size:19px;font-weight:600">' + (gs.avg == null ? '—' : gs.avg) + '</div>' +
            '<div class="small dim mt8">' + (gs.avg == null ? '还没有批改记录'
              : '最高 ' + gs.max + ' · 最低 ' + gs.min) + '</div></div>' +
          '<div><div class="small muted">未提交 / 迟交</div>' +
            '<div style="font-size:19px;font-weight:600;color:' + (gs.missing.length ? 'var(--danger)' : 'var(--ok)') + '">' +
              gs.missing.length + ' <span class="dim" style="font-size:13px">/ ' + gs.late + '</span></div>' +
            '<div class="small dim mt8">未提交 / 迟交</div></div>' +
        '</div>';

      /* 分数分布 */
      if (gs.graded) {
        h += '<div class="mt16"><div class="small muted mb8">分数段分布</div>' +
          gs.buckets.map(function (b) {
            return '<div class="row" style="gap:8px;margin-bottom:5px">' +
              '<span class="small dim" style="width:52px">' + b.label + '</span>' +
              '<div class="bar grow" style="height:8px"><i style="width:' + Math.round(b.n / gs.bucketMax * 100) + '%"></i></div>' +
              '<span class="small muted" style="width:24px;text-align:right">' + b.n + '</span></div>';
          }).join('') + '</div>';
      }

      /* AI 建议采纳情况 —— 回答"AI 到底帮上忙没有"，也标出哪些分是 AI 定的 */
      var ad = global.Grading ? global.Grading.adoptionStats(aid) : null;
      if (ad && ad.graded) {
        h += '<div class="small muted mt16">已批改 ' + ad.graded + ' 份：手工评分 ' + ad.manual +
          ' · 直接采纳 AI ' + ad.adopted + ' · AI 建议修改后采纳 ' + ad.edited +
          (ad.rate != null ? '（AI 参与 ' + ad.rate + '%）' : '') + '</div>';
      }
      h += '</div>';

      /* 筛选 */
      h += '<div class="card-body" style="padding:12px 16px;border-bottom:1px solid var(--line-2)">' +
        '<div class="row-between wrap"><div class="seg">' +
          '<button class="seg-item ' + (gf === 'all' ? 'active' : '') + '" data-act="gfilter" data-f="all">全部提交 ' + gs.submitted + '</button>' +
          '<button class="seg-item ' + (gf === 'ungraded' ? 'active' : '') + '" data-act="gfilter" data-f="ungraded">待批改 ' +
            (gs.submitted - gs.graded) + '</button>' +
          '<button class="seg-item ' + (gf === 'graded' ? 'active' : '') + '" data-act="gfilter" data-f="graded">已批改 ' + gs.graded + '</button>' +
          '<button class="seg-item ' + (gf === 'missing' ? 'active' : '') + '" data-act="gfilter" data-f="missing">未提交 ' + gs.missing.length + '</button>' +
        '</div>' +
        (gs.missing.length ? '<button class="btn btn-sm btn-warn" data-act="chase" data-id="' + aid + '">催交（' +
          gs.missing.length + ' 人）</button>' : '') +
        '</div></div>';

      h += '<div class="card-body flush">';

      if (gf === 'missing') {
        h += '<div style="max-height:340px;overflow:auto"><table class="table"><thead><tr>' +
             '<th style="width:110px">学号</th><th>姓名</th><th>班级</th><th>专业</th></tr></thead><tbody>';
        gs.missing.forEach(function (st) {
          h += '<tr><td class="mono small">' + esc(st.id) + '</td><td>' + esc(st.name) + '</td>' +
               '<td class="small muted">' + esc(st.className) + '</td><td class="small muted">' + esc(st.major) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      } else {
        var shown = gs.submissions.filter(function (sub) {
          if (gf === 'ungraded') return sub.score == null;
          if (gf === 'graded') return sub.score != null;
          return true;
        });
        if (!shown.length) {
          h += '<div class="empty">' + (gf === 'ungraded' ? '全部提交都已批改完成' : '这个分类下没有记录') + '</div>';
        } else {
          h += '<div style="overflow-x:auto"><table class="table"><thead><tr><th>学生</th><th>提交时间</th><th>内容 / 附件</th>' +
               '<th style="width:110px">分数</th><th style="width:240px">评语</th><th style="width:92px"></th></tr></thead><tbody>';
          shown.forEach(function (sub) {
            var stu = S.getStudent(sub.studentId);
            var sugOpen = ui.aiSuggestFor === sub.id;
            h += '<tr>' +
              '<td>' + esc(stu.name) + '<div class="small dim">' + esc(sub.studentId) + '</div></td>' +
              '<td class="small">' + esc(sub.submitTime) +
                (sub.isLate ? ' <span class="badge badge-warn">迟交</span>' : '') +
                (sub.score != null ? '<div class="small dim">' + esc(sub.gradedAt || '') +
                  (sub.gradedBy === 'ai-adopted' ? ' · AI 采纳' : (sub.gradedBy === 'ai-edited' ? ' · AI 改后采纳' : '')) +
                  '</div>' : '') + '</td>' +
              '<td class="small"><div style="max-width:230px">' + esc((sub.content || '').slice(0, 60)) + '</div>' +
                (sub.fileName ? '<div class="dim">📎 ' + esc(sub.fileName) + '</div>' : '') + '</td>' +
              '<td><input class="input" id="score-' + sub.id + '" type="number" min="0" max="100" value="' +
                (sub.score == null ? '' : sub.score) + '" placeholder="—"></td>' +
              '<td><textarea class="input" id="comment-' + sub.id + '" rows="3" placeholder="评语">' +
                esc(sub.comment || '') + '</textarea></td>' +
              '<td><div class="col" style="gap:5px">' +
                '<button class="btn btn-sm btn-primary" data-act="do-grade" data-id="' + sub.id + '">保存</button>' +
                '<button class="btn btn-sm btn-ghost" data-act="ai-suggest" data-id="' + sub.id + '">' +
                  (sugOpen ? '收起建议' : 'AI 建议') + '</button>' +
              '</div></td>' +
            '</tr>';
            if (sugOpen) {
              h += '<tr class="ai-sug-row"><td colspan="6">' + aiSuggestPanel(sub) + '</td></tr>';
            }
          });
          h += '</tbody></table></div>';
        }
      }
      h += '</div></div>';
    }

    return h;
  }

  /* ---------- 并发实验室 ---------- */
  var LAB_MODES = [
    { id: 'naive', name: '朴素实现', desc: '先查余量，再插入。判断与写入之间有网络往返。', cls: 'bad' },
    { id: 'naive-index', name: '朴素 + 唯一索引', desc: '同上，但写入时数据库唯一索引兜底。', cls: 'bad' },
    { id: 'atomic', name: '条件扣减（正确）', desc: '判断与写入在同一个同步块里完成，中间不让出执行权。', cls: 'good' }
  ];

  var LAB_SNIPPET = {
    naive: '<span class="bad">// 危险：先查后写</span>\nvar o = await find(offeringId);\nif (o.selectedCount >= o.capacity)\n  return { ok:false, reason:"名额已满" };\n<span class="bad">// ← 这里让出了执行权，别人抢走了名额</span>\nawait save(enrollment);\no.selectedCount += 1;',
    'naive-index': '<span class="bad">// 唯一索引只能防重复，防不住超卖</span>\nvar o = await find(offeringId);\nif (o.selectedCount >= o.capacity)\n  return { ok:false, reason:"名额已满" };\n<span class="bad">// ← 超卖依然发生</span>\nawait insert(enrollment); <span class="good">// UNIQUE 挡重复</span>\no.selectedCount += 1;',
    atomic: '<span class="good">// 正确：条件更新，一条 SQL 搞定</span>\nUPDATE course_offering\n   SET selected_count = selected_count + 1\n WHERE id = ?\n   AND selected_count &lt; capacity;\n<span class="good">// 影响行数 = 0 → 名额已满</span>\n<span class="good">// 判断与写入之间没有间隙</span>'
  };

  function lab() {
    var ui = global.App.ui;
    var h = '';
    h += '<div class="page-head"><h2>选课并发实验室</h2>' +
         '<div class="sub">在真实浏览器里跑真实的竞态 —— 不是示意图</div></div>';

    h += '<div class="alert alert-info mb16"><span class="ico">i</span><div>' +
         '热门课开放瞬间几百人同时点「选课」，会同时出现三种事故：<b>超卖</b>（容量 10 却选进 100 人）、' +
         '<b>重复选</b>（一个人占多个名额）、<b>数据不一致</b>。' +
         '下面三种实现跑的是同一套业务逻辑，只有并发处理方式不同。</div></div>';

    /* 参数 */
    h += '<div class="card mb16"><div class="card-head"><h3>实验参数</h3></div><div class="card-body">' +
      '<div class="row wrap" style="gap:20px;align-items:flex-end">' +
        '<div class="field mb0" style="width:230px"><label>并发请求数</label>' +
          '<input class="input" id="lab-requests" type="number" min="2" max="500" value="100"></div>' +
        '<div class="field mb0" style="width:180px"><label>课程容量</label>' +
          '<input class="input" id="lab-capacity" type="number" min="1" max="200" value="10"></div>' +
        '<div class="field mb0"><label>请求来源</label>' +
          '<select class="input" id="lab-same"><option value="0">100 个不同学生</option>' +
          '<option value="1">同一个学生点 100 次</option></select></div>' +
        '<button class="btn btn-primary btn-lg" data-act="run-lab">开始实验</button>' +
      '</div>' +
      '<div class="small dim mt12">三种实现都会跑一遍，结果直接对比。</div>' +
    '</div></div>';

    /* 结果 */
    var runs = ui.labRuns || [];
    h += '<div class="lab-grid">';
    LAB_MODES.forEach(function (m) {
      var r = null;
      for (var i = 0; i < runs.length; i++) if (runs[i].mode === m.id) r = runs[i];
      h += '<div class="lab-card ' + (r ? m.cls : '') + '">' +
        '<div class="row-between"><div class="lab-title">' + esc(m.name) + '</div>' +
        (r ? (r.oversold > 0 || r.dupRows > 0
                ? '<span class="badge badge-danger">有问题</span>'
                : '<span class="badge badge-ok">正确</span>')
             : '<span class="badge">未运行</span>') + '</div>' +
        '<div class="small muted mt8">' + esc(m.desc) + '</div>' +
        '<div class="lab-code">' + LAB_SNIPPET[m.id] + '</div>';
      if (r) {
        h += '<div class="lab-result">' +
          '<div><div class="lab-big ' + (r.rowCount > r.capacity ? 'bad' : 'good') + '">' + r.rowCount + '</div>' +
            '<div class="small muted">实际落库人数</div></div>' +
          '<div><div class="lab-big">' + r.capacity + '</div><div class="small muted">课程容量</div></div>' +
          '<div><div class="lab-big ' + (r.oversold > 0 ? 'bad' : 'good') + '">' +
            (r.oversold > 0 ? '超卖 ' + r.oversold : '0') + '</div><div class="small muted">超卖人数</div></div>' +
        '</div>';
        if (r.dupRows > 0) {
          h += '<div class="alert alert-danger mt12"><span class="ico">!</span><div>' +
               '同一个学生产生了 <b>' + r.dupRows + '</b> 条重复选课记录</div></div>';
        }
        var keys = Object.keys(r.reasons);
        if (keys.length) {
          h += '<div class="small muted mt12">拒绝原因：' +
            keys.map(function (k) { return esc(k) + ' × ' + r.reasons[k]; }).join('，') + '</div>';
        }
      }
      h += '</div>';
    });
    h += '</div>';

    /* 结论 */
    h += '<div class="card mt16"><div class="card-head"><h3>结论</h3></div><div class="card-body">' +
      '<table class="table"><thead><tr><th>实现</th><th>防超卖</th><th>防重复选</th><th>说明</th></tr></thead><tbody>' +
      '<tr><td>朴素实现（先查后写）</td><td><span class="badge badge-danger">不能</span></td>' +
        '<td><span class="badge badge-danger">不能</span></td>' +
        '<td class="small muted">判断与写入之间让出了执行权，其他请求在这段时间里看到的是过期数据</td></tr>' +
      '<tr><td>朴素 + 唯一索引</td><td><span class="badge badge-danger">不能</span></td>' +
        '<td><span class="badge badge-ok">能</span></td>' +
        '<td class="small muted">唯一索引只能拦住重复行，拦不住"容量 10 选进 100 人"</td></tr>' +
      '<tr><td>条件扣减（原子）</td><td><span class="badge badge-ok">能</span></td>' +
        '<td><span class="badge badge-ok">能</span></td>' +
        '<td class="small muted">把判断和写入合并成一次原子操作，不给自己留间隙</td></tr>' +
      '</tbody></table>' +
      '<div class="alert alert-ok mt16"><span class="ico">✓</span><div>' +
      '<b>两道防线都要有：</b>唯一索引 <span class="mono">UNIQUE(student_id, offering_id)</span> 防重复选，' +
      '条件更新 <span class="mono">WHERE selected_count &lt; capacity</span> 防超卖。' +
      '只做其中一道，系统在真实抢课场景下一定会出错。</div></div>' +
    '</div></div>';

    return h;
  }

  /* ---------- 教务统计看板 ---------- */
  function barLine(label, sub, value, max, cls) {
    var pct = max ? Math.round(value / max * 100) : 0;
    return '<div style="margin-bottom:11px">' +
      '<div class="row-between"><span class="small">' + label + '</span>' +
      '<span class="small muted">' + sub + '</span></div>' +
      '<div class="bar mt8"><i class="' + (cls || '') + '" style="width:' + pct + '%"></i></div></div>';
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  function admin() {
    var ov = S.statsOverview();
    var cats = S.statsByCategory();
    var ranks = S.statsOfferings();
    var maxSel = Math.max.apply(null, cats.map(function (c) { return c.selected; }).concat([1]));
    var fullCourses = ranks.filter(function (x) { return x.v.full; });
    var waitTotal = ranks.reduce(function (p, c) { return p + c.waitlist; }, 0);
    var topWait = ranks.slice().sort(function (a, b) { return b.waitlist - a.waitlist; })
                        .filter(function (x) { return x.waitlist > 0; });

    var h = '';
    h += '<div class="page-head row-between wrap"><div><h2>教务统计看板</h2>' +
         '<div class="sub">' + esc(S.load().term) + ' · 数据实时来自选课与签到记录，不是写死的</div></div>' +
         '<button class="btn btn-sm" data-act="export-overview">导出选课总表</button></div>';

    /* KPI */
    h += '<div class="grid grid-4 mb16">' +
      '<div class="stat"><div class="stat-num">' + ov.offerings + '<span class="unit">个</span></div>' +
        '<div class="stat-label">开课教学班 / 容量 ' + ov.capacity + '</div></div>' +
      '<div class="stat"><div class="stat-num">' + ov.selected + '<span class="unit">人次</span></div>' +
        '<div class="stat-label">已选人次 · 利用率 ' + pct(ov.fillRate) + '</div>' +
        '<div class="bar mt8"><i style="width:' + Math.round(ov.fillRate * 100) + '%"></i></div></div>' +
      '<div class="stat"><div class="stat-num ' + (ov.attendanceRate >= .85 ? 'ok' : 'warn') + '">' + pct(ov.attendanceRate) + '</div>' +
        '<div class="stat-label">平均出勤率（' + ov.signedTotal + ' / ' + ov.expectedTotal + ' 人次）</div></div>' +
      '<div class="stat"><div class="stat-num ' + (ov.hwRate < .5 ? 'warn' : 'ok') + '">' + pct(ov.hwRate) + '</div>' +
        '<div class="stat-label">作业提交率（' + ov.hwSubmitted + ' / ' + ov.hwExpected + '）</div></div>' +
    '</div>';

    h += '<div class="grid grid-2">';

    /* 各方向选课分布 */
    h += '<div class="card"><div class="card-head"><div><h3>各课程方向选课分布</h3>' +
         '<div class="sub">4 个方向各 4 门课</div></div></div><div class="card-body">';
    cats.forEach(function (c) {
      h += barLine(esc(c.cat.name), c.selected + ' / ' + c.capacity + '　' + pct(c.rate),
                   c.selected, maxSel, c.rate >= .9 ? 'warn' : '');
    });
    h += '<div class="row wrap small muted mt16" style="gap:14px">' +
         cats.map(function (c) {
           return '<span><b>' + esc(c.cat.short) + '</b> ' + c.offerings + ' 门 · 候补 ' + c.waitlisted + ' 人</span>';
         }).join('') + '</div>';
    h += '</div></div>';

    /* 容量利用率排行 */
    h += '<div class="card"><div class="card-head"><div><h3>容量利用率排行</h3>' +
         '<div class="sub">' + fullCourses.length + ' 个教学班已满</div></div></div>' +
         '<div class="card-body flush"><div style="max-height:392px;overflow:auto">' +
         '<table class="table"><thead><tr><th>课程</th><th>方向</th><th class="num">已选/容量</th>' +
         '<th class="num">候补</th><th style="width:96px">利用率</th><th style="width:64px"></th></tr></thead><tbody>';
    ranks.forEach(function (x) {
      h += '<tr><td>' + esc(x.v.course.name) + '<div class="small dim">' + esc(x.v.id) + '</div></td>' +
        '<td class="small muted">' + esc(x.v.category.short) + '</td>' +
        '<td class="num">' + x.v.offering.selectedCount + ' / ' + x.v.offering.capacity + '</td>' +
        '<td class="num"' + (x.waitlist ? ' style="color:var(--purple);font-weight:600"' : '') + '>' + (x.waitlist || '—') + '</td>' +
        '<td><div class="bar"><i class="' + (x.rate >= 1 ? 'danger' : (x.rate >= .8 ? 'warn' : '')) + '" style="width:' +
          Math.round(x.rate * 100) + '%"></i></div></td>' +
        '<td><button class="btn btn-sm btn-ghost" data-act="export-roster" data-id="' + x.v.id + '">名单</button></td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    h += '</div>';

    /* 候补与递补演示 */
    h += '<div class="card mt16"><div class="card-head">' +
      '<div><h3>候补队列</h3><div class="sub">共 ' + waitTotal + ' 人在排队 · 退课会触发自动递补</div></div>' +
      '<span class="badge badge-purple">' + fullCourses.length + ' 个教学班已满</span></div>' +
      '<div class="card-body flush">';
    if (!topWait.length) {
      h += '<div class="empty">当前没有候补队列</div>';
    } else {
      /* 外面套一层横向滚动容器：窄屏下表格比视口宽，不加会把整页撑出横向滚动条 */
      h += '<div style="overflow-x:auto">' +
           '<table class="table"><thead><tr><th>课程</th><th class="num">已选/容量</th>' +
           '<th class="num">候补人数</th><th>队首</th><th style="width:190px">演示操作</th></tr></thead><tbody>';
      topWait.forEach(function (x) {
        var q = S.waitlistOf(x.v.id);
        var head = q.length ? S.getStudent(q[0].studentId) : null;
        h += '<tr><td>' + esc(x.v.course.name) + '<div class="small dim">' + esc(x.v.id) + '</div></td>' +
          '<td class="num">' + x.v.offering.selectedCount + ' / ' + x.v.offering.capacity + '</td>' +
          '<td class="num">' + x.waitlist + '</td>' +
          '<td class="small">' + (head ? esc(head.name) + '<div class="dim">第 1 位</div>' : '—') + '</td>' +
          '<td><button class="btn btn-sm" data-act="simulate-drop" data-id="' + x.v.id + '">模拟一名学生退课</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div></div>';

    h += '<div class="alert alert-info mt16"><span class="ico">i</span><div>' +
      '<b>递补也是并发敏感点。</b>退课时先减名额，再从候补队列取队首补上，' +
      '这段逻辑同样不能留间隙 —— 实现见 <span class="mono">store.js · promoteFromWaitlist()</span>，' +
      '用 <span class="mono">while (selectedCount &lt; capacity)</span> 兜住，否则一次退课可能补进两个人。</div></div>';

    return h;
  }

  /* ===========================================================
   * AI 选课推荐
   * 打分全部来自 assets/ai.js，这里只负责把分数和依据画出来
   * =========================================================== */

  var AI_COLOR = {
    direction: 'var(--primary)', chain: 'var(--ok)', schedule: 'var(--purple)',
    capacity: 'var(--warn)', teacher: 'var(--text-3)'
  };

  var AI_VERDICT = {
    strong: { label: '强烈推荐', cls: 'badge-ok' },
    good: { label: '值得考虑', cls: 'badge-info' },
    ok: { label: '备选', cls: 'badge-purple' }
  };

  function aiRecommend() {
    var me = S.currentUser();
    var ui = global.App.ui;
    var AI = global.AI;
    if (!AI) return '<div class="card"><div class="card-body">推荐引擎未加载。</div></div>';

    var res = AI.recommend(me.id, { top: 4 });
    var p = res.profile, st = res.stats;

    /* null 表示"还没点过"，默认展开第一条 */
    var openId = ui.aiOpen === null
      ? (res.items[0] ? res.items[0].offeringId : '')
      : ui.aiOpen;

    var primaryCat = S.getCategory(p.cats[0]);

    var h = '';
    h += '<div class="page-head row-between wrap"><div><h2>AI 选课推荐</h2>' +
         '<div class="sub">5 个维度加权打分 · 每一条建议都能追溯到具体数据，不是随机挑的</div></div>' +
         '<span class="badge badge-purple">规则引擎 · 离线运行</span></div>';

    /* ---------- 学生画像 ---------- */
    h += '<div class="grid grid-4 mb16 ai-stats">' +
      '<div class="stat"><div class="stat-num">' + p.earnedCredit + '<span class="unit">学分</span></div>' +
        '<div class="stat-label">累计已修 · ' + esc(p.major) + '</div></div>' +
      '<div class="stat"><div class="stat-num">' + p.selectedCredit +
        '<span class="unit">/ ' + p.maxCredit + '</span></div>' +
        '<div class="stat-label">本学期已选学分 · ' + p.courseCount + ' 门课</div>' +
        '<div class="bar mt8"><i style="width:' +
          Math.round(p.selectedCredit / p.maxCredit * 100) + '%"></i></div></div>' +
      '<div class="stat"><div class="stat-num" style="font-size:17px">' +
        esc(primaryCat ? primaryCat.name : '—') + '</div>' +
        '<div class="stat-label">主修方向（按专业推断）</div></div>' +
      '<div class="stat"><div class="stat-num">' + st.recommended + '<span class="unit">门</span></div>' +
        '<div class="stat-label">可推荐 · 已剔除 ' + (st.total - st.recommended) + ' 门</div></div>' +
    '</div>';

    /* ---------- 推荐卡片 ---------- */
    if (!res.items.length) {
      h += '<div class="card"><div class="card-body muted">' +
           '没有可推荐的课了 —— 能选的都已经选完、排满，或与现有课表冲突。</div></div>';
    }

    res.items.forEach(function (it, idx) {
      var vd = AI_VERDICT[it.verdict] || AI_VERDICT.ok;
      var expanded = openId === it.offeringId;

      h += '<div class="card mb16">';
      h += '<div class="card-head ai-card-head"><div class="row" style="gap:12px;align-items:center">' +
        '<div class="ai-rank">' + (idx + 1) + '</div>' +
        '<div><h3>' + esc(it.name) + ' <span class="small dim">' + esc(it.code) + '</span></h3>' +
        '<div class="sub">' + esc(it.teacher) + ' · ' + esc(it.slotLabel) + ' · ' +
          it.credit + ' 学分 · ' + esc(it.catName) + '</div></div></div>' +
        '<div style="text-align:right"><div class="ai-score">' + it.score +
          '<span class="unit">分</span></div>' +
          '<span class="badge ' + vd.cls + '">' + vd.label + '</span></div></div>';

      h += '<div class="card-body">';

      /* 贡献条：每段宽度 = 该项得分，总长度就是总分（满分 100） */
      h += '<div class="ai-stack">';
      it.breakdown.forEach(function (b) {
        if (b.delta > 0) {
          h += '<i style="width:' + b.delta + '%;background:' +
               (AI_COLOR[b.key] || 'var(--text-3)') + '"></i>';
        }
      });
      h += '</div>';
      h += '<div class="ai-legend">' + it.breakdown.map(function (b) {
        return '<span><b>' + b.label + '</b> +' + b.delta + '</span>';
      }).join('') + '</div>';

      /* 操作 */
      h += '<div class="row wrap mt16" style="gap:8px">';
      if (it.full) {
        h += '<button class="btn btn-sm" data-act="waitlist" data-id="' + it.offeringId + '">' +
             '加入候补（第 ' + (S.waitlistCount(it.offeringId) + 1) + ' 位）</button>';
      } else {
        h += '<button class="btn btn-sm" data-act="enroll" data-id="' + it.offeringId + '">选这门课</button>';
      }
      h += '<button class="btn btn-sm btn-ghost" data-act="goto" data-href="#/course/' + it.offeringId + '">查看课程</button>' +
           '<button class="btn btn-sm btn-ghost" data-act="ai-toggle" data-id="' + it.offeringId + '" ' +
             'data-open="' + (expanded ? '1' : '0') + '">' + (expanded ? '收起明细' : '评分明细') + '</button>' +
           '</div>';

      /* 评分明细 */
      if (expanded) {
        h += '<div class="table-scroll mt16"><table class="table"><thead><tr><th>维度</th><th class="num">得分</th>' +
             '<th>依据</th></tr></thead><tbody>';
        it.breakdown.forEach(function (b) {
          h += '<tr><td>' + b.label + '</td>' +
               '<td class="num">+' + b.delta + ' / ' + b.max + '</td>' +
               '<td class="small muted">' + esc(b.detail) + '</td></tr>';
        });
        h += '<tr><td><b>合计</b></td><td class="num"><b>' + it.score + ' / 100</b></td>' +
             '<td class="small muted">五项加权求和</td></tr>';
        h += '</tbody></table></div>';
      }

      h += '</div></div>';
    });

    /* ---------- 筛选过程 ---------- */
    h += '<div class="card mt16"><div class="card-head"><div><h3>为什么只推荐这几门</h3>' +
         '<div class="sub">先按硬约束把选不了的剔掉，剩下的才进打分环节</div></div></div>' +
         '<div class="card-body flush"><div class="table-scroll"><table class="table"><thead><tr>' +
         '<th>环节</th><th class="num">门数</th><th>说明</th></tr></thead><tbody>';

    var rows = [
      ['共评估教学班', st.total, '不含并发实验室的虚拟课程'],
      ['已选 / 已在候补', st.enrolled + ' / ' + st.waitlisted, '选过或排着队的直接跳过'],
      ['同一门课的其他教学班', st.sameCourse, '课程编码相同，不重复推荐'],
      ['与现有课表冲突', st.conflict, '时间撞了，先解决冲突'],
      ['超出本学期学分上限', st.credit, '上限 ' + p.maxCredit + ' 学分'],
      ['进入打分环节', st.recommended, '按总分排序，展示前 4 门']
    ];
    rows.forEach(function (r, i) {
      var last = i === rows.length - 1;
      h += '<tr' + (last ? ' style="background:var(--surface-2)"' : '') + '>' +
           '<td>' + (last ? '<b>' + r[0] + '</b>' : r[0]) + '</td>' +
           '<td class="num">' + (last ? '<b>' + r[1] + '</b>' : r[1]) + '</td>' +
           '<td class="small muted">' + esc(r[2]) + '</td></tr>';
    });
    h += '</tbody></table></div></div></div>';

    /* ---------- 算法说明 ---------- */
    h += '<div class="card mt16"><div class="card-head"><div><h3>评分规则</h3>' +
         '<div class="sub">权重写在 ai.js 里，这张表直接读同一份配置，不会和代码对不上</div></div></div>' +
         '<div class="card-body">';
    h += '<div class="ai-legend" style="margin-top:0">' + AI.WEIGHTS.map(function (w) {
      return '<span><b>' + w.label + '</b> ' + w.max + ' 分</span>';
    }).join('') + '</div>';
    h += '<div class="small muted mt16">' +
      '这是规则引擎，不是大模型：每一分都能对上一条具体数据，所以能解释、也能被追问。' +
      '接真模型时只需要替换 <code>AI.provider</code>，页面和调用方都不用改。' +
      '</div></div></div>';

    return h;
  }

  /* =========================================================
   * 学业预警
   * 三端共用一个页面，用 seg 切换视角：
   *   我的预警（学生）/ 班级名单（教师）/ 全校分布（教务）
   * ========================================================= */

  var WARN_BADGE = { none: 'badge', watch: 'badge badge-info', warn: 'badge badge-warn', critical: 'badge badge-danger' };
  var WARN_TONE = { none: 'ok', watch: 'info', warn: 'warn', critical: 'danger' };

  function warnBadge(level) {
    var lv = global.Warning.levelOf(level);
    return '<span class="' + (WARN_BADGE[level] || 'badge') + '">' + esc(lv.name) + '</span>';
  }

  /* 一条规则的证据块 —— 预警之所以可信，全靠这里能点到具体记录 */
  function warnEvidence(sig) {
    var h = '<div class="warn-ev">';
    h += '<div class="small muted mb8">判定阈值：' + esc(sig.threshold) +
         '　当前：<b>' + sig.value + esc(sig.unit) + '</b></div>';
    if (!sig.evidence.length) {
      h += '<div class="small dim">这条规则没有可展开的明细</div>';
    } else {
      h += '<ul class="warn-ev-list">';
      sig.evidence.forEach(function (e) {
        h += '<li><div class="warn-ev-t">' + esc(e.title) + '</div>' +
             '<div class="small dim">' + esc(e.detail) + '</div></li>';
      });
      h += '</ul>';
    }
    h += '<div class="warn-advice">建议：' + esc(sig.advice) + '</div>';
    h += '</div>';
    return h;
  }

  function warnSignalCard(sig, open) {
    var h = '<div class="warn-item ' + (open ? 'open' : '') + '">';
    h += '<button class="warn-item-head" data-act="wopen" data-id="' + sig.id + '">';
    h += '<div class="row" style="gap:10px;align-items:center;flex:1;min-width:0">' +
         warnBadge(sig.level) +
         '<b>' + esc(sig.label) + '</b>' +
         '<span class="small muted">' + esc(sig.dim) + '</span></div>' +
         '<div class="row" style="gap:12px;align-items:center">' +
         '<span class="small">' + sig.value + esc(sig.unit) + '</span>' +
         '<span class="warn-caret">' + (open ? '收起' : '证据') + '</span></div>';
    h += '</button>';
    if (open) h += warnEvidence(sig);
    h += '</div>';
    return h;
  }

  /* 干预与解除的时间线：让"预警是个过程"这件事看得见 */
  function warnTimeline(studentId) {
    var s = S.load();
    var rows = [];
    (s.warnings || []).forEach(function (w) {
      if (w.studentId !== studentId) return;
      rows.push({ at: w.createdAt, level: w.level, text: '生成预警 · ' + w.label });
      if (w.resolvedAt) rows.push({ at: w.resolvedAt, level: 'none', text: '自动解除 · ' + w.label });
    });
    (s.interventions || []).forEach(function (itv) {
      if (itv.studentId !== studentId) return;
      rows.push({
        at: itv.at, level: 'watch',
        text: (itv.type === 'meeting' ? '约谈' : '提醒') + ' · ' + itv.note,
        by: itv.byName
      });
    });
    if (!rows.length) return '<div class="empty">还没有预警记录</div>';
    rows.sort(function (a, b) { return a.at < b.at ? 1 : -1; });

    var h = '<ul class="warn-tl">';
    rows.forEach(function (r) {
      h += '<li><span class="warn-dot ' + (WARN_TONE[r.level] || 'ok') + '"></span>' +
           '<div><div class="small">' + esc(r.text) + '</div>' +
           '<div class="small dim">' + esc(r.at) + (r.by ? ' · ' + esc(r.by) : '') + '</div></div></li>';
    });
    h += '</ul>';
    return h;
  }

  /* ---------- 学生端 ---------- */

  function warningMe(me) {
    var W = global.Warning;
    var ui = global.App.ui;
    var r = W.evaluate(me.id);
    if (!r.ok) return '<div class="card"><div class="card-body">' + esc(r.reason) + '</div></div>';

    var tone = WARN_TONE[r.level];
    var h = '';

    h += '<div class="card warn-hero ' + tone + '"><div class="card-body">' +
      '<div class="row-between wrap" style="gap:16px">' +
        '<div class="row" style="gap:16px;align-items:center">' +
          '<div class="warn-score ' + tone + '">' + r.score + '</div>' +
          '<div><div class="warn-level">' + esc(r.levelName) +
            (r.boosted ? ' <span class="small dim">（多维度叠加）</span>' : '') + '</div>' +
            '<div class="small muted">风险分 0-100 · 命中 ' + r.signals.length + ' 条规则</div></div>' +
        '</div>' +
        '<div class="small" style="max-width:380px;line-height:1.7">' + esc(r.summary) + '</div>' +
      '</div>';

    if (r.actions.length) {
      h += '<div class="warn-actions"><div class="small muted mb8">接下来该做什么</div>';
      r.actions.forEach(function (a) {
        h += '<div class="warn-action">· ' + esc(a) + '</div>';
      });
      h += '</div>';
    }
    h += '</div></div>';

    /* 指标卡 */
    var m = r.metrics;
    h += '<div class="grid grid-4 mb16 warn-metrics">' +
      '<div class="stat"><div class="stat-num ' + (m.attendanceRate < 80 ? 'danger' : 'ok') + '">' +
        m.attendanceRate + '<span class="unit">%</span></div>' +
        '<div class="stat-label">出勤率 · ' + m.attendanceTotal + ' 场，缺勤 ' + m.absent + ' 次</div></div>' +
      '<div class="stat"><div class="stat-num ' + (m.overdue ? 'warn' : 'ok') + '">' +
        m.overdue + '<span class="unit">份</span></div>' +
        '<div class="stat-label">作业逾期 · 已批 ' + m.graded + ' 份' +
        (m.avgScore != null ? '，均分 ' + m.avgScore : '') + '</div></div>' +
      '<div class="stat"><div class="stat-num">' + m.earned + '<span class="unit">学分</span></div>' +
        '<div class="stat-label">累计已修 · 年级中位 ' + m.median + '</div></div>' +
      '<div class="stat"><div class="stat-num ' + (m.gap >= 16 ? 'warn' : 'ok') + '">' +
        (m.gap > 0 ? m.gap : 0) + '<span class="unit">学分</span></div>' +
        '<div class="stat-label">预计毕业缺口 · 按当前修课速度推算</div></div>' +
    '</div>';

    /* 规则明细 */
    h += '<div class="card mb16"><div class="card-head"><div><h3>触发详情</h3>' +
         '<div class="sub">每条都写着阈值和证据，可以逐条核对</div></div></div>' +
         '<div class="card-body flush">';
    if (!r.signals.length) {
      h += '<div class="empty">没有触发任何规则，各项指标都在正常范围</div>';
    } else {
      var openId = ui.warnOpen === undefined ? (r.signals[0] ? r.signals[0].id : '') : ui.warnOpen;
      r.signals.forEach(function (sig) {
        h += warnSignalCard(sig, sig.id === openId);
      });
    }
    h += '</div></div>';

    /* 时间线 */
    h += '<div class="card"><div class="card-head"><div><h3>预警时间线</h3>' +
         '<div class="sub">生成 · 干预 · 解除，都留痕</div></div></div>' +
         '<div class="card-body">' + warnTimeline(me.id) + '</div></div>';

    return h;
  }

  /* ---------- 教师端 ---------- */

  function warningClass(ui) {
    var W = global.Warning;
    var offeringId = ui.warnOffering || 'DAR201-01';
    var mine = S.listOfferings({}).filter(function (x) {
      return x.teacher && (x.teacher.id === 'T01' || x.teacher.id === 'T02');
    });
    var v = S.offeringView(offeringId);
    var rows = W.roster(offeringId);
    var total = S.rosterOf(offeringId).length;

    var h = '<div class="row-between wrap mb16">' +
      '<div class="small muted">共 ' + total + ' 人，其中 <b>' + rows.length + '</b> 人触发预警' +
      '（' + (total ? Math.round(rows.length / total * 100) : 0) + '%）</div>' +
      '<select class="input" style="width:auto" id="warn-offering">' +
      mine.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === offeringId ? ' selected' : '') + '>' +
               esc(x.course.name + '（' + x.id + '）') + '</option>';
      }).join('') + '</select></div>';

    if (!v) return h + '<div class="card"><div class="empty">请选择课程</div></div>';
    if (!rows.length) return h + '<div class="card"><div class="empty">这个班暂时没有需要预警的学生</div></div>';

    h += '<div class="card"><div class="card-body flush"><div class="table-scroll"><table class="table">' +
      '<thead><tr><th>学生</th><th>等级</th><th class="num">风险分</th>' +
      '<th>触发项</th><th>处理状态</th><th style="width:150px"></th></tr></thead><tbody>';

    rows.forEach(function (r) {
      /* 用干预记录判断处理状态，而不是 warnings 表：
         教师端不一定会先跑重算，查 warnings 会把"没建档"误判成"待处理"。 */
      var itvs = W.interventionsOf(r.studentId);
      var status = itvs.length ? 'intervening' : 'active';
      var open = ui.warnOpen === r.studentId;
      var itvOpen = ui.warnItvFor === r.studentId;

      h += '<tr class="' + (open ? 'row-open' : '') + '">' +
        '<td><b>' + esc(r.student.name) + '</b>' +
          '<div class="small dim">' + esc(r.studentId) + ' · ' + esc(r.student.className || '') + '</div></td>' +
        '<td>' + warnBadge(r.level) + '</td>' +
        '<td class="num"><b>' + r.score + '</b></td>' +
        '<td class="small">' + r.signals.map(function (s) { return esc(s.label); }).join('、') + '</td>' +
        '<td class="small">' + (status === 'intervening'
          ? '<span class="badge badge-purple">已干预</span>'
          : '<span class="badge">待处理</span>') + '</td>' +
        '<td><div class="row" style="gap:6px">' +
          '<button class="btn btn-sm" data-act="wopen" data-id="' + r.studentId + '">' +
            (open ? '收起' : '证据') + '</button>' +
          '<button class="btn btn-sm btn-primary" data-act="wopen-itv" data-id="' + r.studentId + '">干预</button>' +
        '</div></td></tr>';

      if (open) {
        h += '<tr class="row-detail"><td colspan="6"><div class="warn-detail">';
        r.signals.forEach(function (sig) {
          h += '<div class="warn-detail-item"><div class="row" style="gap:8px;align-items:center">' +
               warnBadge(sig.level) + '<b class="small">' + esc(sig.label) + '</b>' +
               '<span class="small dim">' + sig.value + esc(sig.unit) + '</span></div>' +
               warnEvidence(sig) + '</div>';
        });
        h += '<div class="small dim mt12">干预记录：' +
             (itvs.length ? esc(itvs[0].at + ' · ' + itvs[0].note) : '暂无') + '</div>';
        h += '</div></td></tr>';
      }

      if (itvOpen) {
        h += '<tr class="row-detail"><td colspan="6"><div class="warn-detail">' +
          '<div class="small muted mb8">给 ' + esc(r.student.name) + ' 记录一次干预 —— 写清楚做了什么，后面复盘靠它</div>' +
          '<textarea class="input" id="itv-note-' + r.studentId + '" rows="2" ' +
            'placeholder="例如：已电话联系，学生承诺 3 天内补齐逾期作业"></textarea>' +
          '<div class="row mt8" style="gap:8px">' +
            '<select class="input" id="itv-type-' + r.studentId + '" style="width:auto">' +
              '<option value="reminder">消息提醒</option>' +
              '<option value="meeting">约谈</option>' +
              '<option value="contact">联系家长</option>' +
            '</select>' +
            '<button class="btn btn-sm btn-primary" data-act="do-itv" data-id="' + r.studentId + '">保存干预记录</button>' +
            '<button class="btn btn-sm" data-act="wopen-itv" data-id="' + r.studentId + '">取消</button>' +
          '</div></div></td></tr>';
      }
    });

    h += '</tbody></table></div></div></div>';
    h += '<div class="small dim mt12">干预只是留痕，<b>不会</b>直接消掉预警 —— ' +
         '学生补齐作业后，下次重算会自动降级或解除。这是刻意设计的。</div>';
    return h;
  }

  /* ---------- 教务端 ---------- */

  function warningSchool() {
    var W = global.Warning;
    var sc = W.school();
    var order = ['critical', 'warn', 'watch', 'none'];

    var h = '<div class="grid grid-4 mb16">';
    order.forEach(function (k) {
      var lv = W.levelOf(k);
      h += '<div class="stat"><div class="stat-num ' + (k === 'critical' ? 'danger' : k === 'warn' ? 'warn' : '') + '">' +
        sc.dist[k] + '<span class="unit">人</span></div>' +
        '<div class="stat-label">' + esc(lv.name) + ' · ' +
        (sc.total ? Math.round(sc.dist[k] / sc.total * 1000) / 10 : 0) + '%</div>' +
        '<div class="bar mt8"><i class="' + (k === 'critical' ? 'danger' : k === 'warn' ? 'warn' : k === 'watch' ? '' : 'ok') +
        '" style="width:' + (sc.total ? Math.round(sc.dist[k] / sc.total * 100) : 0) + '%"></i></div></div>';
    });
    h += '</div>';

    h += '<div class="grid grid-2 mb16">';

    /* 分布 */
    h += '<div class="card"><div class="card-head"><div><h3>等级分布</h3>' +
         '<div class="sub">' + esc(sc.plan.name) + ' · 总学分 ' + sc.plan.total + '</div></div></div>' +
         '<div class="card-body">';
    order.forEach(function (k) {
      var pct = sc.total ? sc.dist[k] / sc.total * 100 : 0;
      h += '<div class="mb12"><div class="row-between small mb8">' +
        '<span>' + esc(W.levelOf(k).name) + '</span>' +
        '<span class="muted">' + sc.dist[k] + ' 人 · ' + (Math.round(pct * 10) / 10) + '%</span></div>' +
        '<div class="bar"><i class="' + (k === 'critical' ? 'danger' : k === 'warn' ? 'warn' : k === 'watch' ? '' : 'ok') +
        '" style="width:' + pct + '%"></i></div></div>';
    });
    h += '<div class="small dim mt12">年级学分中位 ' + sc.cohort.median +
         '，均值 ' + Math.round(sc.cohort.mean * 10) / 10 +
         '。预警率（含关注）' + sc.rate + '%。</div>';
    h += '</div></div>';

    /* 规则命中排行 */
    h += '<div class="card"><div class="card-head"><div><h3>规则命中排行</h3>' +
         '<div class="sub">哪条规则在批量触发，说明它可能太松</div></div></div>' +
         '<div class="card-body">';
    var hits = W.RULES.map(function (rule) {
      return { rule: rule, n: sc.ruleHits[rule.id] || 0 };
    }).sort(function (a, b) { return b.n - a.n; });
    var maxHit = Math.max.apply(null, hits.map(function (x) { return x.n; }).concat([1]));
    hits.forEach(function (x) {
      h += '<div class="mb12"><div class="row-between small mb8">' +
        '<span>' + esc(x.rule.dim + ' · ' + x.rule.label) + '</span>' +
        '<span class="muted">' + x.n + ' 人</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(x.n / maxHit * 100) + '%"></i></div></div>';
    });
    h += '</div></div>';
    h += '</div>';

    /* 名单 */
    h += '<div class="card"><div class="card-head"><div><h3>预警名单</h3>' +
         '<div class="sub">按等级与风险分排序，前 15 名</div></div>' +
         '<button class="btn btn-sm" data-act="wrecalc">重算全部</button></div>' +
         '<div class="card-body flush"><div class="table-scroll"><table class="table">' +
         '<thead><tr><th>学生</th><th>等级</th><th class="num">风险分</th><th>触发项</th>' +
         '<th>状态</th></tr></thead><tbody>';
    sc.rows.slice(0, 15).forEach(function (r) {
      /* 这里只列当前有预警的人，所以状态只有「待处理 / 已干预」两种。
         不能用 activeWarningsOf 判断 —— 没跑过重算的学生查不到记录，
         会被误显示成"已解除"，那是把"没建档"当成了"已恢复"。 */
      var itvs = W.interventionsOf(r.studentId);
      h += '<tr><td><b>' + esc(r.student.name) + '</b>' +
        '<div class="small dim">' + esc(r.studentId) + ' · ' + esc(r.student.className || '') + '</div></td>' +
        '<td>' + warnBadge(r.level) + '</td>' +
        '<td class="num"><b>' + r.score + '</b></td>' +
        '<td class="small">' + r.signals.map(function (s) { return esc(s.label); }).join('、') + '</td>' +
        '<td class="small">' + (itvs.length
          ? '<span class="badge badge-purple">已干预 ' + itvs.length + ' 次</span>'
          : '<span class="badge">待处理</span>') + '</td></tr>';
    });
    h += '</tbody></table></div></div></div>';

    return h;
  }

  function warning() {
    var me = S.currentUser();
    var ui = global.App.ui;
    if (!global.Warning) {
      return '<div class="card"><div class="card-body">预警引擎未加载。</div></div>';
    }
    var tab = ui.warningTab || 'me';

    var h = '';
    h += '<div class="page-head row-between wrap"><div><h2>学业预警</h2>' +
         '<div class="sub">7 条规则 · 每条预警都能展开到具体证据 · 解除靠重算，不靠人工点掉</div></div>' +
         '<span class="badge badge-purple">规则引擎 · 离线运行</span></div>';

    h += '<div class="row wrap mb16"><div class="seg">' +
      ['me|我的预警', 'class|班级名单', 'school|全校分布'].map(function (x) {
        var p = x.split('|');
        return '<button class="seg-item ' + (tab === p[0] ? 'active' : '') +
          '" data-act="wtab" data-tab="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div></div>';

    if (tab === 'class') return h + warningClass(ui);
    if (tab === 'school') return h + warningSchool();
    return h + warningMe(me);
  }

  global.Views = {
    login: login, dashboard: dashboard, courses: courses, courseDetail: courseDetail,
    schedule: schedule, myCourses: myCourses, classroom: classroom, signin: signin,
    homework: homework, homeworkDetail: homeworkDetail, messages: messages,
    profile: profile, teacher: teacher, lab: lab, admin: admin, aiRecommend: aiRecommend,
    warning: warning
  };
  global.ViewUtils = { esc: esc, fmtLeft: fmtLeft, fmtSize: fmtSize, capBar: capBar };
})(window);
