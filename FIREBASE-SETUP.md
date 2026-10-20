# PEDROO — دليل ربط Firebase

تم ربط موقع PEDROO (`zizA.html`) بمشروع Firebase:

- **Project ID:** `pcpedro-6342c`
- **Authentication:** بريد إلكتروني + كلمة مرور، ودخول Google
- **Firestore:** ملف العميل + مزامنة المفضلة
- **Security Rules:** `firestore.rules` و`storage.rules`
- **SDK:** نسخ محلية داخل `assets/firebase/` (إصدار 10.12.2، بناء compat)
- **زر الدخول:** في الهيدر + داخل قائمة الهاتف

> الملف الأصلي قبل التعديل محفوظ باسم `zizA.backup.html`.

---

## 1) خطوات لازمة في Firebase Console (مرة واحدة)

### أ. تفعيل طرق الدخول

1. افتح <https://console.firebase.google.com/project/pcpedro-6342c/authentication/providers>
2. **Sign-in method** ← فعّل:
   - **Email/Password**
   - **Google** (اختر بريد الدعم)
3. من **Authentication ← Settings ← Authorized domains** تأكد من وجود:
   - `localhost`
   - `pcpedro-6342c.web.app`
   - `pcpedro-6342c.firebaseapp.com`
   - أي نطاق خاص تضيفه لاحقاً

بدون هذه الخطوة سيظهر خطأ:
`auth/operation-not-allowed` أو `auth/unauthorized-domain`.

### ب. إنشاء Firestore

1. افتح <https://console.firebase.google.com/project/pcpedro-6342c/firestore>
2. **Create database** ← اختر **Production mode** ← أقرب منطقة (مثلاً `eur3`).
3. انشر القواعد من القسم التالي.

---

## 2) نشر قواعد الأمان

### الطريقة الأسهل (نسخ ولصق)

1. افتح **Firestore Database ← Rules**.
2. انسخ محتوى `firestore.rules` كاملاً والصقه ثم **Publish**.
3. افتح **Storage ← Rules** (إن كنت ستستخدم رفع الصور لاحقاً) وانسخ `storage.rules`.

### عبر Firebase CLI

```powershell
npm install -g firebase-tools
firebase login
cd "C:\Users\pedroo\OneDrive\Desktop\zinodz"
firebase use pcpedro-6342c
firebase deploy --only firestore:rules,storage:rules
```

ملفات `firebase.json` و`.firebaserc` جاهزة في نفس المجلد.

### ملخص القواعد

| المسار | القراءة | الكتابة |
|---|---|---|
| `users/{uid}` | صاحب الحساب فقط (get) | صاحب الحساب فقط، مع تحقق من الحقول |
| أي مسار آخر | ممنوع | ممنوع |

المفضلة تُخزّن داخل وثيقة المستخدم:

```
users/{uid}
  uid: string
  email: string
  displayName: string
  photoURL?: string
  phone?: string
  wishlist: string[]        // حتى 60 معرفاً
  createdAt: timestamp
  updatedAt: timestamp
```

---

## 3) تشغيل الموقع محلياً (مهم لتسجيل الدخول)

لا تفتح `zizA.html` بالنقر المزدوج أثناء اختبار تسجيل الدخول. شغّل خادماً محلياً:

```powershell
cd "C:\Users\pedroo\OneDrive\Desktop\zinodz"
powershell -ExecutionPolicy Bypass -File "serve.ps1"
```

ثم افتح: <http://localhost:5500/>

- `localhost` مصرّح به افتراضياً في Firebase Authentication.
- تسجيل الدخول بالبريد قد يعمل من `file://`، لكن **Google popup لا يعمل** من الملف مباشرة، كما أن الجلسة أقل استقراراً.
- لا حاجة لأي Node.js أو Python — السكربت يستخدم PowerShell فقط.

---

## 4) النشر على Firebase Hosting (اختياري)

```powershell
cd "C:\Users\pedroo\OneDrive\Desktop\zinodz"
firebase login
firebase use pcpedro-6342c
firebase deploy --only hosting
```

`firebase.json` معدّ ليعرض `zizA.html` لكل المسارات، مع تجاهل ملفات التطوير والنسخ الاحتياطي. بعد النشر سيكون الرابط:

`https://pcpedro-6342c.web.app`

أضف النطاق إلى Authorized domains إن استخدمت نطاقاً مخصصاً.

---

## 5) حماية مفتاح API

مفتاح Firebase ليس سراً — هو يظهر في كل موقع Firebase — لكن يجب تقييده:

1. افتح [Google Cloud Console ← APIs & Services ← Credentials](https://console.cloud.google.com/apis/credentials?project=pcpedro-6342c).
2. اضغط مفتاح المتصفح `AIzaSyBxK…`.
3. **Application restrictions** ← `HTTP referrers`:
   - `http://localhost:5500/*`
   - `https://pcpedro-6342c.web.app/*`
   - `https://pcpedro-6342c.firebaseapp.com/*`
   - نطاقك الخاص لاحقاً.
4. **API restrictions** ← اسمح فقط بـ:
   - Identity Toolkit API
   - Cloud Firestore API
   - Token Service API
   - (وعند الحاجة) Firebase Installations API

هذا لا يغني عن قواعد Firestore؛ القواعد هي خط الدفاع الحقيقي.

---

## 6) ما الذي يعمل الآن؟

- زر **تسجيل الدخول** في الهيدر (وأيقونة المستخدم في الهاتف).
- إنشاء حساب بالبريد وكلمة المرور، مع حفظ الاسم.
- تسجيل الدخول والخروج، واستعادة كلمة المرور بالبريد.
- تسجيل الدخول عبر Google (على http/https).
- عرض الاسم والبريد وحرفَي الاسم في الهيدر بعد الدخول.
- **مزامنة المفضلة** بين الأجهزة: عند الدخول يُدمج المحلي مع السحابي (اتحاد بدون فقدان)، وكل إضافة/إزالة تُحفظ في Firestore بعد 600ms.
- رسائل أخطاء عربية واضحة (بريد خاطئ، كلمة مرور ضعيفة، نطاق غير مصرح…).

### ما لم يُضف بعد

- **الطلبات والدفع:** الطلب الحالي في الموقع واجهة تجريبية (نجاح وهمي + رابط واتساب). لا تُكتب الطلبات في Firestore.
  - للإنتاج: أنشئ الطلب عبر **Cloud Function / خادم** يعيد حساب الأسعار والتحقق من المخزون، ثم اسمح بالقراءة للمستخدم فقط.
  - لا تسمح للعميل بكتابة `total` أو `status` مباشرة.
- **Analytics:** لم نفعّل `getAnalytics` تلقائياً احتراماً للخصوصية (يتطلب موافقة/بانر). `measurementId` محفوظ في الإعدادات وجاهز عند الحاجة.
- رفع الصور الشخصية: القواعد جاهزة، لكن الواجهة لا تحتوي زر رفع بعد.

---

## 7) استكشاف الأخطاء

| الخطأ | السبب | الحل |
|---|---|---|
| `auth/operation-not-allowed` | مزوّد الدخول غير مفعّل | فعّل Email/Password أو Google |
| `auth/unauthorized-domain` | النطاق غير مسجّل | أضفه في Authorized domains |
| `auth/popup-blocked` | المتصفح منع النافذة | اسمح بالنوافذ المنبثقة |
| `permission-denied` | القواعد لم تُنشر أو الحقول ناقصة | انشر `firestore.rules` |
| `failed-precondition` | Firestore غير منشأ | أنشئ قاعدة البيانات |
| لا يظهر زر الدخول | لم يُحمّل SDK محلياً | تأكد من وجود `assets/firebase/*.js` |
| الصفحة تعمل من الملف لكن الدخول لا | `file://` | استخدم `serve.ps1` |

### اختبار سريع من Console المتصفح

```js
firebase.app().options.projectId        // "pcpedro-6342c"
firebase.auth().currentUser             // null أو بيانات المستخدم
firebase.auth().onAuthStateChanged(u => console.log(u))
```

---

## 8) بنية الملفات المضافة

```
zinodz/
├── zizA.html                  ← الموقع بعد إضافة زر ونافذة الحساب
├── zizA.backup.html           ← نسخة قبل Firebase
├── assets/
│   ├── firebase/              ← SDK محلي (app + auth + firestore)
│   └── js/
│       ├── firebase-config.js ← إعدادات المشروع العامة
│       └── pedroo-auth.js     ← منطق تسجيل الدخول والمزامنة
├── firestore.rules
├── storage.rules
├── firebase.json
├── .firebaserc
├── serve.ps1
└── FIREBASE-SETUP.md
```
