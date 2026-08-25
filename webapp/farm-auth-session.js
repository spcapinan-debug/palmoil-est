(() => {
  const SESSION_API = window.__FARM_SESSION_API__ || "/api/farm-session";
  const AUTH_API = window.__FARM_AUTH_API__ || "/api/farm-auth";
  const nativeFetch = window.fetch.bind(window);
  let currentSession = null;
  let ensurePromise = null;
  let signInPromise = null;

  function errorMessage(payload, fallback) {
    return payload?.error?.message || payload?.message || payload?.error || fallback;
  }

  async function requestJson(url, options = {}) {
    const response = await nativeFetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: { ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  async function readSession() {
    const result = await requestJson(SESSION_API);
    if (!result.response.ok || !result.payload?.ok) return null;
    currentSession = result.payload;
    return currentSession;
  }

  async function bootstrapSession() {
    const result = await requestJson(AUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bootstrap" }),
    });
    if (!result.response.ok || !result.payload?.ok || !result.payload.authenticated) return null;
    return readSession();
  }

  function authDialog() {
    let dialog = document.querySelector("[data-farm-auth-dialog]");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.className = "farm-auth-dialog hidden";
    dialog.dataset.farmAuthDialog = "";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "farm-auth-title");
    dialog.innerHTML = `
      <form class="farm-auth-card" data-farm-auth-form novalidate>
        <div class="farm-auth-mark" aria-hidden="true">R</div>
        <div class="farm-auth-heading">
          <p>Kirirat Palm Management</p>
          <h2 id="farm-auth-title">เข้าสู่ระบบงานสวนปาล์ม</h2>
          <span>ยืนยันตัวตนของระบบ Farm เพื่อโหลดข้อมูลจากฐานข้อมูลอย่างปลอดภัย</span>
        </div>
        <label>
          อีเมล
          <input type="email" autocomplete="username" inputmode="email" data-farm-auth-email required>
        </label>
        <label>
          รหัสผ่าน
          <input type="password" autocomplete="current-password" data-farm-auth-password required>
        </label>
        <p class="farm-auth-error hidden" data-farm-auth-error role="alert"></p>
        <button type="submit" data-farm-auth-submit>เข้าสู่ระบบ</button>
        <small>บัญชีต้องมี active Farm profile และสิทธิ์ตามระบบเดิม</small>
      </form>`;
    document.body.append(dialog);
    return dialog;
  }

  function promptSignIn() {
    if (signInPromise) return signInPromise;
    const dialog = authDialog();
    const form = dialog.querySelector("[data-farm-auth-form]");
    const email = dialog.querySelector("[data-farm-auth-email]");
    const password = dialog.querySelector("[data-farm-auth-password]");
    const submit = dialog.querySelector("[data-farm-auth-submit]");
    const error = dialog.querySelector("[data-farm-auth-error]");
    dialog.classList.remove("hidden");
    document.body.classList.add("farm-auth-open");
    window.setTimeout(() => email.focus(), 0);

    signInPromise = new Promise((resolve) => {
      const onSubmit = async (event) => {
        event.preventDefault();
        error.classList.add("hidden");
        error.textContent = "";
        submit.disabled = true;
        submit.textContent = "กำลังเข้าสู่ระบบ…";
        try {
          const result = await requestJson(AUTH_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sign_in",
              email: email.value.trim(),
              password: password.value,
            }),
          });
          if (!result.response.ok || !result.payload?.ok) {
            throw new Error(errorMessage(result.payload, "เข้าสู่ระบบไม่สำเร็จ"));
          }
          const session = await readSession();
          if (!session) throw new Error("สร้าง Farm session ไม่สำเร็จ");
          password.value = "";
          dialog.classList.add("hidden");
          document.body.classList.remove("farm-auth-open");
          form.removeEventListener("submit", onSubmit);
          resolve(session);
        } catch (authError) {
          error.textContent = authError.message || "เข้าสู่ระบบไม่สำเร็จ";
          error.classList.remove("hidden");
          password.select();
        } finally {
          submit.disabled = false;
          submit.textContent = "เข้าสู่ระบบ";
        }
      };
      form.addEventListener("submit", onSubmit);
    }).finally(() => {
      signInPromise = null;
    });
    return signInPromise;
  }

  async function ensureSession({ force = false } = {}) {
    if (currentSession && !force) return currentSession;
    if (ensurePromise) return ensurePromise;
    ensurePromise = (async () => {
      const bootstrapped = await bootstrapSession();
      if (bootstrapped) return bootstrapped;
      return promptSignIn();
    })().finally(() => {
      ensurePromise = null;
    });
    return ensurePromise;
  }

  async function authenticatedFetch(input, options = {}) {
    await ensureSession();
    let response = await nativeFetch(input, { ...options, credentials: "same-origin" });
    if (response.status !== 401) return response;
    currentSession = null;
    await ensureSession({ force: true });
    response = await nativeFetch(input, { ...options, credentials: "same-origin" });
    return response;
  }

  async function signOut() {
    await requestJson(AUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sign_out" }),
    });
    currentSession = null;
  }

  window.farmAuthSession = {
    ensure: ensureSession,
    fetch: authenticatedFetch,
    signOut,
    current: () => currentSession,
  };
})();
