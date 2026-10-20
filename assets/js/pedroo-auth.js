/* ==========================================================================
   PEDROO — Firebase Authentication + Firestore wishlist sync
   --------------------------------------------------------------------------
   Requires (loaded before this file):
     assets/firebase/firebase-app-compat.js
     assets/firebase/firebase-auth-compat.js
     assets/firebase/firebase-firestore-compat.js
     assets/js/firebase-config.js
     the store's main inline script (exposes window.PEDROO)
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var modal = $('#authModal');
  if (!modal) return;
  var cfg = window.PEDROO_FIREBASE;

  var ui = {
    signedOut: $('#authSignedOut'),
    signedIn: $('#authSignedIn'),
    msg: $('#authMessage'),
    accountMsg: $('#authAccountMsg'),
    signinForm: $('#authSigninForm'),
    registerForm: $('#authRegisterForm'),
    signinEmail: $('#authEmail'),
    signinPass: $('#authPassword'),
    regName: $('#authName'),
    regEmail: $('#authEmailNew'),
    regPass: $('#authPasswordNew'),
    signinBtn: $('#signinBtn'),
    registerBtn: $('#registerBtn'),
    googleBtn: $('#googleBtn'),
    accountBtn: $('#accountBtn'),
    accountIcon: $('#accountIcon'),
    accountAvatar: $('#accountAvatar'),
    accountLabel: $('#accountLabel'),
    mobileLabel: $('#mobileAccountLabel'),
    nameOut: $('#authNameOut'),
    emailOut: $('#authEmailOut'),
    avatarOut: $('#authAvatar'),
    wishCount: $('#authWishCount'),
    continueBtn: $('#authContinue'),
    signOutBtn: $('#signOutBtn'),
    forgotBtn: $('#forgotBtn')
  };

  var auth = null;
  var db = null;
  var currentUser = null;
  var profileReady = false;
  var syncingFromRemote = false;
  var syncTimer = null;
  var pendingName = '';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------------------------------------------------------------- UI --- */
  function setMessage(text, type, target) {
    var el = target || ui.msg;
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('show', !!text);
    el.classList.remove('error', 'success');
    if (type) el.classList.add(type);
  }

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.original) btn.dataset.original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="auth-loading"></span> ' + (busyText || 'جارٍ...');
    } else {
      btn.disabled = false;
      if (btn.dataset.original) {
        btn.innerHTML = btn.dataset.original;
        delete btn.dataset.original;
      }
    }
  }

  function selectTab(name) {
    $$('[data-auth-tab]', modal).forEach(function (btn) {
      btn.setAttribute('aria-selected', String(btn.getAttribute('data-auth-tab') === name));
    });
    $$('[data-auth-form]', modal).forEach(function (form) {
      form.classList.toggle('is-active', form.getAttribute('data-auth-form') === name);
    });
    setMessage('', null);
  }

  function openAuth(tab) {
    if (window.PEDROO && window.PEDROO.closeMenu) window.PEDROO.closeMenu();
    if (!currentUser) selectTab(tab === 'register' ? 'register' : 'signin');
    else if (tab) selectTab(tab);

    if (!modal.classList.contains('open')) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      if (window.PEDROO && window.PEDROO.syncLock) window.PEDROO.syncLock();
      var target = currentUser ? ui.continueBtn : (tab === 'register' ? ui.regName : ui.signinEmail);
      setTimeout(function () {
        if (target) target.focus({ preventScroll: true });
      }, 180);
    }
    if (location.protocol === 'file:' && !currentUser && !ui.msg.classList.contains('show')) {
      setMessage('ملاحظة: لتسجيل الدخول عبر Google واستقرار الجلسة، شغّل الموقع عبر http://localhost أو استضافة. الدخول بالبريد قد يعمل من الملف مباشرة.', null);
    }
  }

  function closeAuth() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (window.PEDROO && window.PEDROO.syncLock) window.PEDROO.syncLock();
    if (modal.contains(document.activeElement) && ui.accountBtn) {
      ui.accountBtn.focus({ preventScroll: true });
    }
  }

  function authUnavailable(text) {
    setMessage(text, 'error');
    [ui.signinBtn, ui.registerBtn, ui.googleBtn, ui.forgotBtn].forEach(function (btn) {
      if (btn) btn.disabled = true;
    });
  }

  /* ------------------------------------------------------------- errors --- */
  function formatError(err) {
    var code = (err && err.code) || '';
    var map = {
      'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
      'auth/missing-password': 'يرجى إدخال كلمة المرور.',
      'auth/weak-password': 'كلمة المرور ضعيفة — استخدم 8 أحرف على الأقل.',
      'auth/email-already-in-use': 'هذا البريد مسجّل بالفعل. جرّب تسجيل الدخول أو استعادة كلمة المرور.',
      'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني.',
      'auth/wrong-password': 'كلمة المرور غير صحيحة.',
      'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/invalid-login-credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/too-many-requests': 'محاولات كثيرة جداً. انتظر قليلاً ثم أعد المحاولة.',
      'auth/network-request-failed': 'تعذّر الاتصال بالشبكة. تحقّق من الإنترنت وأعد المحاولة.',
      'auth/popup-closed-by-user': 'أُغلقت نافذة Google قبل إكمال تسجيل الدخول.',
      'auth/popup-blocked': 'المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.',
      'auth/cancelled-popup-request': 'تم إلغاء محاولة الدخول.',
      'auth/unauthorized-domain': 'هذا النطاق غير مصرّح في Firebase. أضفه من Authentication ← Settings ← Authorized domains.',
      'auth/operation-not-allowed': 'طريقة الدخول هذه غير مفعّلة. فعّل Email/Password أو Google من Firebase Console.',
      'auth/account-exists-with-different-credential': 'هذا البريد مرتبط بطريقة دخول أخرى. استخدم الطريقة الأصلية.',
      'auth/requires-recent-login': 'لأسباب أمنية، أعد تسجيل الدخول ثم حاول مجدداً.',
      'permission-denied': 'تم تسجيل الدخول، لكن قواعد Firestore منعت حفظ البيانات. انشر القواعد الموجودة في firestore.rules.',
      'failed-precondition': 'قاعدة Firestore غير مهيأة بعد. أنشئ Firestore من Firebase Console ثم أعد المحاولة.',
      'unavailable': 'تعذّر الوصول إلى Firestore الآن. تحقّق من الإنترنت وأعد المحاولة.',
      'not-found': 'لم يتم العثور على بيانات الحساب بعد.'
    };
    if (map[code]) return map[code];
    return 'حدث خطأ غير متوقع' + (code ? ' (' + code + ')' : '') + '. حاول مرة أخرى.';
  }

  /* --------------------------------------------------------- account UI --- */
  function displayName(user) {
    var name = (user.displayName || pendingName || '').trim();
    if (name) return name;
    var email = user.email || '';
    return email ? email.split('@')[0] : 'عميل PEDROO';
  }

  function initialsFor(user) {
    var name = displayName(user).trim();
    var parts = name.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function firstWord(user) {
    return displayName(user).split(/\s+/)[0] || 'حسابي';
  }

  function paintAvatar(el, user, initials) {
    if (!el) return;
    el.textContent = '';
    if (user.photoURL) {
      var img = document.createElement('img');
      img.src = user.photoURL;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () {
        el.textContent = initials;
      });
      el.appendChild(img);
    } else {
      el.textContent = initials;
    }
  }

  function updateWishCount() {
    if (!ui.wishCount) return;
    var count = window.PEDROO ? window.PEDROO.getWishlist().length : 0;
    ui.wishCount.textContent = String(count);
  }

  function renderAuthState(user) {
    var signedIn = !!user;
    if (ui.signedOut) ui.signedOut.hidden = signedIn;
    if (ui.signedIn) ui.signedIn.hidden = !signedIn;
    if (ui.accountBtn) ui.accountBtn.classList.toggle('signed-in', signedIn);

    if (signedIn) {
      var name = displayName(user);
      var initials = initialsFor(user);
      if (ui.accountLabel) ui.accountLabel.textContent = firstWord(user);
      if (ui.accountBtn) ui.accountBtn.setAttribute('aria-label', 'حساب ' + name);
      if (ui.accountIcon) ui.accountIcon.style.display = 'none';
      if (ui.accountAvatar) {
        ui.accountAvatar.hidden = false;
        ui.accountAvatar.style.display = 'grid';
        ui.accountAvatar.textContent = initials;
      }
      if (ui.mobileLabel) ui.mobileLabel.textContent = 'حسابي · ' + firstWord(user);
      if (ui.nameOut) ui.nameOut.textContent = name;
      if (ui.emailOut) ui.emailOut.textContent = user.email || '';
      paintAvatar(ui.avatarOut, user, initials);
      updateWishCount();
    } else {
      if (ui.accountLabel) ui.accountLabel.textContent = 'تسجيل الدخول';
      if (ui.accountBtn) ui.accountBtn.setAttribute('aria-label', 'تسجيل الدخول إلى حسابك');
      if (ui.accountIcon) ui.accountIcon.style.display = '';
      if (ui.accountAvatar) {
        ui.accountAvatar.hidden = true;
        ui.accountAvatar.style.display = 'none';
        ui.accountAvatar.textContent = 'P';
      }
      if (ui.mobileLabel) ui.mobileLabel.textContent = 'حسابي · تسجيل الدخول';
      updateWishCount();
    }
  }

  /* ------------------------------------------------------ Firestore data --- */
  function loadProfile(user, nameOverride) {
    if (!db || !user) return Promise.resolve();
    var ref = db.collection('users').doc(user.uid);
    profileReady = false;

    return ref.get().then(function (snap) {
      var data = snap.exists ? (snap.data() || {}) : {};
      var local = window.PEDROO ? window.PEDROO.getWishlist() : [];
      var remote = Array.isArray(data.wishlist) ? data.wishlist : [];
      var merged = [];
      remote.concat(local).forEach(function (id) {
        if (typeof id === 'string' && merged.indexOf(id) === -1) merged.push(id);
      });

      if (window.PEDROO && merged.length !== local.length) {
        syncingFromRemote = true;
        window.PEDROO.setWishlist(merged);
        syncingFromRemote = false;
      }

      var payload = {
        uid: user.uid,
        email: user.email || '',
        displayName: nameOverride || user.displayName || data.displayName || 'عميل PEDROO',
        photoURL: user.photoURL || data.photoURL || '',
        wishlist: merged,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (!snap.exists) {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      return ref.set(payload, { merge: true }).then(function () {
        profileReady = true;
        pendingName = '';
        setMessage('', null, ui.accountMsg);
        updateWishCount();
      });
    }).catch(function (err) {
      if (window.console && console.warn) console.warn('[PEDROO] profile error:', err && err.code);
      setMessage(formatError(err), 'error', ui.accountMsg);
    });
  }

  function saveWishlist() {
    if (!currentUser || !db || !profileReady) return;
    var ids = window.PEDROO ? window.PEDROO.getWishlist() : [];
    db.collection('users').doc(currentUser.uid).set({
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: displayName(currentUser),
      photoURL: currentUser.photoURL || '',
      wishlist: ids,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function (err) {
      if (window.console && console.warn) console.warn('[PEDROO] wishlist sync error:', err && err.code);
    });
  }

  function handleAuthState(user) {
    currentUser = user;
    renderAuthState(user);
    if (user) {
      setMessage('', null, ui.accountMsg);
      loadProfile(user);
    } else {
      profileReady = false;
      pendingName = '';
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
      if (ui.signinForm) ui.signinForm.reset();
      if (ui.registerForm) ui.registerForm.reset();
      if (ui.accountMsg) setMessage('', null, ui.accountMsg);
    }
  }

  /* ------------------------------------------------------------- actions --- */
  function signIn(e) {
    e.preventDefault();
    if (!auth) return;
    var email = (ui.signinEmail.value || '').trim();
    var pass = ui.signinPass.value || '';
    if (!EMAIL_RE.test(email)) {
      setMessage('يرجى إدخال بريد إلكتروني صحيح.', 'error');
      ui.signinEmail.focus();
      return;
    }
    if (!pass) {
      setMessage('يرجى إدخال كلمة المرور.', 'error');
      ui.signinPass.focus();
      return;
    }
    setMessage('', null);
    setBusy(ui.signinBtn, true, 'جارٍ تسجيل الدخول...');
    auth.signInWithEmailAndPassword(email, pass).then(function () {
      setMessage('تم تسجيل الدخول بنجاح. مرحباً بك مجدداً.', 'success');
      ui.signinForm.reset();
    }).catch(function (err) {
      setMessage(formatError(err), 'error');
    }).then(function () {
      setBusy(ui.signinBtn, false);
    });
  }

  function register(e) {
    e.preventDefault();
    if (!auth) return;
    var name = (ui.regName.value || '').trim();
    var email = (ui.regEmail.value || '').trim();
    var pass = ui.regPass.value || '';
    if (name.length < 2) {
      setMessage('يرجى إدخال اسمك الكامل (حرفان على الأقل).', 'error');
      ui.regName.focus();
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setMessage('يرجى إدخال بريد إلكتروني صحيح.', 'error');
      ui.regEmail.focus();
      return;
    }
    if (pass.length < 8) {
      setMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل.', 'error');
      ui.regPass.focus();
      return;
    }
    pendingName = name;
    setMessage('', null);
    setBusy(ui.registerBtn, true, 'جارٍ إنشاء الحساب...');

    auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
      return cred.user.updateProfile({ displayName: name }).then(function () {
        return cred.user;
      });
    }).then(function (user) {
      renderAuthState(user);
      return loadProfile(user, name);
    }).then(function () {
      setMessage('تم إنشاء حسابك بنجاح. مفضلتك ستبدأ بالمزامنة الآن.', 'success');
      ui.registerForm.reset();
      if (window.PEDROO) window.PEDROO.toast('تم إنشاء الحساب بنجاح');
    }).catch(function (err) {
      pendingName = '';
      setMessage(formatError(err), 'error');
    }).then(function () {
      setBusy(ui.registerBtn, false);
    });
  }

  function googleSignIn() {
    if (!auth) return;
    if (location.protocol === 'file:') {
      setMessage('تسجيل الدخول عبر Google يحتاج تشغيل الموقع عبر خادم محلي (http://localhost) أو استضافة. افتح serve.ps1 ثم أعد المحاولة.', 'error');
      return;
    }
    setMessage('', null);
    setBusy(ui.googleBtn, true, 'جارٍ فتح Google...');
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(provider).then(function () {
      setMessage('تم تسجيل الدخول عبر Google بنجاح.', 'success');
    }).catch(function (err) {
      setMessage(formatError(err), 'error');
    }).then(function () {
      setBusy(ui.googleBtn, false);
    });
  }

  function forgotPassword() {
    if (!auth) return;
    var email = ((ui.signinEmail.value || '').trim() || (ui.regEmail.value || '').trim());
    if (!EMAIL_RE.test(email)) {
      setMessage('أدخل بريدك الإلكتروني أولاً ثم اضغط «نسيت كلمة المرور؟».', 'error');
      ui.signinEmail.focus();
      return;
    }
    setMessage('', null);
    auth.sendPasswordResetEmail(email).then(function () {
      setMessage('أرسلنا رابط إعادة تعيين كلمة المرور إلى ' + email + '. تحقّق من بريدك (والمجلد غير المرغوب).', 'success');
    }).catch(function (err) {
      setMessage(formatError(err), 'error');
    });
  }

  function signOut() {
    if (!auth) return;
    setBusy(ui.signOutBtn, true, 'جارٍ تسجيل الخروج...');
    auth.signOut().then(function () {
      if (window.PEDROO) window.PEDROO.toast('تم تسجيل الخروج');
    }).catch(function (err) {
      setMessage(formatError(err), 'error', ui.accountMsg);
    }).then(function () {
      setBusy(ui.signOutBtn, false);
      renderAuthState(null);
    });
  }

  /* --------------------------------------------------------------- init --- */
  function initFirebase() {
    if (!window.firebase || !cfg) {
      authUnavailable('تعذّر تحميل Firebase SDK. تحقّق من وجود مجلد assets/firebase ثم أعد فتح الصفحة.');
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
    } catch (err) {
      if (!err || err.code !== 'app/duplicate-app') {
        authUnavailable('تعذّر تهيئة Firebase: ' + ((err && err.message) || 'خطأ غير معروف'));
        return;
      }
    }
    try {
      auth = firebase.auth();
      db = firebase.firestore();
      auth.languageCode = 'ar';
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
      auth.onAuthStateChanged(handleAuthState);
      if (window.console && console.info) {
        console.info('[PEDROO] Firebase ready — project: ' + cfg.projectId);
      }
    } catch (err) {
      authUnavailable('تعذّر تشغيل خدمة الحسابات: ' + ((err && err.message) || 'خطأ غير معروف'));
    }
  }

  /* -------------------------------------------------------------- bindings - */
  $$('[data-open-auth]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openAuth();
    });
  });
  var closeBtn = $('#closeAuth');
  if (closeBtn) closeBtn.addEventListener('click', closeAuth);
  if (ui.continueBtn) ui.continueBtn.addEventListener('click', closeAuth);

  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeAuth();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      e.stopPropagation();
      closeAuth();
    }
  }, true);

  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var items = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', modal)
      .filter(function (el) { return el.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  $$('[data-auth-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectTab(btn.getAttribute('data-auth-tab'));
      var form = $('[data-auth-form].is-active', modal);
      var firstInput = form ? form.querySelector('input') : null;
      if (firstInput) firstInput.focus();
    });
  });

  if (ui.signinForm) ui.signinForm.addEventListener('submit', signIn);
  if (ui.registerForm) ui.registerForm.addEventListener('submit', register);
  if (ui.googleBtn) ui.googleBtn.addEventListener('click', googleSignIn);
  if (ui.forgotBtn) ui.forgotBtn.addEventListener('click', forgotPassword);
  if (ui.signOutBtn) ui.signOutBtn.addEventListener('click', signOut);

  document.addEventListener('pedroo:wishlistchange', function () {
    updateWishCount();
    if (!currentUser || !db || syncingFromRemote || !profileReady) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncTimer = null;
      saveWishlist();
    }, 600);
  });

  window.PEDROOAuth = {
    open: openAuth,
    close: closeAuth,
    currentUser: function () { return currentUser; }
  };

  initFirebase();
})();
