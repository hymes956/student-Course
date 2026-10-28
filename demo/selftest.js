/* store.js / data.js 逻辑自测（node 直接跑，不依赖 DOM） */
globalThis.window = globalThis;
require(require('path').join(__dirname,'assets','data.js'));
require(require('path').join(__dirname,'assets','store.js'));
require(require('path').join(__dirname,'assets','ai.js'));
require(require('path').join(__dirname,'assets','grading.js'));
require(require('path').join(__dirname,'assets','warning.js'));

var S = globalThis.Store;
var AI = globalThis.AI;
var G = globalThis.Grading;
var W = globalThis.Warning;
var SEED = globalThis.SEED;
var fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (extra ? '   ' + extra : ''));
  if (!cond) fail++;
}

(async function () {
  console.log('\n=== 0. 数据一致性：selectedCount 必须等于 enrollment 行数 ===');
  S.reset();
  var s0 = S.load();
  var mismatch = 0;
  s0.offerings.forEach(function (o) {
    if (o.isLab) return;
    var rows = s0.enrollments.filter(function (e) { return e.offeringId === o.id && e.status === 'selected'; }).length;
    if (rows !== o.selectedCount) { mismatch++; console.log('       ' + o.id + ' selectedCount=' + o.selectedCount + ' 实际行数=' + rows); }
  });
  ok(mismatch === 0, '全部 16 门课的 selectedCount 与选课行数一致');

  console.log('\n=== 1. 时间冲突检测 ===');
  S.reset();
  var cf = S.findConflict('2023001', 'SCG201-01');
  ok(!!cf, 'SCG201-01 与已选课程冲突', cf ? cf.course.name + ' / ' + cf.targetSlot : '');
  ok(!!S.findConflict('2023001', 'SCG202-01'), 'SCG202-01 与已选课程冲突');
  ok(!S.findConflict('2023001', 'ARC201-01'), 'ARC201-01 无冲突（应可选）');
  ok(!S.findConflict('2023001', 'ICB201-01'), 'ICB201-01 无冲突（应可选）');

  console.log('\n=== 2. 完整选课链路 selectCourse ===');
  S.reset();
  var r1 = await S.selectCourse('2023001', 'SCG201-01');
  ok(!r1.ok && /时间冲突/.test(r1.reason), '时间冲突被拒绝', r1.reason);
  var r2 = await S.selectCourse('2023002', 'DAR301-01');
  ok(!r2.ok && /名额已满/.test(r2.reason), '满员课程被拒绝（未要求候补）', r2.reason);
  var r3 = await S.selectCourse('2023001', 'DAR201-01');
  ok(!r3.ok && /已选过/.test(r3.reason), '重复选课被拒绝', r3.reason);
  var r4 = await S.selectCourse('2023001', 'ARC201-01');
  ok(r4.ok, '无冲突课程选课成功');
  ok(S.selectedCredit('2023001') === 16, '学分统计正确（13 + 3 = 16）', '当前 ' + S.selectedCredit('2023001'));
  var left = S.offeringView('ARC201-01').left;
  var r5 = await S.selectCourse('2023002', 'ARC201-01');
  ok(r5.ok && S.offeringView('ARC201-01').left === left - 1, '余量正确扣减');
  var r6 = S.dropCourse('2023001', 'ARC201-01');
  ok(r6.ok && S.offeringView('ARC201-01').left === left, '退课后余量正确释放');

  console.log('\n=== 3. 并发实验室：100 请求抢 10 个名额 ===');
  S.reset();
  var naive = await S.runConcurrencyLab('naive', 10, 100, false);
  ok(naive.oversold > 0, '朴素版【超卖】', '落库 ' + naive.rowCount + ' 人 / 容量 10 → 超卖 ' + naive.oversold);
  var naiveIdx = await S.runConcurrencyLab('naive-index', 10, 100, false);
  ok(naiveIdx.oversold > 0, '朴素版 + 唯一索引【仍然超卖】', '落库 ' + naiveIdx.rowCount + ' 人 → 超卖 ' + naiveIdx.oversold);
  var atomic = await S.runConcurrencyLab('atomic', 10, 100, false);
  ok(atomic.rowCount === 10 && atomic.oversold === 0, '原子版【恰好 10 人，无超卖】',
     '成功 ' + atomic.success + ' / 落库 ' + atomic.rowCount);

  console.log('\n=== 4. 并发实验室：同一学生并发 10 次 ===');
  S.reset();
  ok((await S.runConcurrencyLab('naive', 5, 10, true)).rowCount > 1, '朴素版【同一学生多条记录】');
  ok((await S.runConcurrencyLab('naive-index', 5, 10, true)).rowCount === 1, '唯一索引【挡住重复选课】');
  ok((await S.runConcurrencyLab('atomic', 5, 10, true)).rowCount === 1, '原子版 + 唯一索引【1 条】');

  console.log('\n=== 5. 签到流程 ===');
  S.reset();
  var sess = S.openSession('DAR201-01', 'T01', 10);
  var sessId = sess.id;
  ok(sess.code.length === 6, '生成 6 位签到码', sess.code);
  ok(!S.checkIn('2023001', '000000').ok, '错误签到码被拒绝');
  var good = S.checkIn('2023001', sess.code);
  ok(good.ok && good.status === 'present', '正确签到码签到成功，判定准时');
  ok(!S.checkIn('2023001', sess.code).ok, '重复签到被拒绝');
  ok(!S.checkIn('2023006', sess.code).ok, '未选课学生无法签到');
  var roster = S.sessionRoster(sessId);
  var cap = S.getOffering('DAR201-01').selectedCount;
  ok(roster.length === cap, '签到看板人数 = 选课人数（' + cap + '）', '实际 ' + roster.length);

  console.log('\n=== 6. 签到码 60 秒刷新 ===');
  var oldCode = String(sess.code);
  S.refreshCode(sessId);
  var after = S.load().sessions.filter(function (x) { return x.id === sessId; })[0];
  ok(after.code !== oldCode, '刷新后生成新码', oldCode + ' -> ' + after.code);
  var target = roster.filter(function (r) { return r.studentId !== '2023001'; })[0];
  var stale = S.checkIn(target.studentId, oldCode);
  ok(!stale.ok && /不正确|刷新/.test(stale.reason), '旧码在刷新后失效', stale.reason);
  ok(S.checkIn(target.studentId, after.code).ok, '新码签到成功');

  console.log('\n=== 7. 作业提交与截止判定 ===');
  S.reset();
  var hs0 = S.homeworkStats('2023001');
  ok(hs0.total === 6, '我的作业总数 = 6', JSON.stringify(hs0));
  ok(hs0.graded === 1, '初始已批改 = 1');
  var closed = S.submitHomework('ASG-SCG101-1', '2023001', '迟到的作业', 'hw.zip', 1024);
  ok(!closed.ok && /不允许迟交/.test(closed.reason), '过期且不允许迟交 → 拒绝');
  var late = S.submitHomework('ASG-DAR201-1', '2023001', '重交内容', 'v2.rar', 2048);
  ok(late.ok && late.updated, '允许迟交的作业可重复提交（覆盖）');
  ok(S.homeworkStats('2023001').graded === 0, '重新提交后需重新批改');
  ok(S.gradeSubmission('SUB-2', 91, '思路清晰').ok, '教师批改打分成功');

  console.log('\n=== 8. 课表与筛选 ===');
  S.reset();
  var items = S.scheduleOf('2023001');
  ok(items.length === 8, '课表条目数 = 8', '实际 ' + items.length);
  ok(items.every(function (x) { return x.conflict === false; }), '预置课表本身无冲突');
  ok(S.listOfferings({ cat: 'scg' }).length === 4, '按方向筛选：空间计算与图形学 4 门');
  ok(S.listOfferings({ keyword: 'BIM' }).length === 1, '关键词搜索「BIM」命中 1 门');

  console.log('\n=== 9. 候补队列与自动递补 ===');
  S.reset();
  S.login('2023001', '123456');
  var wl = S.myWaitlist('2023001');
  ok(wl.length === 1 && wl[0].offeringId === 'DAR301-01', '种子数据里我在 DAR301-01 候补队列');
  ok(wl[0].order === 1, '候补排位第 1', '第 ' + wl[0].order + ' 位 / 共 ' + wl[0].total + ' 人');
  ok(S.waitlistCount('DAR301-01') >= 5, '该课候补队列人数 >= 5', '实际 ' + S.waitlistCount('DAR301-01'));

  var rw = await S.selectCourse('2023003', 'DAR301-01', { waitlist: true });
  ok(rw.ok && rw.order > 1, '满员课程可加入候补', '排位第 ' + rw.order + ' 位');
  ok(!(await S.selectCourse('2023003', 'DAR301-01', { waitlist: true })).ok, '同一课程不能重复候补');

  var beforeSel = S.getOffering('DAR301-01').selectedCount;
  var beforeWl = S.waitlistCount('DAR301-01');
  var sd = S.simulateDrop('DAR301-01');
  ok(sd.ok, '模拟一名学生退课成功', sd.student.name);
  ok(sd.promoted && sd.promoted.length === 1 && sd.promoted[0].studentId === '2023001',
     '候补第 1 位被自动递补', sd.promoted ? sd.promoted[0].studentId : '无');
  ok(S.getOffering('DAR301-01').selectedCount === beforeSel, '递补后已选人数不变（退 1 进 1）',
     beforeSel + ' -> ' + S.getOffering('DAR301-01').selectedCount);
  ok(S.waitlistCount('DAR301-01') === beforeWl - 1, '候补队列少 1 人');
  ok(S.isEnrolled('2023001', 'DAR301-01'), '我已从候补变成正式选课');
  ok(S.myWaitlist('2023001').length === 0, '我的候补列表已清空');

  /* 递补不能超卖：反复退课递补，最终人数不能超过容量 */
  S.reset();
  var off = S.getOffering('DAR301-01');
  for (var t = 0; t < 12; t++) S.simulateDrop('DAR301-01');
  ok(off.selectedCount <= off.capacity, '连续 12 次退课递补后仍未超卖',
     off.selectedCount + ' / ' + off.capacity + '（候补剩 ' + S.waitlistCount('DAR301-01') + '）');

  S.reset();
  S.login('2023001', '123456');
  ok(S.dropWaitlist('2023001', 'DAR301-01').ok, '可以放弃候补');
  ok(S.waitlistOrderOf('2023001', 'DAR301-01') === null, '放弃后不再在队列中');
  var q = S.waitlistOf('DAR301-01');
  ok(q[0].waitlistOrder === 1, '放弃后后面的人排位前移', '当前第 1 位 order=' + q[0].waitlistOrder);

  console.log('\n=== 10. 消息联动 ===');
  S.reset();
  S.login('2023001', '123456');
  var u0 = S.unreadCount();
  await S.selectCourse('2023001', 'ARC201-01');
  ok(S.unreadCount() === u0 + 1, '选课成功 → 未读 +1', S.messages()[0].title);
  var sess2 = S.openSession('DAR201-01', 'T01', 10);
  S.checkIn('2023001', sess2.code);
  ok(/签到/.test(S.messages()[0].title), '签到成功 → 推送消息', S.messages()[0].title);
  S.submitHomework('ASG-ARC101-1', '2023001', '内容', 'f.pdf', 100);
  ok(/提交成功/.test(S.messages()[0].title), '提交作业 → 推送消息', S.messages()[0].title);
  S.gradeSubmission('SUB-1', 88, '不错');
  ok(/已批改/.test(S.messages()[0].title), '作业被批改 → 推送消息', S.messages()[0].title);
  S.readAllMessages();
  ok(S.unreadCount() === 0, '全部标为已读后未读归零');

  console.log('\n=== 11. 统计与 CSV 导出 ===');
  S.reset();
  var ov = S.statsOverview();
  ok(ov.capacity === 540, '总容量 = 540', '实际 ' + ov.capacity);
  ok(ov.selected === 376, '已选人次 = 376', '实际 ' + ov.selected);
  ok(ov.enrollRows === ov.selected, '选课行数与已选人次一致');
  ok(ov.attendanceRate > 0.8 && ov.attendanceRate < 0.95, '出勤率落在合理区间',
     Math.round(ov.attendanceRate * 100) + '%（' + ov.signedTotal + ' / ' + ov.expectedTotal + '）');
  /* 提交率不再"偏低"：为了让学业预警有区分度，buildFresh 会给非演示学生
     补提交记录（见 store.js）。这里守住"大多数人交了、少数没交"这个分布 ——
     如果生成逻辑坏掉（比如全交或全不交），区间断言会立刻失败。 */
  ok(ov.hwRate > 0.6 && ov.hwRate < 0.9, '作业提交率接近真实分布',
     Math.round(ov.hwRate * 100) + '%');
  var cats = S.statsByCategory();
  ok(cats.length === 4 && cats.every(function (c) { return c.offerings === 4; }), '4 个方向各 4 门课');
  var ranks = S.statsOfferings();
  ok(ranks.length === 16 && ranks[0].rate >= ranks[15].rate, '容量利用率排行有序',
     '最高 ' + ranks[0].v.course.name + ' ' + Math.round(ranks[0].rate * 100) + '%');

  var g = S.gradingStats('ASG-DAR201-1');
  ok(g.enrolled === 31, '作业所属课程已选 31 人', '实际 ' + g.enrolled);
  ok(g.submitted === 2 && g.graded === 1, '已交 2 / 已批改 1');
  ok(g.missing.length === 29, '未提交名单 29 人', '实际 ' + g.missing.length);
  ok(g.avg === 82, '平均分 = 82', '实际 ' + g.avg);

  var csv = S.rosterCsv('DAR201-01');
  var lines = csv.text.split('\r\n');
  ok(!!csv.fileName && /选课名单/.test(csv.fileName), 'CSV 文件名正确', csv.fileName);
  ok(lines.length === 6 + 31, 'CSV 行数 = 表头 6 行 + 名单 31 行', '实际 ' + lines.length);
  ok(lines[5].indexOf('学号') === 0, 'CSV 表头正确', lines[5]);

  var gc = S.gradeCsv('ASG-DAR201-1');
  ok(/未提交/.test(gc.text), '成绩单 CSV 含未提交段');
  ok(S.buildCsv([['a,b', 'c"d']]) === '"a,b","c""d"', 'CSV 转义正确', S.buildCsv([['a,b', 'c"d']]));

  console.log('\n=== 12. 数据自洽：签到日期必须落在排课星期上 ===');
  /* 这条曾经踩过：DAR201-01 是周二/周四的课，签到却写在周五，
     学生把「我的课表」和「签到记录」一对就露馅了。
     出勤率、名单这些统计数字都是算出来的，只有日期是手写的，所以专门守一下。 */
  S.reset();
  var allSess = S.load().sessions;
  var badSess = [];
  allSess.forEach(function (sess) {
    var o = S.getOffering(sess.offeringId);
    if (!o) { badSess.push(sess.id + '(教学班不存在)'); return; }
    var jsDay = new Date(sess.startTime.replace(' ', 'T')).getDay(); /* 0=周日 */
    var wd = jsDay === 0 ? 7 : jsDay;
    var days = o.schedules.map(function (x) { return x.day; });
    if (days.indexOf(wd) < 0) {
      badSess.push(sess.id + ' ' + sess.startTime + ' 是星期' + wd + '，但排课在 ' + days.join('/'));
    }
  });
  ok(badSess.length === 0, '全部签到落在教学班的排课星期上',
     badSess.length ? badSess.join(' ; ') : '共 ' + allSess.length + ' 次签到');

  /* 签到不能开在未来 */
  var future = allSess.filter(function (x) {
    return S.parseDateTime(x.startTime) > S._now();
  });
  ok(future.length === 0, '签到日期都不晚于今天',
     future.length ? future.map(function (x) { return x.startTime; }).join(',') : '今天 ' + S.fmtDate(S._now()));

  console.log('\n=== 13. 筛选分档必须能划分全集 ===');
  /* 页面上的「全部 N」和几个分档按钮，加起来必须等于 N。
     曾经漏了「已截止未提交」这一档：全部 6，待提交 4 + 已完成 1 = 5，
     用户一加就发现少了一个。 */
  S.reset();
  var hs = S.homeworkStats('2023001');
  var hwSum = hs.pending + hs.overdue + hs.submitted + hs.graded + hs.closed;
  ok(hwSum === hs.total, '作业分档之和 = 全部',
     hs.pending + '(待提交)+' + hs.overdue + '(逾期)+' + hs.submitted + '(已交)+' +
     hs.graded + '(已批改)+' + hs.closed + '(已截止) = ' + hwSum + ' / 全部 ' + hs.total);

  var catSum = S.statsByCategory().reduce(function (n, c) { return n + c.offerings; }, 0);
  var allOfferings = S.load().offerings.filter(function (o) { return !o.isLab; }).length;
  ok(catSum === allOfferings, '各方向教学班之和 = 全部教学班',
     catSum + ' / ' + allOfferings);

  console.log('\n=== 14. AI 选课推荐 ===');
  S.reset();
  var rec = AI.recommend('2023001');

  ok(rec.items.length > 0, '有推荐结果', rec.items.length + ' 门');

  /* 硬约束的六个分支加起来必须等于全部教学班，否则就是漏了某类课 */
  var parts = rec.stats.enrolled + rec.stats.waitlisted + rec.stats.sameCourse +
              rec.stats.conflict + rec.stats.credit + rec.stats.recommended;
  ok(parts === rec.stats.total, '筛选各分支之和 = 全部教学班',
     rec.stats.enrolled + '(已选)+' + rec.stats.waitlisted + '(候补)+' +
     rec.stats.sameCourse + '(同课)+' + rec.stats.conflict + '(冲突)+' +
     rec.stats.credit + '(超学分)+' + rec.stats.recommended + '(推荐) = ' +
     parts + ' / ' + rec.stats.total);

  /* 推荐里不能出现已经选过的课 */
  var enrolledIds = S.myEnrollments('2023001').map(function (e) { return e.offeringId; });
  var badEnrolled = rec.all.filter(function (it) { return enrolledIds.indexOf(it.offeringId) >= 0; });
  ok(badEnrolled.length === 0, '不会推荐已经选过的课',
     badEnrolled.map(function (x) { return x.offeringId; }).join(',') || '共 ' + enrolledIds.length + ' 门已选');

  /* 也不能推荐跟现有课表冲突的课 */
  var badConflict = rec.all.filter(function (it) { return S.findConflict('2023001', it.offeringId); });
  ok(badConflict.length === 0, '不会推荐与课表冲突的课',
     badConflict.map(function (x) { return x.offeringId; }).join(',') || '已避开 ' + rec.stats.conflict + ' 门冲突课');

  /* 总分必须等于五项之和，否则"评分明细"就是假的 */
  var badSum = rec.all.filter(function (it) {
    var sum = it.breakdown.reduce(function (n, b) { return n + b.delta; }, 0);
    return sum !== it.score;
  });
  ok(badSum.length === 0, '每门课总分 = 各维度得分之和');

  /* 单项不能超过它自己的权重上限 */
  var overMax = [];
  rec.all.forEach(function (it) {
    it.breakdown.forEach(function (b) { if (b.delta > b.max) overMax.push(it.offeringId + '/' + b.label); });
  });
  ok(overMax.length === 0, '单项得分不超过权重上限', overMax.join(',') || '满分 100');

  var sorted = rec.all.every(function (it, i, a) { return i === 0 || a[i - 1].score >= it.score; });
  ok(sorted, '推荐结果按总分降序', rec.all.map(function (x) { return x.score; }).join(' ≥ '));

  /* 同样输入必须得到同样结果，否则演示时每次刷新都在变 */
  var recAgain = AI.recommend('2023001');
  ok(JSON.stringify(recAgain.all.map(function (x) { return x.offeringId + ':' + x.score; })) ===
     JSON.stringify(rec.all.map(function (x) { return x.offeringId + ':' + x.score; })),
     '同样输入结果稳定（可复现）');

  /* 个性化：不同专业的学生，首位推荐应该不一样 */
  var recOther = AI.recommend('2023005');
  ok(recOther.items[0].offeringId !== rec.items[0].offeringId, '不同专业学生首位推荐不同',
     rec.items[0].name + ' ↔ ' + recOther.items[0].name);

  /* 满员课程要给出候补排位，而不是直接判死 */
  var recFull = AI.recommend('2023003');
  var fullOnes = recFull.all.filter(function (it) { return it.full; });
  var capIdx = 3; /* 名额情况在 breakdown 里的下标 */
  ok(fullOnes.length === 0 || fullOnes.every(function (it) { return /候补/.test(it.breakdown[capIdx].detail); }),
     '满员课程在名额维度给出候补排位',
     fullOnes.length ? fullOnes[0].breakdown[capIdx].detail : '本次候选里没有满员课');

  console.log('\n=== 15. 选课轮次不能是过去时间 ===');
  /* 这里踩过坑：轮次写死成 2026-09-30，过了那天整个演示的"选课"全部报
     「本轮选课已结束」，而且只有真跑起来才会发现。 */
  S.reset();
  var round = S.load().enrollRound;
  ok(S.parseDateTime(round.closeAt) > S._now(), '选课截止时间晚于当前时间', round.closeAt);
  ok(S.parseDateTime(round.openAt) <= S._now(), '选课开放时间早于当前时间', round.openAt);

  /* 端到端：推荐出来的课，真的能选上 */
  var topPick = AI.recommend('2023001').items[0];
  var pickRes = await S.selectCourse('2023001', topPick.offeringId);
  ok(pickRes.ok, '推荐第一名的课能真的选上',
     pickRes.ok ? topPick.name + ' / ' + topPick.offeringId : pickRes.reason);
  S.reset();

  console.log('\n=== 16. AI 批改建议（教师侧） ===');
  /* 这套建议的价值全在"可核对"上，所以断言重点不是分数好不好看，
     而是：细则配全了没有、分数加得对不对、给建议会不会偷偷改数据。 */
  S.reset();
  ok(!!G, '评分助手已加载');

  /* 16.1 细则完整性：每份作业都要有 rubric，各维度满分之和 = 作业满分 */
  var rubricIssues = [];
  SEED.assignments.forEach(function (a) {
    var r = G.rubricOf(a.id);
    if (!r) { rubricIssues.push(a.id + ' 缺细则'); return; }
    var sum = r.reduce(function (n, d) { return n + d.max; }, 0);
    if (sum !== a.fullScore) rubricIssues.push(a.id + ' 满分和 ' + sum + '≠' + a.fullScore);
    r.forEach(function (d) {
      var w = d.checks.reduce(function (n, c) { return n + c.w; }, 0);
      if (Math.abs(w - 1) > 1e-9) rubricIssues.push(a.id + '/' + d.label + ' 权重和 ' + w);
    });
  });
  ok(rubricIssues.length === 0, '6 份作业的评分细则完整、权重归一',
     rubricIssues.length ? rubricIssues.join(' ; ') : '各维度满分之和均等于作业满分');

  /* 16.2 分数自洽：建议总分 = 各维度得分之和，且落在 0..100 */
  var sugIssues = [];
  S.load().submissions.forEach(function (sub) {
    var r = G.suggest(sub.id);
    if (!r.ok) { sugIssues.push(sub.id + ' ' + r.reason); return; }
    var sum = r.dimensions.reduce(function (n, d) { return n + d.score; }, 0);
    if (sum !== r.suggested) sugIssues.push(sub.id + ' 总分 ' + r.suggested + '≠各项和 ' + sum);
    if (r.suggested < 0 || r.suggested > 100) sugIssues.push(sub.id + ' 越界 ' + r.suggested);
    if (!r.draftComment) sugIssues.push(sub.id + ' 无评语');
  });
  ok(sugIssues.length === 0, '每条建议的总分都等于各维度之和',
     sugIssues.length ? sugIssues.join(' ; ') : '共 ' + S.load().submissions.length + ' 条提交');

  /* 16.3 区分度：覆盖全部要点的提交，必须明显高于只写一句话的 */
  var goodSug = G.suggest('SUB-3'), badSug = G.suggest('SUB-5');
  ok(goodSug.suggested > badSug.suggested + 30, '写得全的分数明显高于敷衍的',
     goodSug.suggested + ' 分 vs ' + badSug.suggested + ' 分');
  ok(badSug.flags.length > 0 && /完全没有涉及/.test(badSug.flags.join('')),
     '敷衍的提交会被指出漏掉的维度', badSug.flags[0]);

  /* 16.4 空内容不能崩：给 0 分 + 最低置信度 */
  var stTmp = S.load();
  stTmp.submissions.push({
    id: 'SUB-TMP', assignmentId: 'ASG-DAR201-1', studentId: '2023001',
    content: '', fileName: '', submitTime: '2026-09-28 10:00', isLate: false,
    score: null, comment: '', gradedAt: null
  });
  var emptySug = G.suggest('SUB-TMP');
  ok(emptySug.ok && emptySug.suggested === 0, '空内容给 0 分而不是崩溃',
     emptySug.ok ? emptySug.suggested + ' 分' : emptySug.reason);
  ok(emptySug.confidence === 'low', '空内容的置信度是最低档', emptySug.confidence);
  stTmp.submissions.pop();

  /* 16.5 给建议必须是只读的 —— 这条最容易被写崩：顺手把分写进去就全错了 */
  var beforeSnap = JSON.stringify(S.load().submissions.map(function (x) {
    return [x.id, x.score, x.comment, x.gradedBy];
  }));
  G.suggest('SUB-3');
  G.suggest('SUB-8');
  var afterSnap = JSON.stringify(S.load().submissions.map(function (x) {
    return [x.id, x.score, x.comment, x.gradedBy];
  }));
  ok(beforeSnap === afterSnap, '给建议不会改动任何成绩数据');

  /* 16.6 同样输入结果稳定，否则教师每点一次建议分数都在变 */
  ok(JSON.stringify(G.suggest('SUB-8')) === JSON.stringify(G.suggest('SUB-8')),
     '同样输入的建议结果可复现');

  /* 16.7 评语要指向具体维度，不能是"整体不错"这种空话 */
  ok(/「[^」]+」/.test(goodSug.draftComment), '评语引用了具体维度',
     goodSug.draftComment.slice(0, 34) + '…');

  /* 16.8 落库来源标记：这是"AI 不做最终决定"能不能说清的凭据 */
  S.reset();
  S.gradeSubmission('SUB-2', 50, '评语', 'ai-adopted');
  ok(S.getSubmission('SUB-2').gradedBy === 'ai-adopted', '直接采纳记为 ai-adopted');
  S.gradeSubmission('SUB-2', 40, '改过的评语', 'ai-edited');
  ok(S.getSubmission('SUB-2').gradedBy === 'ai-edited', '改后采纳记为 ai-edited');
  S.gradeSubmission('SUB-2', 60, '手写评语');
  ok(S.getSubmission('SUB-2').gradedBy === 'manual', '不传来源默认记 manual');

  /* 16.9 采纳率统计 */
  S.reset();
  var ad0 = G.adoptionStats('ASG-DAR201-1');
  ok(ad0.graded === 1 && ad0.manual === 1 && ad0.adopted === 0,
     '初始 1 份为手工批改', 'AI 参与 ' + ad0.rate + '%');
  S.gradeSubmission('SUB-2', 50, '评语', 'ai-adopted');
  var ad1 = G.adoptionStats('ASG-DAR201-1');
  ok(ad1.graded === 2 && ad1.adopted === 1 && ad1.rate === 50,
     '采纳 1 条后 AI 参与率 = 50%', '手工 ' + ad1.manual + ' / 采纳 ' + ad1.adopted);

  /* 16.10 提交必须落在真实名单里，否则教师端会出现"查无此人" */
  S.reset();
  var stRoster = S.load();
  var orphan = [];
  stRoster.submissions.forEach(function (sub) {
    var a = SEED.assignments.filter(function (x) { return x.id === sub.assignmentId; })[0];
    if (!a) { orphan.push(sub.id + ' 作业不存在'); return; }
    var member = stRoster.enrollments.some(function (e) {
      return e.offeringId === a.offeringId && e.studentId === sub.studentId && e.status === 'selected';
    });
    if (!member) orphan.push(sub.id + ' ' + sub.studentId);
  });
  ok(orphan.length === 0, '每条提交都落在该教学班的真实名单里',
     orphan.length ? orphan.join(' ; ') : '共 ' + stRoster.submissions.length + ' 条');
  S.reset();

  console.log('\n=== 17. 学业预警：规则 ===');
  S.reset();
  W._resetCache();
  var wr = W.evaluate('2023001');
  ok(wr.ok && wr.level !== 'none', '林晓阳触发预警', wr.levelName + ' · ' + wr.score + ' 分');
  ok(wr.signals.some(function (s) { return s.id === 'HW-OVERDUE'; }), '逾期作业被识别',
     wr.metrics.overdue + ' 份');
  ok(wr.metrics.attendanceRate === 100, '出勤满分不触发出勤规则',
     wr.metrics.attendanceRate + '%');

  /* 每条命中的规则都必须能展开到具体记录 —— 否则预警就只是个红点 */
  var noEv = wr.signals.filter(function (s) { return !s.evidence || !s.evidence.length; });
  ok(noEv.length === 0, '每条命中规则都有证据',
     noEv.map(function (s) { return s.label; }).join(',') || '共 ' + wr.signals.length + ' 条');

  var badEv = [];
  wr.signals.forEach(function (s) {
    s.evidence.forEach(function (e) {
      if (e.kind === 'assignment' &&
          !SEED.assignments.some(function (a) { return a.id === e.ref; })) badEv.push(e.ref);
    });
  });
  ok(badEv.length === 0, '作业类证据都指向真实作业', badEv.join(',') || '全部可追溯');

  var sc = W.school();
  var creditHit = sc.ruleHits['CREDIT'] || 0;
  /* 这套种子数据的学分是分档的（20/26/32/38/44）。阈值如果只用绝对值，
     会把整档学生一次性标出来；双阈值的作用就是把命中率压下来。 */
  ok(creditHit / sc.total < 0.3, '学分规则命中率 < 30%（双阈值没整档误伤）',
     creditHit + ' / ' + sc.total + ' = ' + Math.round(creditHit / sc.total * 100) + '%');

  var distSum = sc.dist.none + sc.dist.watch + sc.dist.warn + sc.dist.critical;
  ok(distSum === sc.total, '四档之和 = 学生总数', distSum + ' / ' + sc.total);
  ok(sc.rows.length === sc.total - sc.dist.none, '名单条数 = 非正常人数',
     sc.rows.length + ' 条');

  var sorted = true;
  for (var wi = 1; wi < sc.rows.length; wi++) {
    var pa = sc.rows[wi - 1], pb = sc.rows[wi];
    var ra = W.levelOf(pa.level).rank, rb = W.levelOf(pb.level).rank;
    if (ra < rb || (ra === rb && pa.score < pb.score)) sorted = false;
  }
  ok(sorted, '名单按等级、风险分降序');
  ok(sc.rows.every(function (r) { return r.score >= 0 && r.score <= 100; }),
     '风险分都落在 0-100');

  console.log('\n=== 18. 学业预警：生命周期 ===');
  S.reset();
  var rc1 = W.reconcile('2023001');
  ok(rc1.created.length > 0, '首次重算生成预警', rc1.created.length + ' 条');
  var rc2 = W.reconcile('2023001');
  ok(rc2.created.length === 0 && rc2.updated.length === 0, '重复重算不重复生成',
     '新建 ' + rc2.created.length + ' / 更新 ' + rc2.updated.length);

  var w0 = W.activeWarningsOf('2023001')[0];
  var itvRes = W.intervene(w0.id, '已电话联系，学生承诺 3 天内补齐', 'reminder');
  ok(itvRes.ok && W.activeWarningsOf('2023001')[0].status === 'intervening',
     '干预后状态转为 intervening');
  ok(W.evaluate('2023001').level !== 'none',
     '干预本身不会消掉预警（必须靠重算）', W.evaluate('2023001').levelName);

  /* 补齐逾期作业后，规则不再命中，预警应当自动解除 */
  var stFix = S.load();
  S.myAssignmentList('2023001').forEach(function (x) {
    if (x.status !== 'overdue' && x.status !== 'closed') return;
    if (stFix.submissions.some(function (z) {
      return z.assignmentId === x.assignment.id && z.studentId === '2023001';
    })) return;
    stFix.submissions.push({
      id: 'SUB-FIX-' + x.assignment.id, assignmentId: x.assignment.id, studentId: '2023001',
      content: '补齐提交', fileName: '补交.zip', fileSize: 1024,
      submitTime: '2026-10-20 10:00', isLate: true,
      score: 70, comment: '补交', gradedAt: '2026-10-21 10:00'
    });
  });
  S.save();
  var rc3 = W.reconcile('2023001');
  ok(rc3.resolved.length > 0, '补齐作业后自动解除',
     rc3.resolved.map(function (w) { return w.label; }).join(',') || '无');
  ok(W.evaluate('2023001').level === 'none', '解除后等级回到正常',
     W.evaluate('2023001').levelName);
  ok(rc3.resolved.every(function (w) { return !!w.resolvedReason; }), '解除必须写明原因');

  console.log('\n=== 19. 学业预警：教师端名单 ===');
  S.reset();
  var ros = W.roster('DAR201-01');
  var rosTotal = S.rosterOf('DAR201-01').length;
  ok(ros.every(function (r) { return r.level !== 'none'; }), '名单只含有预警的学生',
     ros.length + ' / ' + rosTotal + ' 人');
  ok(ros.length <= rosTotal, '名单不会超出班级人数');
  S.reset();

  console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
  process.exit(fail === 0 ? 0 : 1);
})();
