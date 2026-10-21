/* store.js / data.js 逻辑自测（node 直接跑，不依赖 DOM） */
globalThis.window = globalThis;
require(require('path').join(__dirname,'assets','data.js'));
require(require('path').join(__dirname,'assets','store.js'));
require(require('path').join(__dirname,'assets','ai.js'));

var S = globalThis.Store;
var AI = globalThis.AI;
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
  ok(ov.hwRate > 0 && ov.hwRate < 0.2, '作业提交率偏低（符合演示初始状态）',
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

  console.log('\n' + (fail === 0 ? '全部通过 ✅' : fail + ' 项失败 ❌'));
  process.exit(fail === 0 ? 0 : 1);
})();
