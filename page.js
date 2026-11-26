import { createConsentFlow, SignInError } from "./consent.js";

const projectUrl = "https://lpkulogbcjxpxesqczea.supabase.co";
const copy = {
  en: {
    language: "Language",
    loading: "Opening connection…",
    signinTitle: "Sign in to Plandoko",
    consentTitle: "Authorize connection",
    redirectTitle: "Returning to the app…",
    errorTitle: "Connection unavailable",
    email: "Email",
    password: "Password",
    signin: "Sign in",
    consentIntro: "This app is requesting access to your Plandoko account.",
    client: "App",
    account: "Account",
    permission: "Plandoko access",
    full: "Read and write",
    "read-only": "Read only",
    scopes: "Requested scopes",
    returnTo: "Returns to",
    approve: "Allow",
    deny: "Deny",
    none: "None",
    badSignin: "Sign-in failed. Check your email and password and try again.",
    badRequest: "Open a new connection request from your connector.",
    badDecision:
      "Your choice could not be saved. Try again or start a new connection from your connector.",
  },
  tr: {
    language: "Dil",
    loading: "Bağlantı açılıyor…",
    signinTitle: "Plandoko’ya giriş yap",
    consentTitle: "Bağlantıya izin ver",
    redirectTitle: "Uygulamaya dönülüyor…",
    errorTitle: "Bağlantı açılamadı",
    email: "E-posta",
    password: "Parola",
    signin: "Giriş yap",
    consentIntro: "Bu uygulama Plandoko hesabına erişmek istiyor.",
    client: "Uygulama",
    account: "Hesap",
    permission: "Plandoko erişimi",
    full: "Okuma ve yazma",
    "read-only": "Yalnız okuma",
    scopes: "İstenen kapsamlar",
    returnTo: "Dönüş adresi",
    approve: "İzin ver",
    deny: "Reddet",
    none: "Yok",
    badSignin:
      "Giriş yapılamadı. E-posta adresini ve parolanı kontrol edip tekrar dene.",
    badRequest: "Konnektöründen yeni bir bağlantı isteği başlat.",
    badDecision:
      "Seçimin kaydedilemedi. Tekrar dene veya konnektöründen yeni bir bağlantı başlat.",
  },
};

const el = (id) => document.getElementById(id);
const title = el("title");
const error = el("error");
const language = el("language");
const form = el("signin");
const consent = el("consent");
const password = el("password");
const authorizationId =
  new URLSearchParams(location.search).get("authorization_id") ?? "";
const controls = document.querySelectorAll(
  "form input, form button, .actions button",
);

let screen = { screen: "loading" };
let errorKey = "";
let busy = false;

function render(focus = false) {
  const t = copy[language.value];
  document.documentElement.lang = language.value;
  for (const node of document.querySelectorAll("[data-copy]")) {
    node.textContent = t[node.dataset.copy];
  }
  const headings = {
    loading: t.loading,
    signin: t.signinTitle,
    consent: t.consentTitle,
    redirect: t.redirectTitle,
    error: t.errorTitle,
  };
  title.textContent = headings[screen.screen];
  error.hidden = !errorKey;
  error.textContent = errorKey ? t[errorKey] : "";
  form.hidden = screen.screen !== "signin";
  consent.hidden = screen.screen !== "consent";
  if (screen.screen === "consent") {
    el("client").textContent = screen.client;
    el("account").textContent = screen.account;
    el("permission").textContent = t[screen.profile];
    el("scopes").textContent = screen.scope || t.none;
    el("return-to").textContent = screen.redirectHost;
  }
  if (focus) title.focus();
}

async function run(action, failure) {
  if (busy) return;
  busy = true;
  for (const control of controls) control.disabled = true;
  errorKey = "";
  render();
  try {
    screen = await action();
    render(true);
    if (screen.screen === "redirect") location.replace(screen.url);
  } catch (e) {
    errorKey = failure;
    if (
      screen.screen === "loading" ||
      (failure === "badSignin" && !(e instanceof SignInError))
    ) {
      screen = { screen: "error" };
      errorKey = "badRequest";
    }
    render();
  } finally {
    busy = false;
    for (const control of controls) control.disabled = false;
  }
}

language.value = navigator.language.toLowerCase().startsWith("tr")
  ? "tr"
  : "en";
language.addEventListener("change", () => render());
render();

try {
  const { publishableKey } = await import("./config.js");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error("Missing publishable key");
  }
  const client = globalThis.supabase.createClient(projectUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const flow = createConsentFlow(client.auth, authorizationId, async (id) => {
    const { data, error } = await client.rpc("mcp_oauth_consent_profile", {
      p_authorization_id: id,
    });
    if (error) throw error;
    return data;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = el("email").value.trim();
    await run(() => flow.signIn(email, password.value), "badSignin");
    password.value = "";
  });
  el("approve").addEventListener(
    "click",
    () => run(() => flow.decide("approve"), "badDecision"),
  );
  el("deny").addEventListener(
    "click",
    () => run(() => flow.decide("deny"), "badDecision"),
  );
  await run(() => flow.load(), "badRequest");
} catch {
  screen = { screen: "error" };
  errorKey = "badRequest";
  render(true);
}
