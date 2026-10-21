/* ===========================================================
 * app.js — 路由、事件委托、计时器
 * =========================================================== */
(function (global) {
  'use strict';

  var S = global.Store;
  var V = global.Views;
  var esc = global.ViewUtils.esc;

  var App = {
    ui: {
      courseCat: 'all',
      keyword: '',
      hwFilter: 'all',
      classTab: 'signin',
      teacherOffering: 'DAR201-01',
      teacherAssignment: null,
      gradeFilter: 'all',
      labRuns: [],
      labRequests: 100,
      labCapacity: 10,
      labSame: 0,
      sheetOpen: false
    }
  };
  global.App = App;

  var root = document.getElementById('app');

  /* ---------- 图标 ---------- */
  var ICON_PATHS = {
    home: '<path d="M3 7.5 8 3l5 4.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    cal: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    book: '<path d="M8 4.4C6.8 3.4 4.6 3.2 2.8 3.2v9c1.8 0 4 .2 5.2 1.2 1.2-1 3.4-1.2 5.2-1.2v-9c-1.8 0-4 .2-5.2 1.2z"/><path d="M8 4.4v9"/>',
    check: '<circle cx="8" cy="8" r="5.5"/><path d="M5.6 8.2 7.3 10l3.1-3.6"/>',
    file: '<path d="M4 2.5h5l3 3v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M9 2.5v3h3"/>',
    bell: '<path d="M8 2.5a3.5 3.5 0 0 0-3.5 3.5c0 3-1.5 4-1.5 4h10s-1.5-1-1.5-4A3.5 3.5 0 0 0 8 2.5z"/><path d="M6.8 12.5a1.4 1.4 0 0 0 2.4 0"/>',
    user: '<circle cx="8" cy="6" r="2.6"/><path d="M3.2 13.2c.6-2.2 2.5-3.4 4.8-3.4s4.2 1.2 4.8 3.4"/>',
    board: '<rect x="2.5" y="3" width="11" height="7.5" rx="1.2"/><path d="M8 10.5v2M5.5 13.5h5"/>',
    bolt: '<path d="M9.2 2 4 9h3.3l-.9 5L12 7H8.6z"/>',
    chart: '<path d="M3 13.2V8.6M6.3 13.2V4M9.7 13.2V9.4M13 13.2V6.2"/>',
    more: '<circle cx="3.6" cy="3.6" r="1.35" fill="currentColor"/><circle cx="8" cy="3.6" r="1.35" fill="currentColor"/>' +
          '<circle cx="12.4" cy="3.6" r="1.35" fill="currentColor"/><circle cx="3.6" cy="8" r="1.35" fill="currentColor"/>' +
          '<circle cx="8" cy="8" r="1.35" fill="currentColor"/><circle cx="12.4" cy="8" r="1.35" fill="currentColor"/>' +
          '<circle cx="3.6" cy="12.4" r="1.35" fill="currentColor"/><circle cx="8" cy="12.4" r="1.35" fill="currentColor"/>' +
          '<circle cx="12.4" cy="12.4" r="1.35" fill="currentColor"/>'
  };

  function icon(name, cls) {
    return '<svg class="' + (cls || 'nav-ico') + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
           'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           (ICON_PATHS[name] || '') + '</svg>';
  }

  var NAV = [
    { group: '学习', items: [
      { id: 'dashboard', label: '工作台', icon: 'home' },
      { id: 'courses', label: '课程广场', icon: 'grid' },
      { id: 'schedule', label: '我的课表', icon: 'cal' },
      { id: 'my', label: '我的课程', icon: 'book' }
    ] },
    { group: '课堂', items: [
      { id: 'signin', label: '课程签到', icon: 'check' },
      { id: 'homework', label: '我的作业', icon: 'file' }
    ] },
    { group: '其他', items: [
      { id: 'messages', label: '消息通知', icon: 'bell' },
      { id: 'profile', label: '个人中心', icon: 'user' }
    ] },
    { group: '演示', items: [
      { id: 'teacher', label: '教师端', icon: 'board' },
      { id: 'admin', label: '教务看板', icon: 'chart' },
      { id: 'lab', label: '并发实验室', icon: 'bolt' }
    ] }
  ];

  /* 移动端底部导航。侧边栏在窄屏是隐藏的，所以这里必须给「演示」那三页留入口，
     否则手机上点不到教师端 / 教务看板 / 并发实验室。放不下的都收进「更多」抽屉。 */
  var MOBILE_NAV = [
    { id: 'dashboard', label: '工作台', icon: 'home' },
    { id: 'courses', label: '课程', icon: 'grid' },
    { id: 'schedule', label: '课表', icon: 'cal' },
    { id: 'signin', label: '签到', icon: 'check' },
    { id: 'more', label: '更多', icon: 'more' }
  ];

  /* 「更多」抽屉里列出的页面 */
  var SHEET_ITEMS = [
    { id: 'my', label: '我的课程', icon: 'book', group: '学习' },
    { id: 'homework', label: '我的作业', icon: 'file', group: '学习' },
    { id: 'messages', label: '消息通知', icon: 'bell', group: '其他' },
    { id: 'profile', label: '个人中心', icon: 'user', group: '其他' },
    { id: 'teacher', label: '教师端', icon: 'board', group: '演示' },
    { id: 'admin', label: '教务看板', icon: 'chart', group: '演示' },
    { id: 'lab', label: '并发实验室', icon: 'bolt', group: '演示' }
  ];

  /* ---------- 路由 ---------- */
  function parseHash() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { name: 'dashboard', param: null };
    return { name: parts[0], param: parts[1] || null };
  }

  function isActive(id, r) {
    if (id === r.name) return true;
    if (id === 'courses' && r.name === 'course') return true;
    if (id === 'my' && r.name === 'classroom') return true;
    if (id === 'homework' && r.name === 'homework') return true;
    return false;
  }

  function resolve(r) {
    switch (r.name) {
      case 'dashboard': return { title: '工作台', html: V.dashboard() };
      case 'courses': return { title: '课程广场', html: V.courses() };
      case 'course': return { title: '课程详情', html: V.courseDetail(r.param) };
      case 'schedule': return { title: '我的课表', html: V.schedule() };
      case 'my': return { title: '我的课程', html: V.myCourses() };
      case 'classroom': return { title: '课程主页', html: V.classroom(r.param) };
      case 'signin': return { title: '课程签到', html: V.signin() };
      case 'homework': return r.param
        ? { title: '作业详情', html: V.homeworkDetail(r.param) }
        : { title: '我的作业', html: V.homework() };
      case 'messages': return { title: '消息通知', html: V.messages() };
      case 'profile': return { title: '个人中心', html: V.profile() };
      case 'teacher': return { title: '教师端', html: V.teacher() };
      case 'admin': return { title: '教务统计看板', html: V.admin() };
      case 'lab': return { title: '并发实验室', html: V.lab() };
      default: return { title: '工作台', html: V.dashboard() };
    }
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var me = S.currentUser();
    if (!me) {
      stopTimer();
      root.innerHTML = V.login();
      return;
    }
    var r = parseHash();
    if (r.name === 'login') { location.hash = '#/dashboard'; return; }
    var view = resolve(r);
    root.innerHTML = shell(view, r, me);
    afterRender(r);
  }

  function shell(view, r, me) {
    var unread = S.unreadCount();
    var h = '';
    h += '<div class="shell"><aside class="side">';
    h += '<div class="brand"><div class="brand-mark"><div class="brand-dot">选</div>选课系统</div>' +
         '<div class="brand-sub">' + esc(S.load().term) + '</div></div>';
    h += '<nav class="nav">';
    NAV.forEach(function (g) {
      h += '<div class="nav-group">' + g.group + '</div>';
      g.items.forEach(function (it) {
        var badge = '';
        if (it.id === 'messages' && unread) badge = '<span class="nav-count">' + unread + '</span>';
        h += '<button class="nav-item' + (isActive(it.id, r) ? ' active' : '') + '" data-act="goto" data-href="#/' + it.id + '">' +
             icon(it.icon) + '<span>' + it.label + '</span>' + badge + '</button>';
      });
    });
    h += '</nav><div class="side-foot">' +
         '<button class="btn btn-sm btn-block" data-act="reset">重置演示数据</button></div></aside>';

    h += '<div class="main"><header class="topbar">' +
      '<div><div class="topbar-title">' + esc(view.title) + '</div>' +
      '<div class="topbar-sub">' + esc(S.load().termKey) + '</div></div>' +
      '<div class="grow"></div>' +
      '<div class="search">' + icon('grid', 'nav-ico') +
        '<input id="global-search" placeholder="搜索课程…" value="' + esc(App.ui.keyword) + '"></div>' +
      '<button class="icon-btn" data-act="goto" data-href="#/messages" title="消息">' +
        icon('bell', 'nav-ico') + (unread ? '<span class="dot"></span>' : '') + '</button>' +
      '<div class="user-chip" data-act="goto" data-href="#/profile">' +
        '<div class="avatar">' + esc(me.name.slice(0, 1)) + '</div>' +
        '<div><div style="font-size:13px;font-weight:600">' + esc(me.name) + '</div>' +
        '<div class="dim" style="font-size:11px">' + esc(me.id) + '</div></div></div>' +
      '</header>' +
      '<main class="view">' + view.html + '</main></div></div>';

    h += '<nav class="mobile-nav">';
    MOBILE_NAV.forEach(function (it) {
      if (it.id === 'more') {
        /* 当前页在抽屉里时，「更多」也高亮，不然用户不知道自己在哪 */
        var inSheet = SHEET_ITEMS.some(function (x) { return x.id === r.name; });
        h += '<button class="' + (App.ui.sheetOpen || inSheet ? 'active' : '') + '" data-act="sheet">' +
             icon(it.icon, 'mi') + '<span>' + it.label + '</span></button>';
        return;
      }
      h += '<button class="' + (isActive(it.id, r) ? 'active' : '') + '" data-act="goto" data-href="#/' + it.id + '">' +
           icon(it.icon, 'mi') + '<span>' + it.label + '</span></button>';
    });
    h += '</nav>';

    /* 移动端「更多」抽屉 */
    if (App.ui.sheetOpen) {
      h += '<div class="sheet-mask" data-act="sheet"></div>' +
           '<div class="sheet" role="dialog" aria-label="全部功能">' +
             '<div class="sheet-grip"></div>';
      var lastGroup = null;
      SHEET_ITEMS.forEach(function (it) {
        if (it.group !== lastGroup) {
          lastGroup = it.group;
          h += '<div class="sheet-group">' + esc(it.group) + '</div>';
        }
        h += '<button class="sheet-item' + (r.name === it.id ? ' active' : '') + '" data-act="goto" data-href="#/' + it.id + '">' +
             icon(it.icon, 'mi') + '<span>' + esc(it.label) + '</span>' +
             (it.id === 'messages' && unread ? '<span class="nav-count">' + unread + '</span>' : '') +
             '</button>';
      });
      h += '<div class="sheet-foot"><button class="btn btn-sm btn-block" data-act="reset">重置演示数据</button></div></div>';
    }
    return h;
  }

  function afterRender(r) {
    /* 全局搜索 */
    var gs = document.getElementById('global-search');
    if (gs) {
      var t = null;
      gs.addEventListener('input', function () {
        clearTimeout(t);
        var val = gs.value;
        t = setTimeout(function () {
          App.ui.keyword = val;
          if (parseHash().name !== 'courses') location.hash = '#/courses';
          else render();
        }, 260);
      });
    }
    /* 教师端下拉 */
    var sel = document.getElementById('teacher-offering');
    if (sel) {
      sel.addEventListener('change', function () {
        App.ui.teacherOffering = sel.value;
        App.ui.teacherAssignment = null;
        stopTimer();
        render();
      });
    }
    var selA = document.getElementById('teacher-assignment');
    if (selA) {
      selA.addEventListener('change', function () {
        App.ui.teacherAssignment = selA.value;
        render();
      });
    }
    /* 教师端签到计时器 */
    if (r.name === 'teacher') startTimer();
    else stopTimer();
  }

  /* ---------- 教师端计时器（签到码自动刷新 + 看板刷新） ---------- */
  var timer = null, ticks = 0;

  function startTimer() {
    stopTimer();
    /* ↓ 没有进行中的签到就别起计时器。
       否则 render() → startTimer() → 1 秒后发现没 live → render() 会变成每秒重渲染的死循环，
       正在填写的分数/评语会被冲掉。 */
    if (!S.activeSessionOf(App.ui.teacherOffering)) return;
    ticks = 0;
    timer = setInterval(function () {
      var live = S.activeSessionOf(App.ui.teacherOffering);
      if (!live) { stopTimer(); render(); return; }
      ticks++;
      if (ticks >= S.CODE_TTL_SEC) {
        ticks = 0;
        S.refreshCode(live.id);
        var el = document.getElementById('live-code');
        if (el) el.textContent = live.code;
      }
      var ring = document.getElementById('code-ring');
      if (ring) ring.style.width = Math.max(0, 100 - ticks / S.CODE_TTL_SEC * 100) + '%';
      var left = document.getElementById('live-left');
      if (left) left.textContent = global.ViewUtils.fmtLeft(S.parseDateTime(live.endTime) - new Date());
      /* 每 5 秒刷一次看板，但别打断正在输入的人 */
      if (ticks % 5 === 0) {
        var ae = document.activeElement;
        var typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
        if (!typing) render();
      }
    }, 1000);
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  /* ---------- Toast ---------- */
  function toast(msg, kind) {
    var host = document.getElementById('toast-host');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, kind === 'err' ? 3600 : 2400);
  }

  /* ---------- CSV 下载 ---------- */
  function downloadCsv(fileName, text) {
    /* 带 BOM，Excel 打开中文才不乱码 */
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /* ---------- 确认弹层 ---------- */
  function confirmDialog(title, body, okLabel) {
    return new Promise(function (resolve) {
      var host = document.getElementById('modal-host');
      host.innerHTML = '<div class="backdrop"><div class="modal">' +
        '<div class="modal-head"><h3>' + esc(title) + '</h3></div>' +
        '<div class="modal-body"><div class="muted">' + body + '</div></div>' +
        '<div class="modal-foot"><button class="btn" data-mo="cancel">取消</button>' +
        '<button class="btn btn-primary" data-mo="ok">' + esc(okLabel || '确定') + '</button></div>' +
        '</div></div>';
      function done(v) { host.innerHTML = ''; resolve(v); }
      host.querySelector('[data-mo="ok"]').onclick = function () { done(true); };
      host.querySelector('[data-mo="cancel"]').onclick = function () { done(false); };
      host.querySelector('.backdrop').onclick = function (e) { if (e.target.classList.contains('backdrop')) done(false); };
    });
  }

  /* ---------- 并发实验 ---------- */
  async function runLab() {
    var reqEl = document.getElementById('lab-requests');
    var capEl = document.getElementById('lab-capacity');
    var sameEl = document.getElementById('lab-same');
    App.ui.labRequests = Math.max(2, Math.min(500, parseInt(reqEl.value, 10) || 100));
    App.ui.labCapacity = Math.max(1, Math.min(200, parseInt(capEl.value, 10) || 10));
    App.ui.labSame = sameEl.value === '1' ? 1 : 0;

    App.ui.labRuns = [];
    render();
    toast('正在跑 ' + App.ui.labRequests + ' 个并发请求…');

    var modes = ['naive', 'naive-index', 'atomic'];
    for (var i = 0; i < modes.length; i++) {
      var r = await S.runConcurrencyLab(modes[i], App.ui.labCapacity, App.ui.labRequests, !!App.ui.labSame);
      App.ui.labRuns.push(r);
      render();
    }
    var bad = App.ui.labRuns.filter(function (x) { return x.oversold > 0 || x.dupRows > 0; }).length;
    toast(bad ? ('实验完成：' + bad + ' 种实现出错了') : '实验完成：全部正确', bad ? 'err' : 'ok');
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', async function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    var me = S.currentUser();

    switch (act) {
      case 'goto': {
        /* 从「更多」抽屉里跳转时，先把抽屉关掉 */
        var href = el.getAttribute('data-href');
        var wasSheet = App.ui.sheetOpen;
        App.ui.sheetOpen = false;
        /* hash 没变就不会触发 hashchange，得手动重渲染一次把抽屉收掉 */
        if (location.hash === href) { if (wasSheet) render(); }
        else location.hash = href;
        break;
      }

      case 'sheet':
        App.ui.sheetOpen = !App.ui.sheetOpen;
        render();
        break;

      case 'cat':
        App.ui.courseCat = el.getAttribute('data-cat');
        render();
        break;

      case 'hwfilter':
        App.ui.hwFilter = el.getAttribute('data-f');
        render();
        break;

      case 'ctab':
        App.ui.classTab = el.getAttribute('data-tab');
        render();
        break;

      case 'gfilter':
        App.ui.gradeFilter = el.getAttribute('data-f');
        render();
        break;

      case 'do-login': {
        var nameEl = document.getElementById('login-name');
        var passEl = document.getElementById('login-pass');
        var res = S.login(nameEl.value.trim(), passEl.value);
        if (!res.ok) { toast(res.reason, 'err'); return; }
        App.ui.keyword = '';
        location.hash = '#/dashboard';
        render();
        toast('欢迎回来，' + res.student.name, 'ok');
        break;
      }

      case 'logout':
        S.logout();
        stopTimer();
        location.hash = '';
        render();
        break;

      case 'reset': {
        var yes = await confirmDialog('重置演示数据',
          '将清空所有选课、签到、作业提交记录，恢复到初始状态。此操作不可撤销。', '确认重置');
        if (!yes) return;
        S.reset();
        App.ui.labRuns = [];
        App.ui.keyword = '';
        stopTimer();
        toast('演示数据已重置', 'ok');
        render();
        break;
      }

      case 'enroll': {
        el.disabled = true;
        var r = await S.selectCourse(me.id, id);
        if (r.ok) {
          var v = S.offeringView(id);
          toast('选课成功：' + v.course.name + '（余 ' + v.left + ' 个名额）', 'ok');
        } else {
          toast(r.reason, 'err');
        }
        render();
        break;
      }

      case 'drop': {
        var vv = S.offeringView(id);
        var yes2 = await confirmDialog('确认退课',
          '确定要退掉《' + esc(vv.course.name) + '》吗？退课后名额会立刻释放，并自动递补给候补队列的第 1 位同学。', '确认退课');
        if (!yes2) return;
        var rd = S.dropCourse(me.id, id);
        if (rd.ok) {
          toast(rd.promoted && rd.promoted.length
            ? '已退课，名额已自动递补给候补同学'
            : '已退课：' + vv.course.name, 'ok');
        } else {
          toast(rd.reason, 'err');
        }
        render();
        break;
      }

      case 'waitlist': {
        el.disabled = true;
        var rw = S.joinWaitlist(me.id, id);
        toast(rw.ok ? rw.reason : rw.reason, rw.ok ? 'ok' : 'err');
        render();
        break;
      }

      case 'drop-waitlist': {
        var vw = S.offeringView(id);
        var yw = await confirmDialog('放弃候补',
          '确定要退出《' + esc(vw.course.name) + '》的候补队列吗？退出后需要重新排队。', '放弃候补');
        if (!yw) return;
        var rw2 = S.dropWaitlist(me.id, id);
        toast(rw2.ok ? '已放弃候补' : rw2.reason, rw2.ok ? 'ok' : 'err');
        render();
        break;
      }

      case 'simulate-drop': {
        var rs = S.simulateDrop(id);
        if (!rs.ok) { toast(rs.reason, 'err'); return; }
        var promoted = rs.promoted || [];
        var pnames = promoted.map(function (e) { return S.getStudent(e.studentId).name; });
        toast(pnames.length
          ? (rs.student.name + ' 退课 → 候补第 1 位 ' + pnames[0] + ' 自动递补成功')
          : (rs.student.name + ' 已退课，候补队列为空'), 'ok');
        render();
        break;
      }

      case 'chase': {
        var g = S.gradingStats(id);
        if (!g) return;
        var mineMissing = g.missing.some(function (st) { return st.id === me.id; });
        if (mineMissing) {
          S.pushMessage('homework', '催交提醒：' + g.assignment.title,
            '教师已发送催交提醒，该作业将于 ' + g.assignment.deadline + ' 截止，请尽快提交。');
        }
        toast('已向 ' + g.missing.length + ' 名未提交学生发送提醒' + (mineMissing ? '（含你）' : ''), 'ok');
        render();
        break;
      }

      case 'export-roster': {
        var rc = S.rosterCsv(id);
        if (!rc) { toast('导出失败', 'err'); return; }
        downloadCsv(rc.fileName, rc.text);
        toast('已导出 ' + rc.fileName, 'ok');
        break;
      }

      case 'export-grade': {
        var gc = S.gradeCsv(id);
        if (!gc) { toast('导出失败', 'err'); return; }
        downloadCsv(gc.fileName, gc.text);
        toast('已导出 ' + gc.fileName, 'ok');
        break;
      }

      case 'export-overview': {
        var rows = [['课程', '教学班', '教师', '方向', '容量', '已选', '候补', '利用率']];
        S.statsOfferings().forEach(function (x) {
          rows.push([
            x.v.course.name, x.v.id, x.v.teacher ? x.v.teacher.name : '',
            x.v.category.name, x.v.offering.capacity, x.v.offering.selectedCount,
            x.waitlist, Math.round(x.rate * 100) + '%'
          ]);
        });
        rows.push([]);
        var ov = S.statsOverview();
        rows.push(['合计', '', '', '', ov.capacity, ov.selected, ov.waitlisted, Math.round(ov.fillRate * 100) + '%']);
        rows.push(['平均出勤率', Math.round(ov.attendanceRate * 100) + '%', '作业提交率', Math.round(ov.hwRate * 100) + '%']);
        downloadCsv('选课总表.csv', S.buildCsv(rows));
        toast('已导出 选课总表.csv', 'ok');
        break;
      }

      case 'do-signin': {
        var codeEl = document.getElementById('signin-code');
        var rc = S.checkIn(me.id, codeEl.value);
        if (rc.ok) {
          toast(rc.status === 'present' ? '签到成功：出勤' : '签到成功：迟到', 'ok');
        } else {
          toast(rc.reason, 'err');
        }
        render();
        break;
      }

      case 'fill-code': {
        var live = null;
        var st = S.load();
        var myIds = S.myEnrollments(me.id).map(function (x) { return x.offeringId; });
        st.sessions.forEach(function (x) {
          if (myIds.indexOf(x.offeringId) >= 0 && x.status === 'open' && S.parseDateTime(x.endTime) >= new Date()) live = x;
        });
        if (live) {
          var ci = document.getElementById('signin-code');
          if (ci) ci.value = live.code;
          toast('已填入当前签到码');
        }
        break;
      }

      case 'do-submit': {
        var content = (document.getElementById('hw-content') || {}).value || '';
        var fileEl = document.getElementById('hw-file');
        var fname = '', fsize = 0;
        if (fileEl && fileEl.files && fileEl.files.length) {
          fname = fileEl.files[0].name;
          fsize = fileEl.files[0].size;
        }
        var rs = S.submitHomework(id, me.id, content.trim(), fname, fsize);
        if (!rs.ok) { toast(rs.reason, 'err'); return; }
        toast(rs.updated ? '已覆盖提交' + (rs.late ? '（标记为迟交）' : '') : '提交成功' + (rs.late ? '（标记为迟交）' : ''), 'ok');
        location.hash = '#/homework';
        render();
        break;
      }

      case 'read-msg':
        S.readMessage(id);
        render();
        break;

      case 'read-all':
        S.readAllMessages();
        toast('已全部标为已读', 'ok');
        render();
        break;

      case 'open-session': {
        var minEl = document.getElementById('session-minutes');
        var minutes = minEl ? parseInt(minEl.value, 10) : 10;
        var sess = S.openSession(id, null, minutes);
        toast('签到已发起，签到码 ' + sess.code, 'ok');
        render();
        startTimer();
        break;
      }

      case 'refresh-code': {
        var live2 = S.activeSessionOf(App.ui.teacherOffering);
        if (live2) {
          S.refreshCode(live2.id);
          ticks = 0;
          var el2 = document.getElementById('live-code');
          if (el2) el2.textContent = live2.code;
          var rg = document.getElementById('code-ring');
          if (rg) rg.style.width = '100%';
          toast('已生成新签到码 ' + live2.code);
        }
        break;
      }

      case 'close-session': {
        S.closeSession(id);
        stopTimer();
        toast('签到已结束', 'ok');
        render();
        break;
      }

      case 'do-grade': {
        var sc = document.getElementById('score-' + id);
        var cm = document.getElementById('comment-' + id);
        var score = parseInt(sc.value, 10);
        if (isNaN(score) || score < 0 || score > 100) { toast('请输入 0-100 之间的分数', 'err'); return; }
        var rg2 = S.gradeSubmission(id, score, cm.value.trim());
        toast(rg2.ok ? '已保存评分' : rg2.reason, rg2.ok ? 'ok' : 'err');
        render();
        break;
      }

      case 'run-lab':
        await runLab();
        break;

      case 'print':
        window.print();
        break;

      default:
        break;
    }
  });

  /* ---------- 启动 ---------- */
  global.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/dashboard';
  render();
})(window);
