# Velo IDE - نسخة الموبايل (APK) - البناء السحابي

> جهازك ضعيف؟ مش مشكلة! البناء هيتم على سيرفر GitHub مش على جهازك.

## الخطوات (براحة خالص)

### 1. ارفع المشروع على GitHub
1. ادخل على https://github.com/new
2. اختار اسم مثلا `velo-mobile`
3. اعمل `Create repository` (خليه Public عشان البناء المجاني)
4. في الصفحة اللي هتظهر دوس `uploading an existing file` واسحب كل ملفات المشروع ده وارفعه
   - أو لو عندك git:
     ```bash
     git init
     git add .
     git commit -m "velo mobile initial"
     git branch -M main
     git remote add origin https://github.com/USERNAME/velo-mobile.git
     git push -u origin main
     ```

### 2. شغّل البناء السحابي
1. ادخل على الريبو بتاعك في GitHub
2. دوس على تبويب `Actions` فوق
3. هتلاقي `Build Velo APK (Cloud)` على الشمال
4. دوس `Run workflow` -> `Run workflow` (الزرار الأخضر)
5. استنى 5-8 دقايق

### 3. حمّل الـ APK
1. بعد ما يخلص هيظهر علامة صح ✅ خضرا
2. دوس على اسم العملية (آخر run)
3. انزل تحت هتلاقي قسم `Artifacts`
4. حمّل `velo-ide-debug-apk` - جواه ملف `app-debug.apk`
5. انقله لموبايلك وثبّته (قد تحتاج تسمح بـ "تثبيت من مصادر غير معروفة")

## ملاحظات للموبايل
- التيرمنال الحقيقي غير مدعوم على الموبايل (هيظهر فاضي)
- الملفات محفوظة داخل التطبيق فقط (نظام ملفات وهمي في localStorage) - للتجربة
- الذكاء الاصطناعي يشتغل مباشرة من المتصفح (OpenAI / DeepSeek / OpenRouter) - حط الـ API Key في الإعدادات
- الواجهة محسّنة للموبايل تلقائياً عبر capacitorShim

## التحديث بعد التعديل
كل مرة تعدل كود وترفعه `git push` هيبني APK جديد تلقائياً. أو شغّله يدوياً من Actions.

## البناء المحلي (لو جهازك قوي بعد كده)
```bash
npm run build:mobile
npx cap sync android
npx cap open android  # يفتح Android Studio
```

## مشاكل شائعة
- لو البناء فشل: تأكد انك رفعت كل الملفات بما فيها `android/` و `capacitor.config.ts`
- لو الـ APK مش بيتثبت: احذف النسخة القديمة الأول
