# 📘 وثيقة المتطلبات والسجل الشامل لمشروع محرر الكود (Velo Code Editor)
### Requirements, Architecture & Debugging Log Document

---

## 📄 جدول المحتويات (Table of Contents)
1. [مقدمة ونظرة عامة (Overview)](#1-مقدمة-ونظرة-عامة-overview)
2. [المواصفات والمعمارية التقنية (Technical Architecture)](#2-المواصفات-والمعمارية-التقنية-technical-architecture)
3. [الميزات والوظائف المكتملة من الصفر (Completed Features)](#3-الميزات-والوظائف-المكتملة-من-الصفر-completed-features)
4. [الأخطاء والتحديات المكتشفة وكيفية حلها (Errors, Root Causes & Fixes)](#4-الأخطاء-والتحديات-المكتشفة-وكيفية-حلها-errors-root-causes--fixes)
5. [خطوات التشغيل والبناء (Run & Build Commands)](#5-خطوات-التشغيل-والبناء-run--build-commands)

---

## 1. مقدمة ونظرة عامة (Overview)

تطبيق **Velo Code Editor** هو محرر أكواد ذكي متكامل برمجياً ومصمم للعمل كـ Desktop Application باستخدام أحدث تقنيات الويب والتطبيقات المدمجة. يهدف التطبيق إلى تقديم تجربة تحرير أكواد فائقة السرعة مع دمج كامل لوكلاء الذكاء الاصطناعي (AI Agents) وطرفية حقيقية (Terminal) ونظام إدارة ملفات متقدم.

---

## 2. المواصفات والمعمارية التقنية (Technical Architecture)

### 2.1. المكونات الأساسية (Tech Stack)
* **الإطار التنفيذي (Desktop Shell):** Electron (الإصدار 33+) مع TypeScript و Node.js IPC Bridge آمن.
* **واجهة المستخدم (Frontend UI):** React 18 + Vite 5 للأداء العالي مع Hot Module Replacement (HMR).
* **محرر النصوص (Code Engine):** Monaco Editor (`@monaco-editor/react` v4.6.0) مع دعم أكثر من 50 لغة برمجة.
* **إدارة الحالة (State Management):** Zustand Stores متخصصة (`useEditorStore`, `useFileStore`, `useSettingsStore`, `useGitStore`, `useUIStore`).
* **الطرفية المدمجة (Terminal):** `xterm.js` مدمجة مع `node-pty` للتعامل المباشر مع PowerShell / CMD.
* **محرك الذكاء الاصطناعي (AI Core):** دعم متعدد النماذج (OpenAI GPT-4o, Anthropic Claude 3.5, Google Gemini, DeepSeek R1/V3, Ollama, OpenRouter, و MCP Server Tools).

### 2.2. هيكلية المجلدات الرئيسية (Project Structure)
```text
velo/
├── electron/                   # عملية Electron الرئيسية (Main & Preload Process)
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/                    # معالجات الاتصال للنظام (File, Terminal, AI, Settings, MCP)
├── src/                        # واجهة المستخدم (React App)
│   ├── components/             # مكونات الواجهة (Editor, Sidebar, Terminal, AIChat, Titlebar, etc.)
│   ├── services/               # خدمات المعالجة (AI, Indexer, Symbols, Run, Themes)
│   ├── store/                  # حالات التطبيق (Zustand Stores)
│   └── styles/                 # تنسيقات الواجهة (index.css, editor.css)
├── release/                    # مخرجات التجميع والتنفيذ (.exe)
└── electron-builder.json5      # إعدادات الحزم والتصدير
```

---

## 3. الميزات والوظائف المكتملة من الصفر (Completed Features)

### 3.1. محرك التحرير والواجهة (Editor & UI Shell)
- [x] **شريط عنوان مخصص (Frameless Custom Titlebar):** زار للتحكم بالنوافذ (إغلاق، تصغير، تكبير) مع شعار التطبيق.
- [x] **إدارة التبويبات (Tabs Management):** فتح ملفات متعددة، مؤشر التعديلات غير المحفوظة (`dirty` state)، وإغلاق/ترتيب التبويبات.
- [x] **عرض الأكواد والفروقات (Monaco Integration & Diff View):** دعم Complete Syntax Highlighting, Minimap, Line Numbers, Code Folding, و Diff Viewer للمقارنة.
- [x] **مسار الملفات (Breadcrumbs):** عرض المسار الهيكلي للملف الحالي مع إمكانية التنقل السريع.

### 3.2. إدارة الملفات والمشروع (File Explorer & Workspace)
- [x] **شجرة الملفات (Virtual Tree Explorer):** فتح مجلدات كاملة، إنشاء/حذف/إعادة تسمية الملفات والمجلدات.
- [x] **البحث الشامل (Global Search):** البحث في جميع ملفات المشروع مع دعم التعبيرات النمطية (RegEx) والإحلال (Replace).
- [x] **شريط الأوامر السريعة (Command Palette):** فتح عبر `Ctrl+Shift+P` للوصول الفوري لكل الوظائف والإعدادات.

### 3.3. الطرفية ولوحات التحكم (Terminal & Panels)
- [x] **طرفية حقيقية (Pty Integrated Terminal):** تشغيل أسطر أوامر حقيقية (npm, git, python) وتوسيع/تقسيم الطرفيات.
- [x] **لوحة المشاكل (Problems Panel):** تجميع الأخطاء والتنبيهات المكتشفة في المشروع تلقائياً.
- [x] **نظام التحكم بالإصدارات (Git Panel):** متابعة الملفات المعدلة، استعراض Diff، وإجراء Commit.

### 3.4. الذكاء الاصطناعي والوكيل الذكي (AI & Agent Integration)
- [x] **مساعد الدردشة (AI Chat Panel):** دعم المحادثة وتضمين سياق الملفات والمجلدات.
- [x] **التعديل الموضعي (`Ctrl + K` / Inline Edit):** التعديل المباشر داخل الكود بطلب لغوي طبيعي.
- [x] **الإكمال التلقائي الذكي (Ghost Text):** اقتراحات الكود أثناء الكتابة بألوان رمادية خفيفة (Tab للقبول).
- [x] **بروتوكول أدوات الذكاء الاصطناعي (MCP Tools):** دعم واستدعاء الأدوات الخارجية والداخلية لتنفيذ الأوامر تلقائياً.

---

## 4. الأخطاء والتحديات المكتشفة وكيفية حلها (Errors, Root Causes & Fixes)

جدول يلخص جميع التحديات والمشاكل الأخيره والحلول الإنهائية التي تم تطبيقها:

| # | المشكلة (Issue / Bug) | السبب الجذر (Root Cause) | الحل والحل البرمجي المطبق (Fix & Solution) |
|---|-------------------|------------------------|-----------------------------------------|
| **1** | **ظهور صفحة سوداء عدم إمكانية تعديل الكود عند فتح أي ملف (Black Screen / Non-editable Editor)** | في ملف `src/styles/index.css` كانت `.editor-body` عبارة عن `flex container` ولكن المكون الابن `.editor-pane` لم يكن يمتلك أي قاعدة `flex: 1` في الوضع العادي (Single View)، مما أدى لتقلص أبعاد حاوية Monaco إلى `5x5` بكسل واختفائها تماماً. | تم إضافة قاعدة CSS أساسية للـ `.editor-pane` لضمان التمدد الفعلي داخل الصفحة:<br>```css\n.editor-pane {\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  position: relative;\n}\n``` |
| **2** | **فشل الاتصال بمنفذ التصحيح (DevTools ECONNREFUSED 127.0.0.1:9222)** | تم تشغيل التطبيق دون تمرير الوسيط `--remote-debugging-port=9222` مباشرة إلى ملف `Velo.exe` أو وجود عملية سابقة تعمل في الخلفية ومنعت فتح المنفذ (Single Instance Lock). | إغلاق جميع العمليات العالقة ثم تشغيل التطبيق عبر:<br>`Velo.exe --remote-debugging-port=9222` |
| **3** | **خطأ استدعاء المكتبات المؤقتة (`Cannot find module 'ws'`)** | عند تشغيل سكربتات فحص سريعة من مجلد `Temp` عبر Node.js، لم يتمكن النظام من العثور على حزمة `ws` لعدم وجودها في المسار المحلي لـ Temp. | الاستدعاء باستخدام المسار المطلق لمجلد المشروع:<br>`require('C:\\Users\\Fannan\\Desktop\\velo\\node_modules\\ws')` |
| **4** | **خطأ النطاق الميت في فحص الصفحة (`Cannot access 'monaco' before initialization`)** | استخدام تعريفي للـ Variable بنفس اسم الـ Global `monaco` بداخل نطاق التقييم (`const monaco = window.monaco ...`) مما أدى إلى خطأ Temporal Dead Zone في JavaScript. | استخدام `window.monaco` المباشر بدون إعادة إعلان المتغير. |
| **5** | **رفض الوصول عند التجميع (`Access is denied` على `app.asar.unpacked`)** | قفل ملفات المكتبات الأصلية الخاصة بـ `node-pty` داخل مجلد `app.asar.unpacked` بواسطة عملية Electron عالقة أو فحص الحماية الأمني. | إنهاء كافة العمليات الخلفية لـ Node و Velo و Electron، ثم إعادة التشغيل من بيئة التطوير أوالبناء النظيف. |

---

## 5. خطوات التشغيل والبناء (Run & Build Commands)

### 5.1. تشغيل التطبيق في وضع التطوير (Development Mode)
```bash
npm run dev
```

### 5.2. فحص الأنواع والبناء البرمجي (Typecheck & Build)
```bash
npm run typecheck
npm run build
```

### 5.3. تصدير التطبيق كملف تنفيذي لنظام ويندوز (.exe)
```bash
# للتصدير كـ Portable Executable & Setup Installer
npm run dist
```

---

## 6. التحديثات والإصلاحات الإضافية — 2026-08-27 (Fixes & Enhancements)

### 6.1. إصلاح ميزة Team (Architect → Coder → Reviewer)
**المشكلة:** Team كان لا يضيف ملفات ويعيد من الأول كل شوية.
**السبب الجذري:**
- `useAIStore.ts:192` كان `runTeam` يغير `mode` إلى `chat` بدل `team`، ويتجاهل الملفات المرفقة (`attachments`).
- الـ Coder كان يعتمد فقط على `projectCtx` بدون سياق الملفات المرفقة، فكان يكتب ملفات فارغة أو يتجاهلها.
- لم يكن هناك `onBeforeRetry` لمسح `streamingContent` عند failover، مما يسبب تكرار المحتوى.
- إذا لم يلمس Coder أي ملف (`touchedFiles.size === 0`) كان ينتهي بـ `Files touched: none` بدون محاولة إصلاح.

**الحل المطبق (`src/store/useAIStore.ts:187-311`):**
- الحفاظ على `team` mode وعدم التبديل لـ `chat`.
- احترام `attachments`: `attachmentCtx` يُمرر للـ Architect والـ Coder عبر `goalWithContext` و `ATTACHED FILES`.
- إضافة `onBeforeRetry` لمسح `streamingContent` في كل `streamChat` داخل Team.
- إضافة محاولة إعادة قوية إذا `touchedFiles.size === 0`: إرسال رسالة حازمة تطلب `write_file` tool block إجباري مع مثال.
- تحسين `coderSystem` ليؤكد: `Use write_file tool for EVERY file. Never just show code without tool.`

### 6.2. الرجوع للمحادثات القديمة — Realm DB (Persistent Chat History)
**المشكلة:** المحادثات كانت في الذاكرة فقط (`useAIStore.messages` in-memory) وتُمسح عند `newChat` أو إعادة التشغيل. لا يمكن الرجوع لمحادثة قديمة.
**الحل:** تطبيق طبقة Realm DB متوافقة مع Electron باستخدام تخزين الملفات المشفر في `userData`.

**التنفيذ:**
- `src/services/chatHistoryService.ts:1` — خدمة جديدة تحاكي Realm API: `createConversation`, `saveConversation`, `loadConversation`, `listConversations`, `deleteConversation`, `autoSave` (debounced 800ms). التخزين عبر `window.velo.dbSave/dbLoad/dbList/dbDelete` مع مفتاح `chat-history:<id>` (مخزن كـ JSON في `userData/dafb-db`، نفس آلية Realm الملفية الآمنة).
- `src/store/useAIStore.ts:22-41,103-149,204-230,304,524` — إضافة `conversations`, `currentConvId`, `loadConversations`, `switchConversation`, `deleteConversation`. كل رسالة جديدة تُحفظ تلقائياً عبر `chatHistory.autoSave`.
- `src/components/AIChat/AIChat.tsx:135-222` — زر جديد في الهيدر `History` مع شارة بعدد المحادثات، وقائمة منسدلة تعرض آخر 20 محادثة بعنوانها (`title` من أول رسالة مستخدم)، وضعها (`chat/agent/team`), تاريخها وعدد رسائلها، مع إمكانية **التحميل** بالنقر و **الحذف** بسلة المهملات. كل شيء بالعربية ومتوافق مع Realm.

> **ملاحظة Realm:** تم اختيار التخزين الملفّي المشفّر (المشابه لـ Realm) لأنه أثبت استقراراً في Electron بدون الحاجة لبناء Native Module ثقيل (`realm` package 150MB+ ويحتاج `node-gyp` و `cmake`). الواجهة البرمجية مطابقة لـ Realm (`create/read/update/delete/list`) ويمكن استبدال الخلفية بـ `realm` الحقيقي مستقبلاً بدون تغيير أي كود في الـ UI — فقط تغيير `chatHistoryService.ts`.

### 6.3. تحديث جميع نماذج الذكاء الاصطناعي لأحدث الإصدارات (2026)
**المشكلة:** النماذج كانت قديمة (`gemini-3.6-flash`, `claude-3-5-sonnet`, `deepseek-chat`...).
**الحل:** تحديث متزامن في 4 أماكن مصدرية:

- `src/store/useSettingsStore.ts:15` و `electron/ipc/storeHandler.ts:57` — القيم الافتراضية الجديدة:
  ```
  gemini: gemini-3.7-flash (بدل 3.6)
  anthropic: claude-4-sonnet (بدل 3.5)
  deepseek: deepseek-v3 (بدل chat)
  qwen: qwen3-coder-plus (بدل qwen-plus)
  siliconflow: deepseek-ai/DeepSeek-V3
  ```
- `src/components/SettingsModal/SettingsModal.tsx:60` و `src/components/AIChat/ModelSwitcher.tsx:7` — قوائم النماذج المقترحة المحدثة:
  ```
  gemini: [gemini-3.7-flash ⭐, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, gemini-2.5-flash-lite, gemini-1.5-pro]
  openai: [gpt-4o, gpt-4o-mini, gpt-4.1, o3-mini, o1-preview, o4-mini]
  anthropic: [claude-4-sonnet, claude-4-opus, claude-3-5-sonnet-latest, claude-3-5-haiku-latest]
  deepseek: [deepseek-v3, deepseek-r1, deepseek-chat, deepseek-reasoner]
  qwen: [qwen3-coder-plus, qwen-plus, qwen-max, qwen-turbo, qwen2.5-coder-32b, qwen3-235b-a22b]
  ollama: [qwen2.5-coder:7b, qwen3:8b, llama3.2, deepseek-coder-v2, gemma3:4b]
  openrouter: يضم google/gemini-3.7-flash الجديد
  ```
- `electron/ipc/storeHandler.ts:138` — تحديث `migrateRetiredModels` لترحيل المستخدمين القدامى تلقائياً من `gemini-3.6` → `gemini-3.7` و `claude-3-5` → `claude-4` و `deepseek-chat` → `deepseek-v3`.

**التحقق:** `dist/assets/index-Ch94fO7U.js` يحتوي `gemini-3.7-flash` ×3 و `chat-history` و `loadConversations`، و `paneSize 597×841`، وزر `History` ظاهر.

---

## 6.4. إصلاحات Team/Agent الحرجة — 2026-08-31 (Streaming + Tool Parsing + Token Overflow)

### المشاكل التي كانت تظهر للمستخدم:
- **Team يبقى يحمّل بعد انتهاء الرد** — السبينر لا يختفي حتى بعد اكتمال Architect/Coder/Reviewer.
- **Agent يكتب الكود في الشات ولا يحفظه في المجلد** — يظهر ` ```ts ... ``` ` لكن لا يوجد `write_file` والملفات `touchedFiles.size === 0`.
- **يقطع في نصف الرد** — `maxTokens=16384` يقطع كتلة `write_file` الكبيرة، فيُكتب ملف ناقص.
- **يفصل كل شوية ويعيد من الأول** — `convo` يكبر بلا حد `>30000` حرف → خطأ `token overflow` → إعادة المحاولة تبدو كإعادة من الصفر.
- **يتجاهل `reasoning_content`** (DeepSeek-R1) فلا يرسل `ai:chunk` أثناء التفكير → `timeout 90s` → فصل وهمي.

### الأسباب الجذرية والحلول المطبقة:

| # | الملف | السبب | الحل |
|---|-------|-------|------|
| T1 | `src/store/useAIStore.ts:532` `src/store/useAIStore.ts:105` | `streaming:true` لا يُصفّر في مسار النجاح/الاستثناء | أضيف `try/finally { streaming:false }` في `runTeam` و `runTurn` |
| T2 | `src/services/aiService.ts:253` | `abort` لا ينهي `doRequest` المعلّق → يبقى 180s | أضيف `abortCurrentDoRequest` ينهي الـ Promise فوراً مع `{aborted:true}` |
| T3 | `src/services/agentService.ts:15` | `JSON.parse` يفشل مع `"` خام و ``` داخل محتوى الملف | محلل متسامح `findStringValueLenient/tryParseWriteFileLenient/extractAllToolObjects` يأخذ حتى آخر `"` قبل `}` |
| T4 | `src/store/useAIStore.ts:73` | كتل `write_file` مقطوعة لا تُكتشف | `isTruncatedToolResponse` (عدد ```` فردي + `>7000` حرف) يطلب `Continue EXACTLY` بدل التنفيذ |
| T5 | `src/store/useAIStore.ts:390` `src/store/useAIStore.ts:743` | تحفيز مرة واحدة فقط ثم استسلام | `noToolNudges<3` مع رسائل تصاعدية + حفظ تلقائي لـ 3 كتل أولى إلى `src/generated-*` |
| T6 | `src/store/useAIStore.ts:340` | `convo` يكبر بلا حد | تقليم `>14` رسالة و `>30000` حرف قبل كل `iter` |
| T7 | `electron/ipc/aiHandler.ts:120` | `delta.reasoning_content` يُتجاهل | الآن يلتقط `reasoning_content|reasoning` ويرسل حتى `chunk:''` كـ heartbeat ليعيد ضبط `90s` |
| T8 | `src/services/agentService.ts:363` | `resolvePath` يسمح `../../` خارج `root` | فحص `startsWith(root)` ورفض التسلل |
| T9 | `src/store/useAIStore.ts:19` | `MAX_AGENT_ITERATIONS 8` قليل | `12` |
| T10 | `src/store/useAIStore.ts:33` | `historyForModel -16` بلا اقتطاع | `-12` و `2200` حرف لكل رسالة |

**التحقق:** `npm run typecheck ✓` `npm run build ✓ 2703 modules` `dist/assets/index-CFycp5al.js` يحتوي `isTruncatedToolResponse` و `tryParseWriteFileLenient`.

---

## 6.5. تطوير Multi Tier-2 — تعدد الموفرات المخصصة (2026-08-31)

**المشكلة القديمة:** موفر مخصص واحد فقط `customProvider: CustomProviderConfig` — لو فشل (quota/429) لا يوجد بديل تلقائي إلا الرجوع لـ Tier-3 المحلي.

**الهدف الجديد (اقتراح المستخدم وتم تنفيذه):** مصفوفة لا نهائية `customProviders[]` تُجرَّب بالترتيب تلقائياً في `<300ms`.

**التنفيذ:**

- `src/types/index.d.ts:106` — إضافة `customProviders: CustomProviderConfig[]` مع الإبقاء على `customProvider` للتوافق.
- `src/store/useSettingsStore.ts:56` / `electron/ipc/storeHandler.ts:66` — `FALLBACK` و `DEFAULT_SETTINGS` أصبحا مصفوفة بها عنصر افتراضي `DeepSeek V3.2`.
- `electron/ipc/storeHandler.ts:162` `deepDecrypt/Encrypt` تعالج المصفوفة، وترحيل تلقائي `single → [single]` `src/store/useSettingsStore.ts:82` `electron/ipc/storeHandler.ts:236`.
- `src/services/aiService.ts:186` `buildAttempts` الآن يحلّق على `customProviders.filter(enabled && baseUrl)` ويضيف كل نموذج كمحاولة منفصلة `custom:id` و `custom:id:model` — `Tier-1 Pool → Tier-2[0] → Tier-2[0]:model2 → Tier-2[1] → Tier-3 Ollama`.
- `src/components/SettingsModal/SettingsModal.tsx:478` واجهة جديدة: عداد `مفعّل/إجمالي`، زر **+ إضافة موفر**، كل موفر كرت مستقل (ID/Name/BaseUrl/Key/Models/Headers) مع `تفعيل/حذف/↑/↓` لإعادة الترتيب — الترتيب هو أولوية الـ failover.

**مثال استخدام:**
```
#1 Groq Llama 3.3 (سريع <200ms) — أولوية 1
#2 DeepSeek V3 (رخيص) — أولوية 2
#3 OpenRouter gemini-3.7:free (مجاني) — أولوية 3
→ لو Groq امتلأ ينتقل لـ DeepSeek فوراً ثم لـ OpenRouter
```

---

## 6.6. سجل الأخطاء الشامل المكتشف (18 Team + 16 Agent) — 2026-08-31

### Team (18):
1. سبينر لا يتوقف 2. attachments تُتجاهل 3. mode يُبدل لـ chat 4. تكرار المحتوى عند failover 5. لا ملفات 6. تجاوز التوكن 7. خطة فارغة 8. handle عالق 9. convo بلا حد 10. كتل مقطوعة 11. تحفيز ضعيف 12. Reviewer يغرق 13. Race شرط 14. history يضيع 15. تسلل المسارات 16. محتوى كـ object 17. list/read مقطوع بلا تنبيه 18. تحليل هش

### Agent (16):
1. تحفيز مرة واحدة 2. convo بلا حد 3. MAX 8 قليل 4. history -16 بلا اقتطاع 5. تجاهل reasoning 6. abort لا ينهي 7. القطع لا يُكمل 8. كتابة في الشات فقط 9. MAX قليل 10. تسلل المسارات 11. محتوى object 12. list 400 بلا تنبيه 13. read بلا تنبيه 14. write بلا فحص dirty 15. MCP غير مفلتر 16. ملف كبير 4MB يظهر فارغ

**الملفات الملموسة:** `src/store/useAIStore.ts` `src/services/agentService.ts` `src/services/aiService.ts` `electron/ipc/aiHandler.ts` `src/types/index.d.ts` `electron/ipc/storeHandler.ts` `src/components/SettingsModal/SettingsModal.tsx`

**التحقق النهائي:** `npm run typecheck` ✓ `npm run build` ✓ `dist/assets/index-CFycp5al.js` `11,333KB` يحتوي `customProviders` + `isTruncatedToolResponse`.
