/* ===========================================================
 * data.js — 种子数据（纯数据，不依赖 DOM，可用 node 直接加载）
 * 演示用：4 个课程方向 / 16 门课程 / 6 位教师 / 排课 / 作业 / 公告
 * =========================================================== */
(function (global) {
  'use strict';

  /* 课程方向 */
  var CATEGORIES = [
    { id: 'dar', name: '数字建筑', short: '数建', desc: '参数化设计、BIM 协同与数字化建造' },
    { id: 'arc', name: '建筑设计', short: '建筑', desc: '空间设计基础、设计方法与城市设计' },
    { id: 'icb', name: '智能建造', short: '智造', desc: '施工智能化、建筑机器人与装配式' },
    { id: 'scg', name: '空间计算与图形学', short: '空间', desc: '图形学基础、三维重建与空间交互' }
  ];

  /* 教师 */
  var TEACHERS = [
    { id: 'T01', name: '张明远', title: '教授', dept: '建筑与城市规划学院' },
    { id: 'T02', name: '李文倩', title: '副教授', dept: '建筑与城市规划学院' },
    { id: 'T03', name: '王浩然', title: '讲师', dept: '土木与智能建造学院' },
    { id: 'T04', name: '陈思远', title: '教授', dept: '土木与智能建造学院' },
    { id: 'T05', name: '刘雨桐', title: '副教授', dept: '数字媒体与空间信息学院' },
    { id: 'T06', name: '赵建国', title: '讲师', dept: '数字媒体与空间信息学院' }
  ];

  /* 课程本体（course）—— 与"开课"（offering）分开 */
  var COURSES = [
    { code: 'DAR101', name: '参数化设计基础', cat: 'dar', credit: 2, hours: 32, type: '专业选修',
      intro: '以 Grasshopper 为载体，讲授参数化思维、数据结构与几何生成逻辑，完成一个小型生成式立面设计。' },
    { code: 'DAR201', name: 'BIM 建模与协同', cat: 'dar', credit: 3, hours: 48, type: '专业必修',
      intro: '基于 Revit 建立建筑信息模型，讲授工作集协同、链接模型、碰撞检查与工程量统计。' },
    { code: 'DAR202', name: '建筑性能模拟', cat: 'dar', credit: 2, hours: 32, type: '专业选修',
      intro: '日照、风环境、能耗与声环境的模拟分析方法，用数据驱动方案比选。' },
    { code: 'DAR301', name: '数字建造工作营', cat: 'dar', credit: 2, hours: 32, type: '实践环节',
      intro: '集中工作营形式，从数字模型到实体构件加工，完成一次 1:1 建造实践。' },
    { code: 'ARC101', name: '建筑设计初步', cat: 'arc', credit: 4, hours: 64, type: '专业必修',
      intro: '设计入门课程，从空间感知、人体尺度到小型建筑方案，训练图解思考与表达。' },
    { code: 'ARC201', name: '居住建筑设计', cat: 'arc', credit: 3, hours: 48, type: '专业必修',
      intro: '住宅套型设计、居住组团与住区规划，关注日照间距与居住行为。' },
    { code: 'ARC202', name: '公共建筑设计', cat: 'arc', credit: 3, hours: 48, type: '专业必修',
      intro: '以文化馆、社区中心为载体，讲授流线组织、大空间结构与公共性表达。' },
    { code: 'ARC301', name: '城市设计概论', cat: 'arc', credit: 2, hours: 32, type: '专业选修',
      intro: '城市形态、公共空间与街道界面，建立中观尺度的设计判断力。' },
    { code: 'ICB101', name: '智能施工技术', cat: 'icb', credit: 3, hours: 48, type: '专业必修',
      intro: '智慧工地、施工进度模拟、质量安全智能监测与数字化交付。' },
    { code: 'ICB201', name: '建筑机器人与自动化', cat: 'icb', credit: 2, hours: 32, type: '专业选修',
      intro: '建筑机器人的运动学基础、路径规划与现场应用（砌筑、喷涂、焊接）。' },
    { code: 'ICB202', name: '装配式建筑构造', cat: 'icb', credit: 2, hours: 32, type: '专业选修',
      intro: '预制构件拆分、节点连接构造与装配式施工组织。' },
    { code: 'ICB301', name: '工程物联网与监测', cat: 'icb', credit: 3, hours: 48, type: '专业选修',
      intro: '传感器布设、结构健康监测与施工期数据采集分析。' },
    { code: 'SCG101', name: '计算机图形学基础', cat: 'scg', credit: 3, hours: 48, type: '专业必修',
      intro: '光栅化管线、几何变换、着色模型与纹理映射，动手实现一个简易渲染器。' },
    { code: 'SCG201', name: '三维空间建模与重建', cat: 'scg', credit: 3, hours: 48, type: '专业必修',
      intro: '点云处理、网格重建与语义分割，面向建筑与城市的三维数字化。' },
    { code: 'SCG202', name: '实时渲染技术', cat: 'scg', credit: 2, hours: 32, type: '专业选修',
      intro: '基于 WebGL / Three.js 的实时渲染，包含 PBR 材质、阴影与后期处理。' },
    { code: 'SCG301', name: '增强现实空间交互', cat: 'scg', credit: 2, hours: 32, type: '专业选修',
      intro: 'AR 空间锚定、手势与视线交互设计，在真实空间中叠加建筑信息。' }
  ];

  /* 排课助手：星期 day(1-7)、节次 start-end(1-12)、周次区间、周类型 */
  function sch(day, start, end, room, ws, we, weekType) {
    return { day: day, start: start, end: end, room: room,
             weekStart: ws == null ? 1 : ws, weekEnd: we == null ? 16 : we,
             weekType: weekType || 'all' };
  }

  /* 开课（course_offering）—— 选课 / 签到 / 作业全部挂在这一层 */
  var OFFERINGS = [
    { id: 'DAR101-01', code: 'DAR101', teacherId: 'T01', capacity: 40, selectedCount: 37, status: 'open',
      schedules: [sch(1, 1, 2, '建筑馆 A201'), sch(3, 3, 4, '建筑馆 A201')] },
    { id: 'DAR201-01', code: 'DAR201', teacherId: 'T01', capacity: 35, selectedCount: 31, status: 'open',
      schedules: [sch(2, 3, 4, '数字建造实验室 B104'), sch(4, 5, 6, '数字建造实验室 B104')] },
    { id: 'DAR202-01', code: 'DAR202', teacherId: 'T02', capacity: 30, selectedCount: 12, status: 'open',
      schedules: [sch(5, 5, 6, '建筑馆 A305')] },
    { id: 'DAR301-01', code: 'DAR301', teacherId: 'T03', capacity: 20, selectedCount: 20, status: 'full',
      schedules: [sch(6, 1, 4, '建造工坊 C101', 9, 16)] },
    { id: 'ARC101-01', code: 'ARC101', teacherId: 'T02', capacity: 45, selectedCount: 44, status: 'open',
      schedules: [sch(1, 3, 4, '设计教室 D201'), sch(3, 1, 2, '设计教室 D201')] },
    { id: 'ARC201-01', code: 'ARC201', teacherId: 'T02', capacity: 30, selectedCount: 18, status: 'open',
      schedules: [sch(2, 1, 2, '设计教室 D203'), sch(4, 3, 4, '设计教室 D203')] },
    { id: 'ARC202-01', code: 'ARC202', teacherId: 'T06', capacity: 30, selectedCount: 25, status: 'open',
      schedules: [sch(3, 5, 6, '设计教室 D205'), sch(5, 1, 2, '设计教室 D205')] },
    { id: 'ARC301-01', code: 'ARC301', teacherId: 'T06', capacity: 60, selectedCount: 33, status: 'open',
      schedules: [sch(4, 7, 8, '建筑馆报告厅')] },
    { id: 'ICB101-01', code: 'ICB101', teacherId: 'T03', capacity: 40, selectedCount: 22, status: 'open',
      schedules: [sch(1, 5, 6, '土木楼 E102'), sch(3, 7, 8, '土木楼 E102')] },
    { id: 'ICB201-01', code: 'ICB201', teacherId: 'T04', capacity: 25, selectedCount: 24, status: 'open',
      schedules: [sch(2, 5, 6, '机器人实验室 E401')] },
    { id: 'ICB202-01', code: 'ICB202', teacherId: 'T04', capacity: 30, selectedCount: 9, status: 'open',
      schedules: [sch(5, 3, 4, '土木楼 E205')] },
    { id: 'ICB301-01', code: 'ICB301', teacherId: 'T03', capacity: 30, selectedCount: 16, status: 'open',
      schedules: [sch(2, 7, 8, '土木楼 E108'), sch(4, 1, 2, '土木楼 E108')] },
    { id: 'SCG101-01', code: 'SCG101', teacherId: 'T05', capacity: 50, selectedCount: 41, status: 'open',
      schedules: [sch(1, 7, 8, '信息楼 F301'), sch(3, 5, 6, '信息楼 F301')] },
    /* ↓ 故意与 DAR201-01 周二 3-4 节冲突，用于演示冲突检测 */
    { id: 'SCG201-01', code: 'SCG201', teacherId: 'T05', capacity: 30, selectedCount: 27, status: 'open',
      schedules: [sch(2, 3, 4, '信息楼 F305')] },
    /* ↓ 故意与 DAR201-01 周四 5-6 节冲突 */
    { id: 'SCG202-01', code: 'SCG202', teacherId: 'T06', capacity: 25, selectedCount: 11, status: 'open',
      schedules: [sch(4, 5, 6, '信息楼 F302')] },
    { id: 'SCG301-01', code: 'SCG301', teacherId: 'T05', capacity: 20, selectedCount: 6, status: 'open',
      schedules: [sch(5, 7, 8, '信息楼 F308')] }
  ];

  /* 学生：前 6 位是具名学生（用于演示登录与个人中心） */
  var STUDENTS = [
    { id: '2023001', name: '林晓阳', major: '建筑学', grade: '2023', className: '建筑 2301', earnedCredit: 42, password: '123456' },
    { id: '2023002', name: '周雨薇', major: '建筑学', grade: '2023', className: '建筑 2301', earnedCredit: 40, password: '123456' },
    { id: '2023003', name: '高子豪', major: '土木工程', grade: '2023', className: '土木 2302', earnedCredit: 44, password: '123456' },
    { id: '2023004', name: '孙一诺', major: '智能建造', grade: '2023', className: '智造 2301', earnedCredit: 38, password: '123456' },
    { id: '2023005', name: '许清和', major: '数字媒体技术', grade: '2023', className: '数媒 2301', earnedCredit: 41, password: '123456' },
    { id: '2023006', name: '郑亦辰', major: '建筑学', grade: '2024', className: '建筑 2402', earnedCredit: 20, password: '123456' }
  ];

  /* 选课池：自动生成 84 名学生，用来把每门课的"已选人数"填成真实的名单行。
     没有它的话，selectedCount 只是个数，教师端名单会是空的。 */
  var SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡',
                  '郭', '何', '林', '高', '罗', '郑', '梁', '谢', '宋', '唐', '许', '邓', '冯', '韩', '曹',
                  '曾', '彭', '萧', '蔡', '潘', '田', '董', '袁', '于', '余'];
  var GIVENS = ['子轩', '雨桐', '思远', '浩然', '亦辰', '一诺', '清和', '梓涵', '若曦', '嘉懿', '文博', '宇轩',
                '欣怡', '诗涵', '博文', '明轩', '梦琪', '佳怡', '泽宇', '雨欣', '俊杰', '语桐', '晨曦', '天佑',
                '雅静', '逸凡', '瑞霖', '书瑶', '皓轩', '静怡', '振宇', '婉清'];
  var MAJORS = [
    { major: '建筑学', cls: '建筑' },
    { major: '土木工程', cls: '土木' },
    { major: '智能建造', cls: '智造' },
    { major: '数字媒体技术', cls: '数媒' },
    { major: '城乡规划', cls: '规划' }
  ];
  var STUDENT_POOL = [];
  (function () {
    for (var i = 0; i < 84; i++) {
      var m = MAJORS[i % MAJORS.length];
      var grade = (i % 3 === 0) ? '2022' : '2023';
      STUDENT_POOL.push({
        id: '2023' + ('0' + (10 + i)).slice(-3),
        name: SURNAMES[i % SURNAMES.length] + GIVENS[(i * 7 + 3) % GIVENS.length],
        major: m.major,
        grade: grade,
        className: m.cls + ' ' + grade.slice(2) + '0' + (1 + (i % 3)),
        earnedCredit: 20 + (i % 5) * 6,
        password: '123456'
      });
    }
  })();

  /* 当前演示用户（林晓阳）已选课程：与 SCG201 / SCG202 构成时间冲突 */
  var MY_ENROLLMENTS = ['DAR201-01', 'ARC101-01', 'ICB101-01', 'SCG101-01'];

  /* 作业 */
  var ASSIGNMENTS = [
    { id: 'ASG-DAR201-1', offeringId: 'DAR201-01', title: 'BIM 模型建立与碰撞检查',
      desc: '按任务书完成三层办公楼建筑模型，导出碰撞检查报告（PDF），提交 rvt 源文件与报告。',
      publishAt: '2026-09-10 09:00', deadline: '2026-09-28 23:59', fullScore: 100, allowLate: true },
    { id: 'ASG-DAR201-2', offeringId: 'DAR201-01', title: '协同工作集与链接模型',
      desc: '两人一组，完成工作集划分与中心文件同步，提交协同过程截图与反思 500 字。',
      publishAt: '2026-09-20 09:00', deadline: '2026-10-08 23:59', fullScore: 100, allowLate: true },
    { id: 'ASG-SCG101-1', offeringId: 'SCG101-01', title: '光栅化渲染管线实现',
      desc: '用任意语言实现三角形光栅化 + Z-buffer + Phong 着色，提交源码与渲染结果图。',
      publishAt: '2026-09-01 09:00', deadline: '2026-09-20 23:59', fullScore: 100, allowLate: false },
    { id: 'ASG-SCG101-2', offeringId: 'SCG101-01', title: '纹理映射与透视校正',
      desc: '在作业一的基础上加入纹理映射，并说明透视校正插值的原理。',
      publishAt: '2026-09-18 09:00', deadline: '2026-10-15 23:59', fullScore: 100, allowLate: true },
    { id: 'ASG-ARC101-1', offeringId: 'ARC101-01', title: '居住单元空间分析',
      desc: '选取一个真实住宅套型，绘制行为流线与空间尺度分析图，A3 图幅 2 张。',
      publishAt: '2026-09-15 09:00', deadline: '2026-10-12 23:59', fullScore: 100, allowLate: true },
    { id: 'ASG-ICB101-1', offeringId: 'ICB101-01', title: '施工进度模拟报告',
      desc: '使用 Navisworks 或同类工具完成 4D 进度模拟，提交模拟视频与不少于 800 字的分析报告。',
      publishAt: '2026-09-12 09:00', deadline: '2026-10-05 23:59', fullScore: 100, allowLate: true }
  ];

  /* 已提交的作业（林晓阳已交作业一，并已批改） */
  var SUBMISSIONS = [
    { id: 'SUB-1', assignmentId: 'ASG-DAR201-1', studentId: '2023001', content: '模型已完成，碰撞检查共发现 12 处硬碰撞，主要集中在机电与结构梁交叉位置，已在报告中逐条标注。',
      fileName: 'BIM模型_林晓阳.rar', fileSize: 18432000, submitTime: '2026-09-25 21:14', isLate: false,
      score: 82, comment: '模型完整度高，碰撞问题定位准确。机电管线综合排布部分略显粗糙，扣分主要在此，下次注意净高控制。',
      gradedAt: '2026-09-26 10:30' },
    { id: 'SUB-2', assignmentId: 'ASG-DAR201-1', studentId: '2023002', content: '完成了模型建立与碰撞检查，共 9 处冲突。',
      fileName: '周雨薇_BIM作业.zip', fileSize: 9120000, submitTime: '2026-09-28 22:40', isLate: false,
      score: null, comment: '', gradedAt: null }
  ];

  /* 历史签到记录（DAR201-01 两次 + SCG101-01 一次）
     ⚠️ 日期必须落在该教学班的排课星期上，否则会出现
        「课表里写周二有课，签到记录却在周五」这种自相矛盾：
        DAR201-01 = 周二 3-4 节 / 周四 5-6 节
        SCG101-01 = 周一 7-8 节 / 周三 5-6 节
     2026-09-24 是周四，所以下面的日期分别是 周四 / 周二 / 周一。
     selftest.js 第 12 节有断言守着这条不变量。 */
  var PAST_SESSIONS = [
    { id: 'SES-H1', offeringId: 'DAR201-01', teacherId: 'T01', code: '314159',
      startTime: '2026-09-17 14:00', endTime: '2026-09-17 14:20', status: 'closed',
      records: [
        { studentId: '2023001', checkTime: '2026-09-17 14:03', status: 'present' },
        { studentId: '2023002', checkTime: '2026-09-17 14:15', status: 'late' }
      ] },
    { id: 'SES-H2', offeringId: 'DAR201-01', teacherId: 'T01', code: '271828',
      startTime: '2026-09-22 10:00', endTime: '2026-09-22 10:20', status: 'closed',
      records: [
        { studentId: '2023001', checkTime: '2026-09-22 10:02', status: 'present' },
        { studentId: '2023002', checkTime: '2026-09-22 10:04', status: 'present' }
      ] },
    { id: 'SES-H3', offeringId: 'SCG101-01', teacherId: 'T05', code: '161803',
      startTime: '2026-09-21 16:00', endTime: '2026-09-21 16:20', status: 'closed',
      records: [
        { studentId: '2023001', checkTime: '2026-09-21 16:06', status: 'present' }
      ] }
  ];

  /* 公告 / 消息 */
  var MESSAGES = [
    { id: 'MSG-1', type: 'system', title: '2026 秋季学期选课已开放', time: '2026-09-20 08:00', read: false,
      body: '本轮选课时间为 9 月 20 日 08:00 至 9 月 30 日 23:59，最多可选 30 学分，允许时间冲突的课程不可同时选中。请及时完成选课。' },
    { id: 'MSG-2', type: 'course', title: '【BIM 建模与协同】本周三改为线上授课', time: '2026-09-23 16:20', read: false,
      body: '因实验室设备检修，本周三第 3-4 节《BIM 建模与协同》改为线上进行，会议链接见课程资料区。' },
    { id: 'MSG-3', type: 'homework', title: '作业即将截止：BIM 模型建立与碰撞检查', time: '2026-09-26 09:00', read: false,
      body: '《BIM 建模与协同》的作业「BIM 模型建立与碰撞检查」将于 2026-09-28 23:59 截止，请及时提交。' },
    { id: 'MSG-4', type: 'grade', title: '作业已批改：BIM 模型建立与碰撞检查 82 分', time: '2026-09-26 10:30', read: true,
      body: '教师已批改你的作业，得分 82 分。评语：模型完整度高，碰撞问题定位准确。' }
  ];

  global.SEED = {
    term: '2026-2027 学年 第一学期',
    termKey: '2026F',
    maxCredit: 30,
    weeks: 16,
    categories: CATEGORIES,
    teachers: TEACHERS,
    courses: COURSES,
    offerings: OFFERINGS,
    students: STUDENTS.concat(STUDENT_POOL),
    demoStudents: STUDENTS,
    myEnrollments: MY_ENROLLMENTS,
    assignments: ASSIGNMENTS,
    submissions: SUBMISSIONS,
    pastSessions: PAST_SESSIONS,
    messages: MESSAGES
  };
})(typeof window !== 'undefined' ? window : globalThis);
