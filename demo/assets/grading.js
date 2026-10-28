/* ===========================================================
 * grading.js — 教师侧 AI 批改建议（评分助手）
 *
 * 和 ai.js 一样是规则引擎，不是大模型。三条设计原则：
 *   1. 纯逻辑、不碰 DOM，可以被 node 直接测试
 *   2. 打分只依据 data.js 里的 rubric，每个 check 命中与否都摊开给教师看
 *   3. 只产出「建议」——是否采纳由教师决定，落库必须走教师的保存动作
 *
 * 为什么不做成"直接写分数"：批改是有责任的行为，AI 给错了要有人兜。
 * 所以这里的返回值里没有任何写操作，纯粹是建议对象。
 * ============================================================ */
(function (global) {
  'use strict';

  var S = global.Store;

  /* ---------- 文本工具 ---------- */

  /* 去掉标点与空白后的字数。中文按字计，英文按字符计，够用了。 */
  function charCount(text) {
    return String(text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length;
  }

  function hasAny(text, list) {
    var t = String(text || '').toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (t.indexOf(String(list[i]).toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function hasDigit(text) {
    return /[0-9]/.test(String(text || ''));
  }

  /* 单个 check 是否命中 */
  function hitOf(text, check) {
    if (check.minChars != null) return charCount(text) >= check.minChars;
    if (check.needDigit) return hasDigit(text);
    if (check.any) return hasAny(text, check.any);
    return false;
  }

  /* ---------- 核心：按 rubric 打分 ---------- */

  function rubricOf(assignmentId) {
    var r = (global.SEED && global.SEED.rubrics) || {};
    return r[assignmentId] || null;
  }

  /* 该作业期望的字数。
     取 rubric 里最大的 minChars，并给一个 120 字的下限 ——
     否则一份 40 字就能"达标"的作业会让 AI 误以为证据很充分。 */
  function requiredChars(rubric) {
    var max = 0;
    (rubric || []).forEach(function (dim) {
      (dim.checks || []).forEach(function (c) {
        if (c.minChars != null && c.minChars > max) max = c.minChars;
      });
    });
    return Math.max(max, 120);
  }

  function suggest(submissionId) {
    var sub = S.getSubmission(submissionId);
    if (!sub) return { ok: false, reason: '提交记录不存在' };

    var rubric = rubricOf(sub.assignmentId);
    if (!rubric) return { ok: false, reason: '这份作业还没有配置评分细则' };

    var text = sub.content || '';
    var chars = charCount(text);
    var need = requiredChars(rubric);

    var dimensions = [];
    var total = 0;

    rubric.forEach(function (dim) {
      var got = 0;
      var checks = (dim.checks || []).map(function (c) {
        var hit = hitOf(text, c);
        if (hit) got += c.w;
        return { detail: c.detail, w: c.w, hit: hit };
      });

      /* 每个维度单独取整，总分 = 各维度之和 —— 保证界面上加起来对得上 */
      var score = Math.round(dim.max * got);
      total += score;
      dimensions.push({
        label: dim.label,
        max: dim.max,
        score: score,
        rate: dim.max ? score / dim.max : 0,
        checks: checks
      });
    });

    /* 证据充足度：内容越短，越不该给"看起来精确"的分 */
    var ratio = need ? chars / need : 1;
    var confidence = ratio >= 0.8 ? 'high' : (ratio >= 0.3 ? 'mid' : 'low');

    var flags = [];
    if (chars < need) {
      flags.push('内容 ' + chars + ' 字，低于要求的 ' + need + ' 字');
    }
    dimensions.forEach(function (d) {
      if (d.score === 0) flags.push('「' + d.label + '」完全没有涉及');
    });
    if (chars < need * 0.4 && total >= 60) {
      flags.push('篇幅很短但要点齐全，建议人工确认成果是否真实');
    }

    return {
      ok: true,
      submissionId: sub.id,
      assignmentId: sub.assignmentId,
      studentId: sub.studentId,
      suggested: total,
      fullScore: 100,
      dimensions: dimensions,
      draftComment: draftComment(dimensions, total, chars, need, flags),
      flags: flags,
      confidence: confidence,
      evidence: { chars: chars, required: need, hasDigit: hasDigit(text) }
    };
  }

  /* ---------- 评语草稿 ----------
     模板化生成，但每一句都指向具体维度，不是通用套话。
     顺序：总评 → 做得好的 → 待改进 → 证据不足提醒。 */

  function pickBest(dims) {
    var best = null;
    dims.forEach(function (d) {
      if (d.rate > 0.8 && (!best || d.rate > best.rate)) best = d;
    });
    return best;
  }

  function pickWorst(dims) {
    var worst = null;
    dims.forEach(function (d) {
      if (!worst || d.rate < worst.rate) worst = d;
    });
    return worst;
  }

  /* 某维度里没命中的 check，取第一条当改进建议 */
  function firstMiss(dim) {
    if (!dim) return null;
    for (var i = 0; i < dim.checks.length; i++) {
      if (!dim.checks[i].hit) return dim.checks[i].detail;
    }
    return null;
  }

  function draftComment(dims, total, chars, need, flags) {
    var parts = [];

    if (total >= 85) {
      parts.push('整体完成度很高，几个关键要求都落到了实处。');
    } else if (total >= 70) {
      parts.push('整体完成情况不错，主要要求基本达到。');
    } else if (total >= 55) {
      parts.push('完成了基本要求，但深度和完整性还有明显欠缺。');
    } else {
      parts.push('本次提交内容比较简略，还不足以判断成果的实际质量。');
    }

    var best = pickBest(dims);
    if (best) {
      var hitDetail = null;
      for (var i = 0; i < best.checks.length; i++) {
        if (best.checks[i].hit) { hitDetail = best.checks[i].detail; break; }
      }
      /* 命中的要点和维度同名时不重复写，否则会变成"「行为流线」…（行为流线）" */
      var extra = (hitDetail && hitDetail !== best.label) ? '（' + hitDetail + '）' : '';
      parts.push('「' + best.label + '」这部分做得比较扎实' + extra + '。');
    }

    var worst = pickWorst(dims);
    var miss = firstMiss(worst);
    if (worst && worst.rate < 0.8) {
      parts.push('扣分主要在「' + worst.label + '」：' +
        (miss ? '还缺少' + miss + '。' : '这一项得分偏低。'));
    } else if (worst && miss) {
      parts.push('如果想再往上提，「' + worst.label + '」还可以补上' + miss + '。');
    }

    if (chars < need) {
      parts.push('另外，内容共 ' + chars + ' 字，明显短于要求的 ' + need +
        ' 字，建议把过程、数据和结论写开一些。');
    }

    return parts.join('');
  }

  /* ---------- 教师采纳情况统计 ----------
     用来回答"AI 到底帮上忙没有"，也是这套设计能不能自证的证据。 */
  function adoptionStats(assignmentId) {
    var s = S.load();
    var stat = { graded: 0, manual: 0, adopted: 0, edited: 0, rate: null };
    s.submissions.forEach(function (sub) {
      if (assignmentId && sub.assignmentId !== assignmentId) return;
      if (sub.score == null) return;
      stat.graded += 1;
      if (sub.gradedBy === 'ai-adopted') stat.adopted += 1;
      else if (sub.gradedBy === 'ai-edited') stat.edited += 1;
      else stat.manual += 1;
    });
    var ai = stat.adopted + stat.edited;
    stat.rate = stat.graded ? Math.round(ai / stat.graded * 100) : null;
    return stat;
  }

  global.Grading = {
    suggest: suggest,
    rubricOf: rubricOf,
    requiredChars: requiredChars,
    charCount: charCount,
    adoptionStats: adoptionStats
  };
})(typeof window !== 'undefined' ? window : globalThis);
