# 跨文化 Slang & Culture Explainer — 技术设计与产品描述文档（for Vibe Coding）

> 形态：Chrome 扩展（Manifest v3）
>  目标：在网页播放器内，对“当前字幕行/时间点”一键生成**Quick Explain（直译+语境，低延迟）**，支持进入**Deep Explain（背景/跨文化类比/置信度&来源）**的异步加载与追溯；支持文化画像模板化、RAG+在线API混合检索、统一后端状态与多级缓存。 

------

## 0. 需求要点（对齐PRD与确认项）

- **场景**：在有字幕的长/短视频网页内，点击字幕旁入口，2秒内看到**直译 + 语境**；更深入内容在侧边抽屉异步返回。
- **结构**：固定**五段式**（直译 / 语境 / 背景 / 跨文化类比 / 置信度&来源）；Quick 只出前两段，Deep 异步加载后面三段与证据。 
- **入口**：字幕行右侧“i/?” 圆形按钮 → Quick Explain → Deep Explain；推荐区、文化画像切换、收藏/历史/分享。
- **文化画像**：支持问卷配置三种用户模板 + 即时/预生成切换；跨文化类比随画像切换更新。
- **可追溯**：关键结论给出来源链接与置信度标记（高/中/低）。
- **识别策略**：自动在 DOM 抓取与 OCR 之间切换；暂不做 ASR。
- **LLM与框架**：OpenAI 作为主 LLM（OpenAI key）；可用 LangGraph（langchain key）编排工作流；RAG 非必选但在常见俚语词典中优先。
- **数据策略**：RAG（常见词表/百科）+ 在线API聚合（新梗/热梗）并强制显示源地址。
- **多语言**：Quick 支持“用户母语 + 英语”（母语若为英语则单语）；Deep 抽屉使用结构化标签页。

------

## 1. 系统目标与非功能约束

**目标**

- **TTV（Time-To-Value）**：点击后 ≤2s 呈现 Quick（前两段）。
- **可追溯**：所有重要结论的出处与置信度展示。
- **可扩展**：支持多站点（YouTube/Netflix/…）；DOM → OCR 自动降级。
- **成本可控**：本地缓存 + 后端缓存 + 命中率优化；Quick/Deep 分离调用降低初始成本。

**约束**

- Manifest v3；权限最小化（仅读所需 DOM 或画面）；不采集敏感个人信息（遵循站点条款）。
- 无 ASR（避免高额API开销）。
- 兼容用户不存储画像模板的即席生成。

------

## 2. 总体架构

```
Client (Chrome Extension)
├─ Content Script
│  ├─ Subtitle Detector
│  │  ├─ DOM Hook (selectors registry per site)
│  │  └─ OCR Fallback (Canvas + Tesseract.js)
│  ├─ Trigger UI (bubble icon near subtitle line)
│  ├─ Quick Explain Card (literal + context, 2s target)
│  ├─ Deep Explain Drawer (tabs: Background / Cross-culture / Sources)
│  ├─ Cultural Profile Manager (3 templates max, survey & tone)
│  ├─ Local Cache (Chrome storage / IndexedDB)
│  └─ Telemetry (latency, cache hit, CTR)
│
├─ Background Service Worker
│  └─ Request Router (debounce, coalesce, retry, auth token guard)
│
└─ Options Page (Settings)
   ├─ Profile Questionnaire (age/gender/region/occupation/tone)
   ├─ API Keys (OpenAI key, LangGraph key)
   └─ Source Toggles (RAG vs Online-API)

Edge/Helper
└─ Site Registry
   ├─ Per-site DOM Selectors
   └─ OCR policy hints (font, bbox regions)

Backend (API Gateway)
├─ Auth & Quotas (per user key)
├─ Orchestrator (LangGraph/Node workers)
│  ├─ Quick Pipeline (LLM: literal+context)
│  ├─ Deep Pipeline (LLM + RAG + Online APIs)
│  └─ Cultural Variants (precompute for saved profiles)
├─ RAG Layer (vector store + synonyms dicts)
│  ├─ Common slang dictionaries (offline indexed)
│  └─ Knowledge chunks (Wikidata/Wikipedia curated)
├─ Online Aggregation
│  ├─ Urban Dictionary / Wikipedia / fandom / news
│  └─ Ranking + Source Scoring + Snippet extraction
├─ Cache Layer
│  ├─ Redis (request/result shards)
│  └─ CDN (static tips / hot-phrases)
└─ Storage
   ├─ User Profiles (max 3 templates)
   ├─ Collections (saved cards)
   └─ Analytics (aggregated, anonymous)
```

------

## 3. 模块分层设计

### 3.1 前端（Chrome 扩展）

- **Content Script**
  - **Subtitle Detector**
    - *DOM Hook*：基于站点选择器注册表（如 `ytp-caption-segment`/`player-timedtext`）；监测字幕行文本与时间戳。
    - *OCR Fallback*：用于 DOM 不可见或影藏在 Canvas 的站点（B 站某些模式、独立播放器）。逻辑：通过 `requestAnimationFrame` 限频截图 → Canvas → Tesseract.js（限定字幕区域）。
  - **Trigger UI**
    - 字幕右侧浮动圆形图标；hover 提示，click 触发。
  - **Quick Explain Card**
    - 仅显示**直译+语境**；2s 目标；提供“展开Deep”。
  - **Deep Explain Drawer（Tabs）**
    - **Background**：典故/来源/时间线
    - **Cross-culture**：按画像输出对照与类比
    - **Sources**：证据清单、链接、置信度徽标（高/中/低），备选解释与适用场景说明。
  - **Cultural Profile Manager**
    - 三模板上限；画像包含人口统计与**个性化语气**（如“钢铁侠语气”）。画像切换即刻更新**跨文化类比**，对已保存画像可预生成并缓存。
  - **Local Cache**
    - Chrome storage/IndexedDB：按“(site, video_id, timestamp, text)”键值缓存卡片；LRU 驱逐。
- **Background Service Worker**
  - 请求合并、防抖、失败重试；秘钥守护；跨标签页共享状态。
- **Options Page**
  - 问卷（年龄/性别/地区/职业），tone 文本框；API keys 输入；语料开关（RAG/Online-API）。

### 3.2 后端

- **API Gateway**：鉴权、配额、路由。
- **Orchestrator（LangGraph/Node）**：
  - **Quick Pipeline**：LLM Prompt → 输出直译+语境（低token、小模型优先）。
  - **Deep Pipeline**：LLM + RAG（常见俚语/百科）+ Online API（新梗）；合并排序，生成背景/跨文化类比/来源与置信度。
  - **Cultural Variants**：若用户已保存画像模板≤3，则对热门句或高频句**预计算**多画像版本，前端切换即刻命中。
- **RAG Layer**：
  - 词表离线索引（俚语、成语、缩写、影视固定梗），向量库（FAISS/Chroma）；同义词扩展；版本化。
- **Online Aggregation**：
  - 聚合 Urban Dictionary / Wikipedia / fandom 等；规则化抽取释义与上下文片段；记录 URL 与时间。
- **Cache Layer**：Redis（结果缓存5–60 min，按来源可信度与热度动态TTL）；边缘CDN缓存热点 tips。
- **Storage**：用户画像模板、收藏卡片、匿名化统计。

------

## 4. 数据流与异步逻辑（文字时序）

**Quick（T+0~2s）**

1. Content Script 获取字幕行文本与时间戳 → 生成 requestId。
2. Background SW 将 Quick 请求发至后端 `/explain/quick`。
3. 后端 Quick Pipeline（纯 LLM，无检索或仅极少字典匹配）→ 返回 `literal + context`。
4. 前端渲染 Quick 卡片，显示“展开 Deep”。

**Deep（异步）**

1. 用户点击“展开”→ 立即显示占位骨架屏；并发调用：
   - `/explain/deep?id=requestId`（后端合并 RAG + Online APIs）
   - 若用户画像命中缓存，追加 `profileId` 召回跨文化类比
2. 后端完成汇总 → 返回 `background + cross_culture + sources + confidence + alternatives`。
3. 前端按 Tabs 填充：Background / Cross-culture / Sources；在 Sources 中列出 URL 与置信度。

**缓存命中**

- 本地缓存（相同 `(site, video, ts±ε, text)` 命中）直接回显 Quick；同时静默刷新 Deep。
- 服务端 Redis 命中则直接返回完整或部分分段，减少二次调用延迟。

------

## 5. API 设计（REST 近似）

### 5.1 Auth

- Header：`X-OPENAI-KEY`（用户侧提供） `X-LANGGRAPH-KEY`（可选）
- Rate：基于 userId/设备指纹/站点分组限流

### 5.2 Explain

**`POST /explain/quick`**

```json
{
  "site": "youtube.com",
  "video_id": "abc123",
  "timestamp": 532.4,
  "subtitle_text": "that's cap",
  "user_lang": "zh-CN",
  "user_lang_is_english": false,
  "profile_id": null
}
```

**Response**

```json
{
  "request_id": "r-9f3...",
  "literal": "那是假的/胡说",
  "context": "此处是朋友间的反驳语气，带轻微调侃与不信任",
  "latency_ms": 830,
  "cache": "miss"
}
```

**`POST /explain/deep`**

```json
{
  "request_id": "r-9f3...",
  "subtitle_text": "that's cap",
  "profiles": ["p-default","p-student"],
  "online_sources": true,
  "rag": true
}
```

**Response（分段+溯源+备选）**

```json
{
  "background": "“cap”源于非裔英语俚语，意指夸大或说谎...",
  "cross_culture": [
    {"profile":"p-default","analogy":"类似中文里“吹牛”"},
    {"profile":"p-student","analogy":"在校园语境里更像“瞎扯”"}
  ],
  "sources": [
    {"title":"Urban Dictionary: cap","url":"https://...","cred":"medium"},
    {"title":"Wikipedia: AAVE","url":"https://...","cred":"high"}
  ],
  "alternatives":[
    {"meaning":"也可表示夸张","when":"嘻哈语境/歌词"},
    {"meaning":"反讽使用","when":"朋友打趣"}
  ],
  "confidence":"medium",
  "cache":"server-hit"
}
```

### 5.3 Profiles

**`PUT /profiles/{id}`**：保存画像（人口属性 + tone）
 **`GET /profiles`**：最多3条
 **`POST /profiles/{id}/precompute`**：对热点句预生成多画像解释

### 5.4 Collections

**`POST /collections`**：保存卡片
 **`GET /collections?video=...`**：按视频/时间检索

------

## 6. LLM 策略与 Prompt 设计

### 6.1 模型推荐

- **Quick**：`gpt-4o-mini`（低延迟、成本友好），或 `gpt-4o` 精简提示词。
- **Deep**：`gpt-4o`/`gpt-4-turbo`（结合检索结果做整合与证据对齐）。
- **编排**：LangGraph 实现 Quick/Deep 双轨 workflow + 画像分支。

### 6.2 Quick Prompt（直译+语境）

```
System:
You are a subtitle slang explainer. Return ONLY two fields: literal, context.
- literal: precise literal translation or gloss.
- context: intent/tone given the likely scene (sarcasm, banter, exaggeration).
- Keep it concise (<80 Chinese characters per field if user_lang is zh-CN).
- If low certainty, say so briefly.

User:
subtitle="{text}"
scene_hint="{site}:{video_id}@{timestamp}"
user_lang="{lang}"  mother_tongue_is_english={bool}
```

### 6.3 Deep Prompt（背景/跨文化/溯源/备选）

```
System:
Synthesize cultural background, cross-culture analogy (respect user profile),
and list sources with confidence. If ambiguity exists, output alternatives with
their applicable scenarios. Always map each claim to 1–2 traceable URLs.

User:
subtitle="{text}"
evidence_snippets=[{title,url,summary,source_score},...]
profile="{demographics + tone}"
```

**输出规范**（结构化）：

```json
{
  "background": "...",
  "cross_culture": [{"profile":"...", "analogy":"..."}],
  "sources": [{"title":"...", "url":"...", "cred":"high|medium|low"}],
  "alternatives": [{"meaning":"...", "when":"..."}],
  "confidence": "high|medium|low"
}
```

------

## 7. 语料策略：RAG + 在线 API 混合

- **RAG（离线索引）**：
  - 词表来源：公开俚语词典、维基条目、常见影视梗汇编（合规采集）。
  - 索引：FAISS/Chroma；embedding 以短语为单位；同义词、词形还原。
  - 命中优先级：当短语在词表中存在高相似度匹配（≥阈值）→ 作为主证据参与 Deep。
- **在线API聚合（新梗/热梗）**：
  - Urban Dictionary、Wikipedia、Fandom、新闻源。
  - URL 必显（可追溯），并给出来源“cred”评分（域名信誉、更新时效、语境匹配）。
- **融合排序**：RAG 命中权重 + 在线新鲜度权重 → 证据合并；低一致性则在“备选解释”中呈现分歧与适用场景。

------

## 8. 文化画像（Profile）与生成策略

- **画像结构**：

```json
{
  "id":"p-student",
  "demographics":{"age_range":"18-25","gender":"F","region":"HK","occupation":"student"},
  "tone":"以钢铁侠式幽默口吻解释",
  "lang_pref":{"mother_tongue":"zh-CN","bilingual":true}
}
```

- **模板上限**：每用户最多3个画像模板；若已保存模板，则对热点句**预生成**多画像版本；未保存则实时生成。
- **切换逻辑**：
  - 命中预生成 → 即刻切换；
  - 未命中 → 触发 Deep 侧请求（仅跨文化段落增量刷新）。
- **跨文化类比**：要求与用户画像贴合、能被母语文化快速理解。

------

## 9. 缓存与状态管理

- **前端本地缓存**：Quick 卡片短时缓存（几分钟）+ LRU；Deep 的 sources 以 requestId 绑定。
- **服务端缓存**：
  - Redis：`quick:{hash}` / `deep:{hash}`；
  - TTL 动态：高热/高一致性 → TTL 长（30–60 分钟）；源更新快的域名 → 短 TTL。
- **统一状态**：后端持久化 `requestId → status`，前端使用轮询/事件流更新 Deep。

------

## 10. 前端实现要点（Manifest v3）

- **权限**：`activeTab`、必要的 `scripting`、`storage`、可选 `declarativeNetRequest`（过滤无关请求）。
- **注入**：匹配规则 `matches: ["*://*/*"]` + 站点白名单优化；动态加载 OCR 以减小冷启动。
- **UI**：组件挂载到播放器容器之上；避让画面关键区域。
- **国际化**：Quick 支持“母语+英语”切换（若母语为英语则单语）；Deep Tabs 结构固定。

------

## 11. 指标与运维

- **核心指标**：
  - Quick 首包延迟 p50/p95；Quick 命中率；Deep 完成率；URL 溯源覆盖率；画像命中率；本地/服务端缓存命中率。
- **稳定性**：
  - 请求合并/幂等；断线重试；OCR 限频与自动熔断。
- **合规**：
  - 仅使用公开可访问页面做溯源；不持久化用户隐私内容；遵守站点使用条款与合理引用范围。

------

## 12. 技术选型建议（含替代）

- **前端**：TypeScript + Vite 构建 + Svelte/React 任一；Tesseract.js（OCR）；IndexedDB（Dexie.js）
- **后端**：Node.js（Fastify）或 Python（FastAPI）；Redis（cache）；PostgreSQL（画像/收藏）；LangGraph 编排
- **RAG**：FAISS/Chroma + `text-embedding-3-small`
- **LLM**：OpenAI（`gpt-4o-mini` for Quick；`gpt-4o/4-turbo` for Deep）
- **在线聚合**：自建 adapter（Urban/Wiki/Fandom/...）；Cheerio 提要抽取（若需抓取，仅抓公开页面）

**不选型的理由**

- 纯 RAG：对新梗滞后；
- 纯在线：对常见梗成本高且不稳定；
- 纯前端：跨域与秘钥风险、对聚合不利。

------

## 13. 边界与降级

- DOM 不可见 → OCR；OCR 不稳定 → 允许手选文字（后续版本）；无 ASR。
- 在线源不可用 → 仅用 RAG；若 RAG 低置信 → 展示“不确定”与备选解释。

------

## 14. 开发里程碑（MVP→Beta）

1. **M1：站点打通 + Quick**
   - YouTube/Netflix DOM 解析；Quick LLM 通路；本地缓存；Options 配置
2. **M2：Deep + 溯源**
   - RAG 离线词表索引；在线API聚合；Deep 抽屉 + Tabs；URL + 置信度
3. **M3：画像与预生成**
   - 问卷与模板；三模板上限；热门句预生成与缓存
4. **M4：OCR fallback + 推荐区**
   - OCR 限频策略；热门句/常搜梗推荐区（可选）

------

## 15. 代码结构建议（Repo 结构）

```
/extension
  /src
    /content
      detector/dom.ts
      detector/ocr.ts
      ui/quickCard.tsx
      ui/deepDrawer.tsx
      cache/localCache.ts
      profiles/manager.ts
    /background
      router.ts
    /options
      index.tsx
  manifest.json

/server
  /src
    api/explain.ts
    api/profiles.ts
    core/orchestrator.ts  // LangGraph flows
    core/rag.ts
    core/online.ts
    core/mergeRank.ts
    core/prompts.ts
    cache/redis.ts
    db/models.ts
  package.json

/shared
  types.ts
  utils.ts
```

------

## 16. 测试计划

- **单测**：Prompt 输出结构校验、合并排序、一致性（RAG vs Online）
- **端到端**：YouTube 指定时间点 → Quick（≤2s）→ Deep（sources≥1，cred存在）
- **OCR A/B**：CPU/延迟/准确率与限频曲线
- **画像切换**：预生成命中 vs 即时生成对比

