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
    { id: 'SUB-2', assignmentId: 'ASG-DAR201-1', studentId: '2023070', content: '完成了模型建立与碰撞检查，共 9 处冲突。',
      fileName: '郑梓涵_BIM作业.zip', fileSize: 9120000, submitTime: '2026-09-28 22:40', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* ---- 以下为其他作业的提交，用于演示教师端批改与 AI 建议 ----
       质量刻意拉开档次：有的覆盖全部要点，有的漏了一整个维度，
       这样 AI 建议的区分度才看得出来，而不是每份都 80 分。 */

    /* 光栅化：手写管线，几乎覆盖全部要点 */
    { id: 'SUB-3', assignmentId: 'ASG-SCG101-1', studentId: '2023046',
      content: '用 C++ 实现了完整的软件光栅化管线。三角形遍历采用包围盒加重心坐标判定，屏幕空间插值时用重心坐标对顶点属性做线性插值。深度测试使用 Z-buffer，逐像素比较深度值决定遮挡关系。着色实现了 Phong 光照模型，包含法线插值与漫反射计算，效果见 result.png。源码在 src 目录，执行 make 即可编译运行，输出 800x600 的 Cornell Box 场景。',
      fileName: 'rasterizer_2023046.zip', fileSize: 268000, submitTime: '2026-09-20 21:14', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 光栅化：做了但没写清插值与交付 */
    { id: 'SUB-4', assignmentId: 'ASG-SCG101-1', studentId: '2023047',
      content: '实现了三角形光栅化和 Z-buffer 深度测试，用 Phong 模型做光照，效果还不错。代码在 main.cpp 里。',
      fileName: 'main.cpp', fileSize: 18400, submitTime: '2026-09-20 23:31', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 光栅化：误解了题目，调库而非手写 —— AI 应该能指出来 */
    { id: 'SUB-5', assignmentId: 'ASG-SCG101-1', studentId: '2023048',
      content: '用 OpenGL 画了个三角形，光栅化应该是自动的，效果图见附件。',
      fileName: 'triangle.png', fileSize: 96000, submitTime: '2026-09-19 15:02', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 纹理映射：原理写清楚了，交付略欠 */
    { id: 'SUB-6', assignmentId: 'ASG-SCG101-2', studentId: '2023049',
      content: '在作业一的基础上加入纹理映射。UV 坐标由顶点属性插值得到，采样时用双线性滤波减少锯齿。透视校正的关键在于屏幕空间的插值参数不能直接线性插值：屏幕坐标是投影后除以 w 得到的，因此 1/w 在屏幕空间是线性的，正确做法是插值 u/w 与 1/w，最后再相除还原。实现上对每个像素计算 1/w 并用它加权纹理坐标，结果见 texture.png，与未校正版本对比可见远处纹理明显拉伸。',
      fileName: 'texture_2023049.zip', fileSize: 412000, submitTime: '2026-10-14 20:18', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 纹理映射：只有结论，没有原理 */
    { id: 'SUB-7', assignmentId: 'ASG-SCG101-2', studentId: '2023050',
      content: '加了纹理映射，用 UV 坐标采样图片。透视校正也做了，远处看起来没那么歪了。',
      fileName: 'hw2.zip', fileSize: 154000, submitTime: '2026-10-15 23:12', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 空间分析：数据扎实 */
    { id: 'SUB-8', assignmentId: 'ASG-ARC101-1', studentId: '2023025',
      content: '选取杭州市拱墅区某 89 平方米住宅套型（三居室）作为分析对象，实测套内面积 76 平方米。绘制了起居、烹饪、就寝、盥洗四条行为流线，发现入户玄关处烹饪流线与就寝流线存在交叉，晚餐时段干扰明显。尺度分析对照人体工程学数据：厨房操作台进深 600mm、走道净宽 900mm，均满足规范但偏紧；客厅沙发与电视墙间距 2800mm，略小于推荐的 3000mm。成果为 A3 图幅两张，含流线图与尺度分析图，均标注比例 1:50 与指北针。',
      fileName: '空间分析_2023025.pdf', fileSize: 8420000, submitTime: '2026-10-11 22:40', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 空间分析：只说了做了什么，没有数据 */
    { id: 'SUB-9', assignmentId: 'ASG-ARC101-1', studentId: '2023026',
      content: '选了一个三居室做流线分析，画了行为流线和尺度分析图，发现厨房和卧室的流线有点冲突，已经用图表达出来了。',
      fileName: '分析图.pdf', fileSize: 6200000, submitTime: '2026-10-12 19:05', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 进度模拟：明显短于 800 字要求 */
    { id: 'SUB-10', assignmentId: 'ASG-ICB101-1', studentId: '2023060',
      content: '使用 Navisworks 完成 4D 进度模拟。把模型按施工段导入，绑定了 120 天的进度计划，工序按基础、主体、装饰三段流水组织，关键路径在主体结构第 45 天到第 78 天。模拟视频已提交。分析发现主体阶段塔吊占用与材料进场存在冲突，建议把二次结构提前 5 天插入，可缩短总工期约 3 天。',
      fileName: '4D模拟_2023060.mp4', fileSize: 48200000, submitTime: '2026-10-05 21:30', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 进度模拟：几乎没有分析 */
    { id: 'SUB-11', assignmentId: 'ASG-ICB101-1', studentId: '2023061',
      content: '用 Navisworks 做了 4D 模拟，视频在附件里。',
      fileName: 'sim.mp4', fileSize: 21000000, submitTime: '2026-10-05 23:47', isLate: false,
      score: null, comment: '', gradedAt: null },

    /* 协同工作集：过程完整、有反思 */
    { id: 'SUB-12', assignmentId: 'ASG-DAR201-2', studentId: '2023047',
      content: '两人一组完成，我负责建筑专业建模，搭档负责机电。工作集按专业拆成建筑、结构、机电三个，命名统一为专业_楼层_构件类型。中心文件放在服务器共享目录，每天收工前同步一次。过程中出现过两次冲突：一次是机电风管穿过我做的梁，借用权限后被搭档改回，我们约定梁上开洞必须先在工作集里登记；另一次是同步时我的本地文件被覆盖，原因是没先 relinquish 就关闭了模型，重做了一版。反思：协同前应该先定好构件归属规则，否则两个人会在同一构件上反复借用，效率很低。这次最大的收获是理解了工作集不是文件夹，而是权限边界。',
      fileName: '协同记录_2023047.pdf', fileSize: 3200000, submitTime: '2026-10-08 20:12', isLate: false,
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

  /* 培养方案 —— 学分预警的基准。
     total 取 64，不是常见的 160：这套种子数据里学生已修 20-44 学分、
     前 4 学期已结算（每学期 5-11 学分），按 160 算所有人都"毕不了业"，
     预警就失去区分度。64 = 年级中位 32 × 2（前 4 学期 × 后 4 学期），
     即"按年级中位速度刚好毕业"，只有真的落后才会被标出来。 */
  var PLAN = {
    name: '建筑学（四年制）2023 级培养方案',
    total: 64,
    terms: 8,
    passedTerm: 4
  };

  /* 学业干预记录 —— 预警生命周期里的"人做过什么"。
     没有这张表，预警就只是个红点；有了它，才能看出"提醒过但没有效"还是"约谈后好转"。 */
  var INTERVENTIONS = [
    { id: 'ITV-1', studentId: '2023001', ruleId: 'R3', type: 'reminder',
      at: '2026-10-08 15:20', by: 'T01', byName: '张明远',
      note: '已发送提醒：4 份作业逾期，要求 10 月 15 日前补齐，逾期部分按迟交计分。',
      result: 'pending' },
    { id: 'ITV-2', studentId: '2023006', ruleId: 'R7', type: 'meeting',
      at: '2026-10-10 10:00', by: 'T01', byName: '张明远',
      note: '已约谈。学生说明上学期因实习缺课，同意本学期补修两门专业必修。',
      result: 'agreed' }
  ];

  /* 作业评分细则（rubric）
     AI 批改建议完全基于这张表打分：每个 check 命中与否都会在界面上逐条列出，
     所以建议分数是可核对的，不是"模型猜的"。
     check 支持三种写法：
       any: [...]      命中任意一个关键词即得分
       minChars: N     去标点后的字数 ≥ N 才得分
       needDigit: true 出现阿拉伯数字才得分（有无具体数据支撑）
     同一维度内各 check 的 w 之和为 1。 */
  var RUBRICS = {
    'ASG-DAR201-1': [
      { label: '模型成果', max: 30, checks: [
        { w: .4, any: ['模型', '建模'], detail: '模型成果说明' },
        { w: .3, any: ['完成', '建好', '搭建', '导出'], detail: '建模完成情况' },
        { w: .3, any: ['三层', '办公楼', '任务书'], detail: '对齐任务书要求（三层办公楼）' }
      ] },
      { label: '碰撞检查', max: 30, checks: [
        { w: .4, any: ['碰撞', '冲突'], detail: '碰撞检查结果' },
        { w: .3, needDigit: true, detail: '给出碰撞数量等具体数据' },
        { w: .3, any: ['位置', '交叉', '梁', '管', '机电'], detail: '具体构件或位置' }
      ] },
      { label: '交付与报告', max: 25, checks: [
        { w: .4, any: ['报告'], detail: '碰撞检查报告' },
        { w: .3, any: ['附件', '提交', 'rvt', 'pdf', '文件'], detail: '交付物（源文件 / 报告）' },
        { w: .3, any: ['逐条', '标注', '说明', '整理'], detail: '问题的逐条说明' }
      ] },
      { label: '表达规范', max: 15, checks: [
        { w: .5, minChars: 40, detail: '内容篇幅（40 字以上）' },
        { w: .3, needDigit: true, detail: '具体数据支撑' },
        { w: .2, any: ['。', '，'], detail: '完整的语句' }
      ] }
    ],

    'ASG-DAR201-2': [
      { label: '工作集划分', max: 30, checks: [
        { w: .5, any: ['工作集'], detail: '工作集（Workset）' },
        { w: .3, any: ['划分', '分配', '拆分'], detail: '划分方式' },
        { w: .2, any: ['专业', '机电', '结构', '建筑'], detail: '按专业或构件分工' }
      ] },
      { label: '中心文件同步', max: 30, checks: [
        { w: .4, any: ['中心文件', 'central'], detail: '中心文件' },
        { w: .3, any: ['同步', '链接', '更新'], detail: '同步或链接' },
        { w: .3, any: ['冲突', '覆盖', '权限', '借用'], detail: '同步冲突或权限处理' }
      ] },
      { label: '过程记录', max: 20, checks: [
        { w: .5, any: ['截图', '过程'], detail: '协同过程记录' },
        { w: .3, any: ['两人', '分工', '小组', '搭档'], detail: '两人分工' },
        { w: .2, any: ['问题', '解决', '调整'], detail: '遇到的问题' }
      ] },
      { label: '反思深度', max: 20, checks: [
        { w: .5, minChars: 300, detail: '反思篇幅（300 字以上）' },
        { w: .3, any: ['反思', '收获', '不足', '改进'], detail: '反思与改进方向' },
        { w: .2, needDigit: true, detail: '具体细节' }
      ] }
    ],

    'ASG-SCG101-1': [
      { label: '光栅化', max: 30, checks: [
        { w: .5, any: ['光栅化', 'raster'], detail: '光栅化实现' },
        { w: .3, any: ['三角形', '遍历', '包围盒'], detail: '三角形遍历方式' },
        { w: .2, any: ['插值', '重心', '重心坐标'], detail: '属性插值' }
      ] },
      { label: 'Z-buffer', max: 25, checks: [
        { w: .6, any: ['z-buffer', 'zbuffer', '深度缓冲', '深度测试', '深度缓存'], detail: '深度缓冲' },
        { w: .4, any: ['遮挡', '可见性', '前后'], detail: '遮挡关系处理' }
      ] },
      { label: 'Phong 着色', max: 25, checks: [
        { w: .4, any: ['phong'], detail: 'Phong 着色' },
        { w: .4, any: ['法线', '光照', '高光', '漫反射'], detail: '法线与光照计算' },
        { w: .2, any: ['环境光', '镜面', '衰减'], detail: '环境光 / 镜面反射' }
      ] },
      { label: '交付完整度', max: 20, checks: [
        { w: .4, any: ['源码', '代码'], detail: '源码' },
        { w: .3, any: ['结果图', '截图', '渲染图'], detail: '渲染结果' },
        { w: .3, any: ['可运行', '编译', '说明', '运行'], detail: '运行方式' }
      ] }
    ],

    'ASG-SCG101-2': [
      { label: '纹理映射', max: 30, checks: [
        { w: .5, any: ['纹理', '贴图'], detail: '纹理映射' },
        { w: .3, any: ['uv', '坐标'], detail: 'UV 坐标' },
        { w: .2, any: ['采样', '滤波', '双线性'], detail: '采样 / 滤波方式' }
      ] },
      { label: '透视校正原理', max: 35, checks: [
        { w: .4, any: ['透视校正', 'perspective correct', 'perspective-correct'], detail: '透视校正' },
        { w: .3, any: ['1/w', '除以 w', '齐次', '深度倒数'], detail: '给出正确的数学依据' },
        { w: .3, any: ['原理', '为什么', '推导', '证明'], detail: '校正必要性的解释' }
      ] },
      { label: '实现质量', max: 20, checks: [
        { w: .5, any: ['代码', '实现', '源码'], detail: '可读的实现' },
        { w: .3, any: ['结果', '截图', '效果'], detail: '运行结果' },
        { w: .2, any: ['性能', '优化', '效率'], detail: '性能考虑' }
      ] },
      { label: '表达', max: 15, checks: [
        { w: .5, minChars: 150, detail: '说明篇幅（150 字以上）' },
        { w: .3, any: ['公式', '插值', 'w', '深度'], detail: '用符号或公式表述' },
        { w: .2, needDigit: true, detail: '具体数值或对比' }
      ] }
    ],

    'ASG-ARC101-1': [
      { label: '套型选取', max: 20, checks: [
        { w: .5, any: ['套型', '户型', '住宅'], detail: '分析对象' },
        { w: .3, any: ['真实', '实际', '案例', '项目'], detail: '来自真实案例' },
        { w: .2, any: ['面积', '㎡', '平米', '平方米'], detail: '面积等基本指标' }
      ] },
      { label: '行为流线', max: 30, checks: [
        { w: .5, any: ['流线', '动线'], detail: '行为流线' },
        { w: .3, any: ['行为', '活动', '起居', '烹饪'], detail: '具体行为' },
        { w: .2, any: ['交叉', '干扰', '分区', '分离'], detail: '流线干扰分析' }
      ] },
      { label: '尺度分析', max: 30, checks: [
        { w: .4, any: ['尺度', '尺寸', '人体'], detail: '尺度分析' },
        { w: .3, any: ['家具', '布置', '家具尺寸'], detail: '家具布置' },
        { w: .3, any: ['mm', '毫米', '米', '数据'], detail: '具体尺寸数据' }
      ] },
      { label: '图幅规范', max: 20, checks: [
        { w: .4, any: ['a3', '图幅'], detail: 'A3 图幅' },
        { w: .3, any: ['两张', '2 张', '二张'], detail: '图纸数量（2 张）' },
        { w: .3, any: ['图例', '标注', '比例', '指北针'], detail: '图例 / 标注 / 指北针' }
      ] }
    ],

    'ASG-ICB101-1': [
      { label: '4D 模拟', max: 30, checks: [
        { w: .5, any: ['4d', '进度模拟'], detail: '4D 进度模拟' },
        { w: .3, any: ['navisworks', '工具', '软件', '平台'], detail: '所用工具' },
        { w: .2, any: ['模型', '构件', '模型导入'], detail: '模型来源' }
      ] },
      { label: '进度计划', max: 25, checks: [
        { w: .4, any: ['进度', '计划', '工期'], detail: '进度计划' },
        { w: .3, any: ['工序', '顺序', '搭接', '流水'], detail: '工序组织' },
        { w: .3, any: ['关键路径', '里程碑', '总工期'], detail: '关键路径 / 里程碑' }
      ] },
      { label: '分析深度', max: 25, checks: [
        { w: .4, any: ['分析', '原因', '影响'], detail: '成因或影响分析' },
        { w: .3, any: ['优化', '建议', '改进', '调整'], detail: '优化建议' },
        { w: .3, needDigit: true, detail: '工期 / 天数等数据' }
      ] },
      { label: '交付规范', max: 20, checks: [
        { w: .5, minChars: 800, detail: '报告篇幅（800 字以上）' },
        { w: .3, any: ['视频', '模拟视频', '动画'], detail: '模拟视频' },
        { w: .2, any: ['报告', '结论', '总结'], detail: '报告正文' }
      ] }
    ]
  };

  global.SEED = {
    term: '2026-2027 学年 第一学期',
    termKey: '2026F',
    maxCredit: 30,
    weeks: 16,
    plan: PLAN,
    interventions: INTERVENTIONS,
    categories: CATEGORIES,
    teachers: TEACHERS,
    courses: COURSES,
    offerings: OFFERINGS,
    students: STUDENTS.concat(STUDENT_POOL),
    demoStudents: STUDENTS,
    myEnrollments: MY_ENROLLMENTS,
    assignments: ASSIGNMENTS,
    rubrics: RUBRICS,
    submissions: SUBMISSIONS,
    pastSessions: PAST_SESSIONS,
    messages: MESSAGES
  };
})(typeof window !== 'undefined' ? window : globalThis);
