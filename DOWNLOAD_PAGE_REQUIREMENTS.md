# 📥 متطلبات صفحة تحميل Velo IDE — نسخة Cursor Style
### Velo IDE Download Page — Requirements (HTML / CSS / JS)

---

## 1. نظرة عامة (Overview)

بناء صفحة هبوط / تحميل لمحرر **Velo IDE v2.0.0** بأسلوب **cursor.com** — تركيز كامل على التحويل (Conversion):

* Hero واحد كبير + زر **Download for Windows** يكتشف النظام تلقائياً
* معاينة ضخمة للمحرر (screenshot / video) بدل شبكة كروت كثيرة
* 3 تبويبات AI (Chat / Agent / Team) مثل Cursor tabs
* أقسام مختصرة: Features → Models → Tech → CTA
* **اللغات:** `HTML5` + `CSS3` (vanilla) + `JavaScript` (vanilla, بدون React/Vite) — نفس `landing/` الحالية
* الملفات النهائية في `landing/` وتُرفع على GitHub Pages / Vercel أو تُفتح مباشرة `file://landing/index.html`

---

## 2. الهيكل المقترح (File Structure)

```text
landing/
├── index.html          # الصفحة الرئيسية (Cursor-style) — يُعاد كتابته بالكامل
├── styles.css          # ثيم داكن Cursor + responsive + RTL
├── app.js              # منطق OS detector + copy + tabs + reveal + toTop
├── assets/
│   ├── velo-preview.png    # لقطة Velo IDE (win-unpacked/Velo IDE.exe)
│   ├── icon.png            # أيقونة build/icon.png
│   └── demo.mp4 (اختياري)  # فيديو 10 ثوانٍ للـ Hero
└── REQUIREMENTS.md     # هذا الملف (مواصفات)
```

> لا حاجة لـ `npm` أو `build` — صفحة ثابتة.

---

## 3. التصميم (Design System — Cursor-like)

| العنصر | القيمة |
|--------|--------|
| **الخلفية** | `#0d1117` → `#0a0e13` مع `radial-gradient` بنفسجي خفيف `rgba(124,58,237,0.12)` في الـ Hero |
| **الكروت** | `#161b22` border `rgba(255,255,255,0.07)` radius `14px` |
| **الألوان الأساسية** | `--accent: #7c3aed` , `--accent2: #3b82f6` , `--gradient: linear-gradient(135deg,#7c3aed,#3b82f6)` |
| **الخط العربي** | `Cairo` + `Tajawal` (حالي) — للنسخة الإنجليزية `Inter` |
| **خط الكود** | `JetBrains Mono` |
| **العرض الأقصى** | `1200px` + `24px` padding جانبي |
| **الـ Navbar** | `64px` fixed, `backdrop-filter: blur(16px)` |
| **زر التحميل الرئيسي** | `48px` ارتفاع، `gradient` + `shadow 0 8px 24px rgba(124,58,237,0.4)` + `translateY(-2px) hover` |
| **الاتجاه** | `dir="rtl"` للعربية، `dir="ltr"` للإنجليزية — زر تحويل لغة يبدل `lang/dir` |

مرجع بصري: `cursor.com` — Hero متوسط 100vh، عنوان 56px، وصف 18px، زر واحد dominant + زر ثانوي ghost.

---

## 4. الأقسام (Sections — بالترتيب Cursor)

### 4.1 Navbar
* يسار: `Velo IDE` + أيقونة (نفس `VeloLogo.tsx` كـ SVG)
* وسط: `Features · AI · Models · Changelog · Docs` (روابط anchor)
* يمين: `Download` صغير (ghost) + `GitHub` أيقونة
* Mobile: `menu-toggle` (3 خطوط) يفتح `nav-links.open`

### 4.2 Hero (100vh)
```html
<h1>Code at the speed of thought.</h1>  <!-- أو عربي: محرر يفهم كودك قبل ما تكتبه -->
<p>Velo IDE — Electron + React + Monaco + فريق AI (Gemini 3.7 · Claude 4 · GPT-5 · DeepSeek V3)</p>
<div class="hero-cta">
  <a id="primaryDownload" class="btn btn-primary btn-lg">Download for Windows</a>
  <a class="btn btn-secondary">View on GitHub</a>
</div>
<p class="hero-sub">v2.0.0 · 87 MB · Windows 10/11 x64 · Free</p>
<div class="hero-preview"><img src="assets/velo-preview.png" alt="Velo IDE" /></div>
```
* النص يتغير حسب اللغة (العربية: `محرر أكواد ذكي يقرأ مشروعك…` الموجود حالياً `landing/index.html:54`)
* `hero-preview` بظل `0 32px 80px rgba(0,0,0,0.6)` + border `1px solid var(--border)` + radius `16px`

### 4.3 OS Detector + Download Logic (`app.js`)
```js
function getOS() {
  const ua = navigator.userAgent;
  if (/Win/.test(ua)) return 'windows';
  if (/Mac/.test(ua)) return 'mac';
  return 'linux';
}
// ملفات الإصدار الحالية في release/
const FILES = {
  windows: '../release/Velo IDE-Setup-2.0.0.exe',      // 87.8 MB
  portable: '../release/Velo IDE-Portable-2.0.0.exe',  // 87.5 MB
  // مستقبلاً: mac: '...dmg', linux: '...AppImage'
};
const btn = document.getElementById('primaryDownload');
const os = getOS();
if (os === 'windows') {
  btn.textContent = 'Download for Windows';
  btn.href = FILES.windows;
  btn.download = 'Velo IDE-Setup-2.0.0.exe';
} else if (os === 'mac') { btn.textContent = 'Download for macOS (Soon)'; btn.classList.add('disabled'); }
else { btn.textContent = 'Download for Linux (Soon)'; btn.classList.add('disabled'); }
// زر ثانوي: Portable | Setup — dropdown صغير تحت الزر الرئيسي
```
* لو الملف غير موجود (404) يظهر `Copy command: npm run dist` كـ fallback (نفس `install-box` الحالية `landing/index.html:71`)

### 4.4 Features (3 أعمدة فقط مثل Cursor)
* `Editor` — Monaco 50+ لغة
* `Terminal` — PTY حقيقي
* `Git + Search + Command Palette` — مجمعة في كارت واحد
* كل كارت: أيقونة 46px + عنوان + وصف سطرين + `code` tag — hover `translateY(-4px)` (نفس `styles.css:324`)

### 4.5 AI Showcase (Tabs — نسخة Cursor)
* 3 أزرار: `Chat` / `Agent` / `Team (Architect→Coder→Reviewer)` — نفس `landing/index.html:330` لكن بتصميم Cursor (underline active بدل pill)
* كل تبويب يعرض `chat-window` أو `snippet big` مع زر `Copy` — منطق موجود في `app.js: tabs`

### 4.6 Models (Grid 4×2)
* 8 كروت: `Gemini 3.7 Flash ⭐` `Claude 4 Sonnet` `GPT-5` `DeepSeek V3` `Qwen3 Coder` `Groq Llama 3.3` `OpenRouter` `Ollama` — نفس `landing/index.html:276`

### 4.7 Tech Stack (Badges)
* `Electron 33 · React 18 · Vite 5 · Monaco · xterm.js · Zustand · MCP` — نفس `landing/index.html:393`

### 4.8 Install / CTA
```html
<section class="cta">
  <h2>Ready to code with Velo IDE?</h2>
  <div class="cta-btns">
    <a href="../release/Velo IDE-Setup-2.0.0.exe" class="btn btn-primary">Download Velo IDE.exe</a>
    <a href="https://github.com/..." class="btn btn-secondary">View Source</a>
  </div>
  <code>npm run dev → npm run dist</code>
</section>
```

### 4.9 Footer
* يسار: `Velo IDE · 2026` + أيقونة
* يمين: `Features · AI · Models · GitHub · Release Notes` + `© Velo Team`

---

## 5. المتطلبات الوظيفية (Functional Requirements)

| # | المتطلب | التفصيل | الحالة |
|---|---------|---------|--------|
| F1 | **زر تحميل يكتشف النظام** | `app.js: getOS()` يغير نص/رابط الزر الرئيسي حسب `navigator.userAgent` | جديد |
| F2 | **روابط مباشرة للإصدارات** | `href="../release/Velo IDE-Setup-2.0.0.exe"` + `Portable` — مع `download` attribute | تحديث من `npm run dist` |
| F3 | **نسخ أمر التثبيت** | `copy-btn` ينسخ `npm run dist` ويظهر `copied` 1.5 ثانية — موجود `landing/index.html:74` نحتفظ به | موجود |
| F4 | **تبديل اللغة** | زر `AR | EN` يبدل `document.documentElement.lang/dir` ويستبدل نصوص `dict` (نفس `src/services/i18n.ts`) — نسخة مبسطة للـ landing | جديد |
| F5 | **Tabs التفاعلية** | `tab-btn` / `tab-panel` — نفس `landing/index.html:331` + `app.js` | موجود |
| F6 | **Reveal on scroll** | `IntersectionObserver` يضيف `visible` لـ `.reveal` — موجود `app.js` | موجود |
| F7 | **ToTop + Navbar blur** | `toTop.visible` + `navbar` `backdrop-filter` — موجود `styles.css:69` | موجود |
| F8 | **Responsive** | `900px` → `hero` عمود واحد، `640px` → `menu-toggle`، `400px` → `models 1col` — موجود `styles.css:659` | موجود |
| F9 | **SEO** | `<title>Velo IDE — AI Code Editor</title>` + `<meta description>` + `og:image` = `assets/velo-preview.png` | تحديث |
| F10 | **تحميل سريع** | لا frameworks، صور `webp` < 300KB، `preload` للخطوط | تحسين |

---

## 6. المتطلبات غير الوظيفية (Non-Functional)

* **الأداء:** `Lighthouse >90` — CSS واحد + JS واحد < 30KB gzipped، لا `node_modules`.
* **التوافق:** Chrome/Edge/Firefox آخر نسختين + Windows 10/11.
* **الوصولية:** `aria-label` للأزرار، تباين `4.5:1`، `keyboard` navigation للـ tabs.
* **الأمان:** روابط `release/` نسبية، لا `inline` JS خطير.

---

## 7. المهام (Tasks — ترتيب التنفيذ)

1. **تحديث النصوص** `index.html:6-30` — العنوان `Velo IDE` + الوصف + `brand-name`.
2. **إعادة Hero** `index.html:46` — عنوان Cursor-style + `primaryDownload` + `hero-preview` بصورة حقيقية من `release/win-unpacked/Velo IDE.exe`.
3. **إضافة OS detector** `app.js` — دالة `getOS()` + ربط `href` للـ `release/Velo IDE-*.exe`.
4. **تبسيط Features** `index.html:103` — من 13 كارت إلى 3-6 كروت.
5. **تحديث AI tabs** لتحاكي Cursor (underline).
6. **إضافة زر لغة** `AR/EN` يبدل `dict` مبسط (نفس مفاتيح `src/services/i18n.ts`).
7. **اختبار** `file://landing/index.html` + `npx serve landing` + Lighthouse.

---

## 8. معايير القبول (Acceptance Criteria)

* [ ] زر Hero يكتشف Windows ويحمّل `Velo IDE-Setup-2.0.0.exe` مباشرة (Network tab يظهر 87MB).
* [ ] على macOS/Linux يظهر `Soon` بدل 404.
* [ ] تغيير اللغة يبدل كل العناوين + `dir` (RTL ↔ LTR) بدون reload.
* [ ] الصفحة تفتح في `<1.5s` على 3G، لا أخطاء Console.
* [ ] Lighthouse: Performance ≥90, Accessibility ≥95, SEO ≥90.
* [ ] نفس الملفات تعمل `file://` و `https://` بدون تعديل مسارات.

---

## 9. ملاحظات (Notes)

* الإصدارات الحالية: `release/Velo IDE-Setup-2.0.0.exe` (87.8MB) و `Portable` (87.5MB) بتاريخ `2026-09-04 19:00` — الروابط في الصفحة يجب أن تشير لهما مباشرة، مع `fallback` لـ `npm run dist` إذا نُقلت الصفحة خارج المشروع.
* الاسم الجديد **Velo IDE** يجب أن يظهر في `<title>` و `brand-name` و `cta` (حالياً `landing/index.html:7` لسه `Velo`).
* لا حاجة لإعادة بناء التطبيق — الصفحة ثابتة وتقرأ ملفات `release/` فقط.
