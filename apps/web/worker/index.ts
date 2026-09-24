import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";

import {
  addEntryFollowUpInputSchema,
  captureEntryInputSchema,
  matchesEntryMediaSignature,
  confirmActionInputSchema,
  createGameLibraryItemInputSchema,
  importDryRunInputSchema,
  listEntriesInputSchema,
  listMediaWorksInputSchema,
  logMediaInputSchema,
  settingsSchema,
  updateEntryInputSchema,
  updateGameLibraryItemInputSchema,
  type CoreBinding,
  type DashboardResponse,
  type EntryMediaMimeType,
} from "@life-ledger/contracts";

import {
  EntryMediaUploadError,
  isEntryMediaKey,
  parseByteRange,
  planEntryMediaUpload,
} from "./entry-media";
import {
  RequestBodyTooLargeError,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createLoginRateLimitKey,
  createSessionCookie,
  createSessionToken,
  getCookie,
  passwordMatches,
  readUrlEncodedBody,
  safeReturnPath,
  verifySessionToken,
} from "./auth";

export interface Env {
  CORE: CoreBinding;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  AUTH_PASSWORD: string;
  AUTH_SESSION_SECRET: string;
  AUTH_RATE_LIMITER: RateLimit;
  ENVIRONMENT: string;
  PUBLIC_ORIGINS?: string;
  PRIVATE_ORIGINS?: string;
}

interface Variables {
  requestId: string;
}

export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const AUTH_CONFIGURATION_ERROR =
  "Authentication is temporarily unavailable. Check the Worker secret bindings.";

function hasValidSessionSecret(env: Env): boolean {
  return (
    typeof env.AUTH_SESSION_SECRET === "string" &&
    new TextEncoder().encode(env.AUTH_SESSION_SECRET).byteLength >= 32
  );
}

function hasValidAuthConfiguration(env: Env): boolean {
  return (
    typeof env.AUTH_PASSWORD === "string" &&
    env.AUTH_PASSWORD.length > 0 &&
    hasValidSessionSecret(env)
  );
}

function isPublicPath(path: string, method: string): boolean {
  return (
    (path.startsWith("/upload/entry-media/") && method === "PUT") ||
    path === "/public/v1/anime" ||
    path === "/public/v1/timeline" ||
    (
      path.startsWith("/public-media/") &&
      (method === "GET" || method === "HEAD" || method === "OPTIONS")
    )
  );
}

function isAuthPath(path: string): boolean {
  return path === "/auth" || path.startsWith("/auth/");
}

function requestWantsHtml(request: Request): boolean {
  return (
    request.headers.get("sec-fetch-mode") === "navigate" ||
    request.headers.get("accept")?.includes("text/html") === true
  );
}

function requestEtagMatches(header: string | undefined, etag: string): boolean {
  return (
    header
      ?.split(",")
      .map((value) => value.trim())
      .some((value) => value === "*" || value === etag) === true
  );
}

function mediaKeyFromPath(path: string): string | null {
  const key = path.slice("/media/".length);
  return /^covers\/(?:anime|screen|game)\/[a-z0-9][a-z0-9-]*-v\d+\.webp$/.test(
    key,
  ) || isEntryMediaKey(key)
    ? key
    : null;
}

function publicMediaKeyFromPath(path: string): string | null {
  const key = path.slice("/public-media/".length);
  return /^(?:media-covers|entry-images|other-images)\/(?:[A-Za-z0-9][A-Za-z0-9_-]{0,127}|unassigned|work-[a-f0-9]{24})\/[a-f0-9]{64}\.(?:webp|jpg|png)$/.test(
    key,
  )
    ? key
    : null;
}

function browserCachePolicy(path: string): string | null {
  if (
    /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:css|js)$/.test(path)
  ) {
    return "private, max-age=31536000, immutable";
  }
  if (
    path.startsWith("/assets/anime-ui/") ||
    path.startsWith("/assets/fonts/")
  ) {
    return "private, max-age=2592000";
  }
  if (path === "/favicon.svg") {
    return "private, max-age=604800";
  }
  return null;
}

function isAllowedOrigin(request: Request, configuredOrigins = ""): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  const allowedOrigins = new Set([
    new URL(request.url).origin,
    ...configuredOrigins
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ]);
  return allowedOrigins.has(origin);
}

function authenticationUnavailable(
  path: string,
  requestId: string,
): Response {
  if (path.startsWith("/api/")) {
    return Response.json(
      {
        error: {
          code: "AUTH_CONFIGURATION_INVALID",
          message: AUTH_CONFIGURATION_ERROR,
          requestId,
          retryable: true,
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return new Response(AUTH_CONFIGURATION_ERROR, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function unauthorizedApi(requestId: string): Response {
  return Response.json(
    {
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "A valid Life Ledger session is required.",
        requestId,
        retryable: false,
      },
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Cookie realm="Life Ledger"',
      },
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loginPage(nextPath: string, errorMessage?: string): string {
  const safeNextPath = safeReturnPath(nextPath);
  const error = errorMessage
    ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%23111522'/%3E%3Cpath d='M22 15v34h23v-7H30V15z' fill='%23fff'/%3E%3C/svg%3E">
    <title>登录 · Life Ledger</title>
    <style>
      :root { color-scheme: dark; font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; overflow-x: hidden; color: #fff; background: #071329; }
      .world { position: relative; isolation: isolate; display: grid; min-height: 100vh; grid-template-columns: minmax(0, 1.42fr) minmax(380px, .58fr); overflow: hidden; }
      .world::before { position: absolute; z-index: -3; top: 50%; left: -19vmax; width: 104vmax; height: 104vmax; border: 1px solid rgba(255,255,255,.42); border-radius: 50%; background: radial-gradient(circle at 54% 43%, rgba(70,198,255,.25), transparent 25%), linear-gradient(145deg,#159cf4,#8ee7ff 45%,#ffb04d); content: ""; transform: translateY(-50%); }
      .world::after { position: absolute; z-index: -1; inset: 0; pointer-events: none; background: linear-gradient(90deg,rgba(2,10,27,.12),rgba(3,15,35,.12) 52%,rgba(5,14,31,.93) 76%),linear-gradient(180deg,transparent 48%,rgba(3,11,27,.88)); content: ""; }
      .visual { position: relative; min-height: 100vh; padding: clamp(38px,5vw,76px); }
      .visual::before { position: absolute; z-index: -2; inset: 0; background: url("/auth/art/mono-characters.webp") 48% 100% / min(85vw,1180px) auto no-repeat; filter: drop-shadow(0 26px 35px rgba(2,8,22,.38)); content: ""; }
      .brand { display: inline-flex; align-items: center; gap: 14px; color: #fff; }
      .brand-mark { display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid #fff; border-radius: 50%; background: #111522; box-shadow: 5px 5px 0 #ff4fa3; font-family: Georgia,serif; font-size: 26px; font-weight: 700; }
      .brand strong { display: block; font-family: Georgia,"Songti SC",serif; font-size: 20px; }
      .brand small { display: block; margin-top: 2px; color: #d0f1ff; font-size: 8px; letter-spacing: .22em; }
      .chapter { position: absolute; right: 4.8vw; bottom: 5vh; display: flex; align-items: flex-end; gap: 12px; }
      .chapter strong { font-family: Georgia,"Songti SC",serif; font-size: clamp(74px,9vw,148px); font-weight: 400; line-height: .7; text-shadow: 0 5px 40px rgba(0,0,0,.4); }
      .chapter span { padding-bottom: 4px; color: #9beaff; font-size: 9px; letter-spacing: .24em; writing-mode: vertical-rl; }
      .vertical { position: absolute; top: 12vh; right: 4vw; color: rgba(255,255,255,.84); font-family: "Yu Mincho","Songti SC",serif; font-size: 13px; letter-spacing: .28em; writing-mode: vertical-rl; }
      .access { position: relative; display: grid; min-height: 100vh; place-items: center; padding: 34px clamp(26px,4vw,72px); border-left: 1px solid rgba(255,255,255,.45); background: rgba(4,13,31,.54); backdrop-filter: blur(18px); }
      main { position: relative; width: min(100%,430px); padding: 48px 0 37px; border-top: 1px solid rgba(255,255,255,.62); border-bottom: 1px solid rgba(255,255,255,.62); }
      main::before { position: absolute; top: -5px; left: 0; width: 92px; height: 9px; background: linear-gradient(90deg,#159cf4 0 42%,#ff4fa3 42% 73%,#ff8a00 73%); content: ""; }
      .eyebrow { margin: 0 0 13px; color: #85e7ff; font-size: 9px; font-weight: 800; letter-spacing: .25em; text-transform: uppercase; }
      h1 { margin: 0; font-family: Georgia,"Songti SC",serif; font-size: clamp(54px,5vw,76px); font-weight: 500; letter-spacing: -.055em; line-height: .88; }
      .hint { max-width: 330px; margin: 18px 0 31px; color: #abc7d9; font-size: 13px; line-height: 1.8; }
      label { display: block; margin-bottom: 9px; color: #cde6f4; font-size: 10px; font-weight: 750; letter-spacing: .12em; }
      input { width: 100%; height: 54px; padding: 0 16px; border: 1px solid rgba(194,232,251,.62); border-radius: 0; background: rgba(255,255,255,.09); color: #fff; font: inherit; letter-spacing: .08em; }
      input:focus { border-color: #7be6ff; outline: 3px solid rgba(21,156,244,.22); outline-offset: 2px; }
      button { width: 100%; height: 54px; margin-top: 18px; border: 1px solid #fff; border-radius: 0; background: #ff8a00; color: #111522; box-shadow: 5px 5px 0 #fff; font: inherit; font-size: 12px; font-weight: 850; letter-spacing: .08em; cursor: pointer; transition: transform .16s ease,box-shadow .16s ease,background .16s ease; }
      button:hover { background: #ffab47; box-shadow: 2px 2px 0 #fff; transform: translate(3px,3px); }
      .error { margin: 0 0 18px; padding: 12px 14px; border: 1px solid #ff6685; border-radius: 0; background: rgba(112,10,40,.55); color: #ffd9e2; font-size: 13px; line-height: 1.5; }
      .private-note { display: flex; align-items: center; gap: 9px; margin-top: 25px; color: #91b3c7; font-size: 10px; }
      .private-note i { width: 7px; height: 7px; border-radius: 50%; background: #20dced; box-shadow: 0 0 0 5px rgba(32,220,237,.13); }
      @media (max-width: 880px) {
        .world { grid-template-columns: 1fr; }
        .visual { min-height: 41vh; padding: 28px; }
        .visual::before { background-position: 50% 100%; background-size: min(150vw,880px) auto; }
        .world::after { background: linear-gradient(180deg,rgba(2,9,24,.03) 0 28%,rgba(4,13,31,.9) 46%); }
        .chapter { right: 24px; bottom: 25px; }
        .chapter strong { font-size: 82px; }
        .vertical { display: none; }
        .access { min-height: 59vh; padding: 45px 24px 58px; border-top: 1px solid rgba(255,255,255,.4); border-left: 0; background: rgba(4,13,31,.78); }
        main { width: min(100%,480px); padding-top: 40px; }
      }
      @media (max-width: 520px) {
        .visual { min-height: 35vh; padding: 21px; }
        .visual::before { background-size: 194vw auto; }
        .brand-mark { width: 39px; height: 39px; font-size: 21px; }
        .brand strong { font-size: 17px; }
        .chapter { bottom: 15px; }
        .chapter strong { font-size: 64px; }
        .access { min-height: 65vh; padding: 38px 19px 45px; }
        h1 { font-size: 53px; }
      }
      @media (prefers-reduced-motion:reduce) { button { transition: none; } }
    </style>
  </head>
  <body>
    <div class="world">
      <section class="visual" aria-hidden="true">
        <div class="brand">
          <span class="brand-mark">L</span>
          <span><strong>Life Ledger</strong><small>PRIVATE MEMORY ARCHIVE</small></span>
        </div>
        <span class="vertical">只属于一个人的记忆世界</span>
        <div class="chapter"><strong>01</strong><span>PERSONAL WORLD</span></div>
      </section>
      <section class="access">
        <main>
          <p class="eyebrow">PRIVATE ACCESS / 記憶保管庫</p>
          <h1>回到你的<br>记录世界</h1>
          <p class="hint">这里的时间线、评分与原始表达只向你开放。输入访问密码继续。</p>
          ${error}
          <form action="/auth/login?next=${encodeURIComponent(safeNextPath)}" method="post">
            <input type="hidden" name="next" value="${escapeHtml(safeNextPath)}">
            <input type="hidden" name="username" value="owner" autocomplete="username">
            <label for="password">ACCESS PASSWORD / 访问密码</label>
            <input id="password" name="password" type="password" maxlength="256" autocomplete="current-password" required autofocus>
            <button type="submit">进入私人账本 →</button>
          </form>
          <p class="private-note"><i></i> 单用户访问 · 12 小时安全会话 · 默认私人</p>
        </main>
      </section>
    </div>
  </body>
</html>`;
}

function logoutPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>退出 · Life Ledger</title>
    <style>
      :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #f5f6f8; color: #17191d; }
      main { width: min(calc(100% - 48px), 390px); padding: 36px; border: 1px solid #e4e7ec; border-radius: 20px; background: #fff; text-align: center; }
      h1 { margin: 0 0 10px; }
      p { color: #697386; }
      button { width: 100%; height: 48px; margin-top: 14px; border: 0; border-radius: 12px; background: #17191d; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>退出 Life Ledger？</h1>
      <p>当前浏览器中的会话将被清除。</p>
      <form action="/auth/logout" method="post">
        <button type="submit">确认退出</button>
      </form>
    </main>
  </body>
</html>`;
}

app.use("*", async (context, next) => {
  const hostname = new URL(context.req.url).hostname;
  const isLocalHost = hostname === "127.0.0.1" || hostname === "localhost";
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: isLocalHost
        ? ["'self'", "'unsafe-inline'"]
        : ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: isLocalHost
        ? ["'self'", "ws:", "wss:"]
        : ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
  })(context, next);
});

app.use("*", async (context, next) => {
  const requestId = context.req.header("x-request-id") || `req_${crypto.randomUUID()}`;
  context.set("requestId", requestId);
  await next();
  context.header("x-request-id", requestId);
});

app.use("/public/*", async (context, next) => {
  const allowedOrigins = (context.env.PUBLIC_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) =>
      !origin || allowedOrigins.length === 0
        ? "*"
        : allowedOrigins.includes(origin)
          ? origin
          : "",
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: ["If-None-Match"],
    exposeHeaders: ["ETag"],
    maxAge: 86400,
  })(context, next);
});

app.use("/public-media/*", async (context, next) => {
  const allowedOrigins = (context.env.PUBLIC_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) =>
      !origin || allowedOrigins.length === 0
        ? "*"
        : allowedOrigins.includes(origin)
          ? origin
          : "",
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: ["If-None-Match"],
    exposeHeaders: ["ETag", "Content-Length", "Content-Type"],
    maxAge: 86400,
  })(context, next);
});

app.use("*", async (context, next) => {
  if (
    isPublicPath(context.req.path, context.req.method) ||
    isAuthPath(context.req.path)
  ) {
    return next();
  }
  if (!hasValidSessionSecret(context.env)) {
    return authenticationUnavailable(
      context.req.path,
      context.get("requestId"),
    );
  }

  const token = getCookie(
    context.req.header("cookie") ?? null,
    SESSION_COOKIE_NAME,
  );
  const session = token
    ? await verifySessionToken(token, context.env.AUTH_SESSION_SECRET)
    : null;
  if (session) {
    await next();
    if (
      context.req.path.startsWith("/api/") ||
      requestWantsHtml(context.req.raw)
    ) {
      context.header("Cache-Control", "private, no-store");
      context.header("Vary", "Cookie");
    }
    return;
  }

  if (context.req.path.startsWith("/api/")) {
    return unauthorizedApi(context.get("requestId"));
  }
  if (
    (context.req.method === "GET" || context.req.method === "HEAD") &&
    requestWantsHtml(context.req.raw)
  ) {
    const requestUrl = new URL(context.req.url);
    const returnPath = safeReturnPath(
      `${requestUrl.pathname}${requestUrl.search}`,
    );
    context.header("Cache-Control", "no-store");
    return context.redirect(
      `/auth/login?next=${encodeURIComponent(returnPath)}`,
      303,
    );
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Cookie realm="Life Ledger"',
    },
  });
});

app.use("/api/*", async (context, next) => {
  if (
    context.req.method !== "GET" &&
    context.req.method !== "HEAD" &&
    !isAllowedOrigin(context.req.raw, context.env.PRIVATE_ORIGINS)
  ) {
    return context.json(
      {
        error: {
          code: "ORIGIN_DENIED",
          message: "The request origin is not allowed.",
          requestId: context.get("requestId"),
          retryable: false,
        },
      },
      403,
    );
  }
  return next();
});

app.on(["GET", "HEAD"], "/media/*", async (context) => {
  const key = mediaKeyFromPath(context.req.path);
  if (!key) {
    return new Response("Media object not found.", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const rangeHeader = context.req.header("range");
  const head = rangeHeader ? await context.env.MEDIA.head(key) : null;
  const range = head ? parseByteRange(rangeHeader, head.size) : null;
  if (head && range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Range": `bytes */${head.size}`,
      },
    });
  }
  const byteRange = range && range !== "unsatisfiable" ? range : null;
  const object = await context.env.MEDIA.get(
    key,
    byteRange ? { range: byteRange } : undefined,
  );
  if (!object) {
    return new Response("Media object not found.", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=31536000, immutable");
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "image/webp",
  );
  headers.set("Content-Length", String(byteRange?.length ?? object.size));
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Vary", "Cookie");
  headers.set("X-Content-Type-Options", "nosniff");

  if (requestEtagMatches(context.req.header("if-none-match"), object.httpEtag)) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  if (byteRange) {
    headers.set(
      "Content-Range",
      `bytes ${byteRange.offset}-${byteRange.offset + byteRange.length - 1}/${object.size}`,
    );
  }
  return new Response(
    context.req.method === "HEAD" || !("body" in object) ? null : object.body,
    {
      status: byteRange ? 206 : 200,
      headers,
    },
  );
});

app.on(["GET", "HEAD"], "/public-media/*", async (context) => {
  const key = publicMediaKeyFromPath(context.req.path);
  if (!key) {
    return new Response("Public media object not found.", {
      status: 404,
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const object = await context.env.MEDIA.get(key);
  if (!object) {
    return new Response("Public media object not found.", {
      status: 404,
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const contentType = object.httpMetadata?.contentType;
  const expectedContentType = key.endsWith(".webp")
    ? "image/webp"
    : key.endsWith(".jpg")
      ? "image/jpeg"
      : "image/png";
  if (contentType !== expectedContentType) {
    return new Response("Public media object metadata is invalid.", {
      status: 415,
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Content-Length", String(object.size));
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");

  if (requestEtagMatches(context.req.header("if-none-match"), object.httpEtag)) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  return new Response(context.req.method === "HEAD" ? null : object.body, {
    status: 200,
    headers,
  });
});

app.get("/auth/art/mono-characters.webp", (context) => {
  const assetUrl = new URL(
    "/assets/anime-ui/mono-characters.webp",
    context.req.url,
  );
  return context.env.ASSETS.fetch(
    new Request(assetUrl, {
      method: "GET",
      headers: context.req.raw.headers,
    }),
  );
});

app.get("/auth/login", async (context) => {
  const nextPath = safeReturnPath(context.req.query("next"));
  if (hasValidSessionSecret(context.env)) {
    const token = getCookie(
      context.req.header("cookie") ?? null,
      SESSION_COOKIE_NAME,
    );
    if (
      token &&
      await verifySessionToken(token, context.env.AUTH_SESSION_SECRET)
    ) {
      context.header("Cache-Control", "no-store");
      return context.redirect(nextPath, 303);
    }
  }
  return context.html(loginPage(nextPath), 200, {
    "Cache-Control": "no-store",
  });
});

app.post("/auth/login", async (context) => {
  if (!isAllowedOrigin(context.req.raw, context.env.PRIVATE_ORIGINS)) {
    return context.html(
      loginPage("/", "请求来源无效，请从 Life Ledger 登录页重试。"),
      403,
      { "Cache-Control": "no-store" },
    );
  }
  if (!hasValidAuthConfiguration(context.env)) {
    return authenticationUnavailable(
      context.req.path,
      context.get("requestId"),
    );
  }
  if (
    !context.env.AUTH_RATE_LIMITER ||
    typeof context.env.AUTH_RATE_LIMITER.limit !== "function"
  ) {
    return authenticationUnavailable(
      context.req.path,
      context.get("requestId"),
    );
  }

  let rateLimitOutcome: RateLimitOutcome;
  try {
    rateLimitOutcome = await context.env.AUTH_RATE_LIMITER.limit({
      key: await createLoginRateLimitKey(context.req.raw),
    });
  } catch {
    return authenticationUnavailable(
      context.req.path,
      context.get("requestId"),
    );
  }
  if (!rateLimitOutcome.success) {
    return context.html(
      loginPage(
        safeReturnPath(context.req.query("next")),
        "尝试次数过多，请等待一分钟后重试。",
      ),
      429,
      {
        "Cache-Control": "no-store",
        "Retry-After": "60",
      },
    );
  }

  const mediaType = context.req
    .header("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") {
    return context.html(
      loginPage("/", "登录请求格式无效，请刷新页面后重试。"),
      415,
      { "Cache-Control": "no-store" },
    );
  }

  let form: URLSearchParams;
  try {
    form = await readUrlEncodedBody(context.req.raw);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return context.html(
        loginPage("/", "登录请求过大，请刷新页面后重试。"),
        413,
        { "Cache-Control": "no-store" },
      );
    }
    return context.html(
      loginPage("/", "登录请求无效，请刷新页面后重试。"),
      400,
      { "Cache-Control": "no-store" },
    );
  }

  const nextPath = safeReturnPath(form.get("next"));
  const candidate = form.get("password") ?? "";
  const validPassword = await passwordMatches(
    candidate,
    context.env.AUTH_PASSWORD,
  );
  if (
    candidate.length > 256 ||
    !validPassword
  ) {
    return context.html(
      loginPage(nextPath, "密码无效，请重试。"),
      401,
      { "Cache-Control": "no-store" },
    );
  }

  const sessionToken = await createSessionToken(
    context.env.AUTH_SESSION_SECRET,
  );
  context.header("Cache-Control", "no-store");
  context.header("Set-Cookie", createSessionCookie(sessionToken));
  return context.redirect(nextPath, 303);
});

app.get("/auth/logout", (context) => {
  return context.html(logoutPage(), 200, {
    "Cache-Control": "no-store",
  });
});

app.post("/auth/logout", (context) => {
  if (!isAllowedOrigin(context.req.raw, context.env.PRIVATE_ORIGINS)) {
    return new Response("The request origin is not allowed.", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  context.header("Cache-Control", "no-store");
  context.header("Set-Cookie", clearSessionCookie());
  return context.redirect("/auth/login", 303);
});

app.get("/api/v1/health", async (context) => {
  return context.json(await context.env.CORE.health());
});

app.get("/api/v1/bootstrap", async (context) => {
  const [activeEntries, deletedEntries, anime, settings, exports] = await Promise.all([
    context.env.CORE.listEntries(
      listEntriesInputSchema.parse({ status: "active", limit: 100 }),
    ),
    context.env.CORE.listEntries(
      listEntriesInputSchema.parse({ status: "deleted", limit: 100 }),
    ),
    context.env.CORE.listAnime(),
    context.env.CORE.getSettings(),
    context.env.CORE.listExports(),
  ]);
  const response = {
    entries: [...activeEntries, ...deletedEntries],
    anime,
    settings,
    exports,
    generatedAt: new Date().toISOString(),
  } satisfies DashboardResponse;
  return context.json(response);
});

app.get("/api/v1/entries", async (context) => {
  const query = context.req.query();
  const input = listEntriesInputSchema.parse({
    query: query.q ?? "",
    type: query.type || null,
    visibility: query.visibility || null,
    status: query.status ?? "active",
    mediaWorkId: query.mediaWorkId || null,
    scoreMin: query.scoreMin ? Number(query.scoreMin) : null,
    scoreMax: query.scoreMax ? Number(query.scoreMax) : null,
    limit: query.limit ? Number(query.limit) : 50,
    cursor: query.cursor || null,
  });
  const items = await context.env.CORE.listEntries(input);
  return context.json({
    items,
    nextCursor: items.at(-1)
      ? `${items.at(-1)!.occurredAt}|${items.at(-1)!.id}`
      : null,
  });
});

app.post("/api/v1/entries", async (context) => {
  const body: unknown = await context.req.json();
  const input = captureEntryInputSchema.parse(body);
  const result = await context.env.CORE.captureEntry(input);
  return context.json(result, 201);
});

function uploadErrorResponse(
  requestId: string,
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json(
    { error: { code, message, requestId, retryable: false } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Streams an upload body to R2, then re-reads its first bytes to confirm the
 * file really is the declared image/video type. Mismatches are deleted.
 */
async function storeEntryMediaObject(
  bucket: R2Bucket,
  target: {
    objectKey: string;
    mimeType: EntryMediaMimeType;
    kind: "image" | "video";
    sizeBytes: number;
    source: "web" | "mcp";
  },
  body: ReadableStream,
): Promise<boolean> {
  const stored = await bucket.put(target.objectKey, body, {
    httpMetadata: {
      contentType: target.mimeType,
      cacheControl: "private, max-age=31536000, immutable",
      contentDisposition: "inline",
    },
    customMetadata: { kind: target.kind, source: target.source },
  });
  const headBytes = stored
    ? await bucket.get(target.objectKey, { range: { offset: 0, length: 16 } })
    : null;
  const signature =
    headBytes && "arrayBuffer" in headBytes
      ? new Uint8Array(await headBytes.arrayBuffer())
      : new Uint8Array();
  if (
    !stored ||
    stored.size !== target.sizeBytes ||
    !matchesEntryMediaSignature(target.mimeType, signature)
  ) {
    await bucket.delete(target.objectKey);
    return false;
  }
  return true;
}

app.post("/api/v1/entry-media", async (context) => {
  let plan;
  try {
    plan = planEntryMediaUpload({
      contentType: context.req.header("content-type"),
      contentLength: context.req.header("content-length"),
      width: context.req.query("width"),
      height: context.req.query("height"),
      durationMs: context.req.query("durationMs"),
    });
  } catch (error: unknown) {
    if (error instanceof EntryMediaUploadError) {
      return uploadErrorResponse(
        context.get("requestId"),
        error.code,
        error.message,
        error.status,
      );
    }
    throw error;
  }
  const body = context.req.raw.body;
  if (!body) {
    return uploadErrorResponse(context.get("requestId"), "EMPTY_UPLOAD", "上传内容为空。", 400);
  }
  if (
    !(await storeEntryMediaObject(
      context.env.MEDIA,
      { ...plan, source: "web" },
      body,
    ))
  ) {
    return uploadErrorResponse(
      context.get("requestId"),
      "MEDIA_CONTENT_MISMATCH",
      "文件内容与声明的格式不一致，已拒绝保存。",
      415,
    );
  }

  try {
    const media = await context.env.CORE.registerEntryMedia({
      uploadedVia: "web",
      objectKey: plan.objectKey,
      kind: plan.kind,
      mimeType: plan.mimeType,
      sizeBytes: plan.sizeBytes,
      width: plan.width,
      height: plan.height,
      durationMs: plan.durationMs,
    });
    return context.json(media, 201);
  } catch (error: unknown) {
    await context.env.MEDIA.delete(plan.objectKey);
    throw error;
  }
});

const UPLOAD_CLAIM_STATUS: Record<string, number> = {
  ENTRY_MEDIA_UPLOAD_NOT_FOUND: 404,
  ENTRY_MEDIA_UPLOAD_USED: 409,
  ENTRY_MEDIA_UPLOAD_EXPIRED: 410,
  ENTRY_MEDIA_UPLOAD_TYPE_MISMATCH: 415,
  ENTRY_MEDIA_TOO_LARGE: 413,
};

// One-time upload URL issued to MCP agents by create_entry_media_upload.
// The unguessable token is the credential, so no session cookie is needed.
app.put("/upload/entry-media/:token", async (context) => {
  const requestId = context.get("requestId");
  const contentLength = context.req.header("content-length");
  if (!contentLength || !/^\d+$/.test(contentLength)) {
    return uploadErrorResponse(
      requestId,
      "LENGTH_REQUIRED",
      "Content-Length is required; upload the file with curl --data-binary @file.",
      411,
    );
  }
  const mimeType =
    context.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  let claim;
  try {
    claim = await context.env.CORE.claimEntryMediaUpload(
      context.req.param("token"),
      { mimeType, sizeBytes: Number(contentLength) },
    );
  } catch (error: unknown) {
    const match =
      error instanceof Error ? /^([A-Z][A-Z0-9_]+):\s*(.+)$/.exec(error.message) : null;
    const status = match ? UPLOAD_CLAIM_STATUS[match[1]!] : undefined;
    if (match && status) {
      return uploadErrorResponse(requestId, match[1]!, match[2]!, status);
    }
    throw error;
  }
  const body = context.req.raw.body;
  if (!body) {
    return uploadErrorResponse(requestId, "EMPTY_UPLOAD", "Upload body is empty.", 400);
  }
  const sizeBytes = Number(contentLength);
  if (
    !(await storeEntryMediaObject(
      context.env.MEDIA,
      {
        objectKey: claim.objectKey,
        mimeType: claim.mimeType,
        kind: claim.kind,
        sizeBytes,
        source: "mcp",
      },
      body,
    ))
  ) {
    return uploadErrorResponse(
      requestId,
      "MEDIA_CONTENT_MISMATCH",
      "File content does not match the declared type; request a new upload URL.",
      415,
    );
  }
  try {
    const media = await context.env.CORE.registerEntryMedia({
      mediaId: claim.mediaId,
      uploadedVia: "mcp",
      objectKey: claim.objectKey,
      kind: claim.kind,
      mimeType: claim.mimeType,
      sizeBytes,
      width: claim.width,
      height: claim.height,
      durationMs: claim.durationMs,
    });
    return context.json({ ok: true, data: media }, 201);
  } catch (error: unknown) {
    await context.env.MEDIA.delete(claim.objectKey);
    throw error;
  }
});

app.delete("/api/v1/entry-media/:id", async (context) => {
  return context.json(
    await context.env.CORE.discardEntryMedia(context.req.param("id")),
  );
});

app.post("/api/v1/entries/:id/follow-ups", async (context) => {
  const body: unknown = await context.req.json();
  const input = addEntryFollowUpInputSchema.parse(body);
  return context.json(
    await context.env.CORE.addEntryFollowUp(context.req.param("id"), input),
    201,
  );
});

app.delete("/api/v1/entries/:id/follow-ups/:followUpId", async (context) => {
  return context.json(
    await context.env.CORE.deleteEntryFollowUp(
      context.req.param("id"),
      context.req.param("followUpId"),
    ),
  );
});

app.post("/api/v1/media-logs", async (context) => {
  const body: unknown = await context.req.json();
  const input = logMediaInputSchema.parse(body);
  const result = await context.env.CORE.logMedia(input);
  return context.json(result, 201);
});

app.get("/api/v1/media-works", async (context) => {
  const query = context.req.query();
  const input = listMediaWorksInputSchema.parse({
    mediaType: query.mediaType || null,
    mediaKind: query.mediaKind || null,
    query: query.q ?? "",
    watchStatus: query.watchStatus || null,
    sort: query.sort ?? "recent_desc",
    limit: query.limit ? Number(query.limit) : 100,
  });
  return context.json({
    items: await context.env.CORE.listMediaWorks(input),
  });
});

app.get("/api/v1/media-works/:id", async (context) => {
  const work = await context.env.CORE.getMediaWork(context.req.param("id"));
  if (!work) {
    return context.json(
      {
        error: {
          code: "MEDIA_WORK_NOT_FOUND",
          message: "Media work not found.",
          requestId: context.get("requestId"),
          retryable: false,
        },
      },
      404,
    );
  }
  return context.json(work);
});

app.get("/api/v1/game-library", async (context) => {
  return context.json({
    items: await context.env.CORE.listGameLibrary(),
  });
});

app.post("/api/v1/game-library", async (context) => {
  const body: unknown = await context.req.json();
  const input = createGameLibraryItemInputSchema.parse(body);
  return context.json(
    await context.env.CORE.createGameLibraryItem(input),
    201,
  );
});

app.patch("/api/v1/game-library/:id", async (context) => {
  const body: unknown = await context.req.json();
  const input = updateGameLibraryItemInputSchema.parse(body);
  return context.json(
    await context.env.CORE.updateGameLibraryItem(
      context.req.param("id"),
      input,
    ),
  );
});

app.delete("/api/v1/game-library/:id", async (context) => {
  const body: unknown = await context.req.json();
  const versionNo =
    typeof body === "object" &&
    body !== null &&
    "versionNo" in body &&
    typeof body.versionNo === "number"
      ? body.versionNo
      : 0;
  return context.json(
    await context.env.CORE.deleteGameLibraryItem(
      context.req.param("id"),
      versionNo,
    ),
  );
});

app.post("/api/v1/game-library/:id/restore", async (context) => {
  const body: unknown = await context.req.json();
  const versionNo =
    typeof body === "object" &&
    body !== null &&
    "versionNo" in body &&
    typeof body.versionNo === "number"
      ? body.versionNo
      : 0;
  return context.json(
    await context.env.CORE.restoreGameLibraryItem(
      context.req.param("id"),
      versionNo,
    ),
  );
});

app.get("/api/v1/entries/:id", async (context) => {
  const entry = await context.env.CORE.getEntry(context.req.param("id"));
  if (!entry) {
    return context.json(
      {
        error: {
          code: "ENTRY_NOT_FOUND",
          message: "Entry not found.",
          requestId: context.get("requestId"),
          retryable: false,
        },
      },
      404,
    );
  }
  return context.json(entry);
});

app.patch("/api/v1/entries/:id", async (context) => {
  const body: unknown = await context.req.json();
  const input = updateEntryInputSchema.parse(body);
  return context.json(await context.env.CORE.updateEntry(context.req.param("id"), input));
});

app.delete("/api/v1/entries/:id", async (context) => {
  return context.json(await context.env.CORE.deleteEntry(context.req.param("id")));
});

app.post("/api/v1/entries/:id/restore", async (context) => {
  return context.json(await context.env.CORE.restoreEntry(context.req.param("id")));
});

app.post("/api/v1/entries/:id/purge", async (context) => {
  const body: unknown = await context.req.json();
  const confirmationId =
    typeof body === "object" &&
    body !== null &&
    "confirmationId" in body &&
    typeof body.confirmationId === "string"
      ? body.confirmationId
      : "";
  return context.json(
    await context.env.CORE.purgeEntry(
      context.req.param("id"),
      confirmationId,
    ),
  );
});

app.post("/api/v1/entries/:id/prepare-publish", async (context) => {
  return context.json(await context.env.CORE.preparePublish(context.req.param("id")));
});

app.post("/api/v1/entries/:id/unpublish", async (context) => {
  return context.json(await context.env.CORE.unpublishEntry(context.req.param("id")));
});

app.post("/api/v1/actions/:id/confirm", async (context) => {
  const body: unknown = await context.req.json();
  const parsed = confirmActionInputSchema.parse({
    ...(typeof body === "object" && body !== null ? body : {}),
    actionId: context.req.param("id"),
  });
  return context.json(await context.env.CORE.confirmAction(parsed));
});

app.get("/api/v1/anime", async (context) => {
  return context.json({ items: await context.env.CORE.listAnime() });
});

app.get("/api/v1/anime/:id", async (context) => {
  const work = await context.env.CORE.getAnime(context.req.param("id"));
  if (!work) {
    return context.json(
      {
        error: {
          code: "MEDIA_WORK_NOT_FOUND",
          message: "Anime work not found.",
          requestId: context.get("requestId"),
          retryable: false,
        },
      },
      404,
    );
  }
  return context.json(work);
});

app.get("/api/v1/settings", async (context) => {
  return context.json(await context.env.CORE.getSettings());
});

app.put("/api/v1/settings", async (context) => {
  const body: unknown = await context.req.json();
  return context.json(await context.env.CORE.updateSettings(settingsSchema.parse(body)));
});

app.post("/api/v1/imports/dry-run", async (context) => {
  const body: unknown = await context.req.json();
  return context.json(
    await context.env.CORE.createImportDryRun(
      importDryRunInputSchema.parse(body),
    ),
    201,
  );
});

app.post("/api/v1/imports/:id/commit", async (context) => {
  return context.json(
    await context.env.CORE.commitImport(context.req.param("id")),
  );
});

app.get("/api/v1/exports", async (context) => {
  return context.json({ items: await context.env.CORE.listExports() });
});

app.post("/api/v1/exports", async (context) => {
  const body: unknown = await context.req.json();
  const scope =
    typeof body === "object" && body !== null && "scope" in body && body.scope === "incremental"
      ? "incremental"
      : "full";
  return context.json(await context.env.CORE.createExport(scope), 202);
});

app.get("/api/v1/exports/:id/download", async (context) => {
  const download = await context.env.CORE.downloadExport(
    context.req.param("id"),
  );
  const safeFileName = download.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(download.body, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeFileName}"`,
      "Content-Type": download.contentType,
      "X-Checksum-SHA256": download.checksum,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.post("/api/v1/exports/:id/verify", async (context) => {
  return context.json(
    await context.env.CORE.verifyExport(context.req.param("id")),
  );
});

app.get("/public/v1/anime", async (context) => {
  const data = await context.env.CORE.getPublicAnime();
  const etag = `"${data.revision}"`;
  if (context.req.header("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
      },
    });
  }
  context.header("ETag", etag);
  context.header(
    "Cache-Control",
    "no-store",
  );
  return context.json(data);
});

app.get("/public/v1/timeline", async (context) => {
  const data = await context.env.CORE.getPublicTimeline();
  const etag = `"${data.revision}"`;
  if (context.req.header("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
      },
    });
  }
  context.header("ETag", etag);
  context.header("Cache-Control", "no-store");
  return context.json(data);
});

app.notFound(async (context) => {
  if (isAuthPath(context.req.path)) {
    return new Response("Authentication route not found.", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  if (
    context.req.path.startsWith("/api/") ||
    context.req.path.startsWith("/public/")
  ) {
    return context.json(
      {
        error: {
          code: "ROUTE_NOT_FOUND",
          message: "API route not found.",
          requestId: context.get("requestId"),
          retryable: false,
        },
      },
      404,
    );
  }
  let response = await context.env.ASSETS.fetch(context.req.raw);
  if (
    (context.req.path === "/anime" || context.req.path === "/anime/") &&
    response.headers.get("Content-Type")?.startsWith("text/html")
  ) {
    const preload =
      '<link rel="preload" as="image" href="/assets/anime-ui/chiramune-hero-v1.webp" fetchpriority="high">';
    const html = await response.text();
    response = new Response(
      html.replace(/<\/head>/i, `${preload}</head>`),
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  }
  const cacheControl = browserCachePolicy(context.req.path);
  const headers = new Headers(response.headers);
  let headersChanged = false;
  const contentType = headers.get("Content-Type");
  if (
    contentType?.toLowerCase().startsWith("text/html") &&
    !contentType.toLowerCase().includes("charset=")
  ) {
    headers.set("Content-Type", `${contentType}; charset=utf-8`);
    headersChanged = true;
  }
  if (contentType?.toLowerCase().startsWith("text/html")) {
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Cookie");
    headersChanged = true;
  }
  if (cacheControl) {
    headers.set("Cache-Control", cacheControl);
    headers.set("Vary", "Cookie");
    headersChanged = true;
  }
  if (!headersChanged) {
    return response;
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

app.onError((error, context) => {
  const requestId = context.get("requestId") || `req_${crypto.randomUUID()}`;
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          requestId,
          retryable: false,
          details: error.issues,
        },
      },
      { status: 422 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Request body is not valid JSON.",
          requestId,
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const domainMatch = error.message.match(/^([A-Z][A-Z0-9_]+):\s*(.+)$/);
  const code = domainMatch?.[1] ?? "INTERNAL_ERROR";
  const message = domainMatch?.[2] ?? "An unexpected error occurred.";
  const status =
    code === "USER_NOT_FOUND" || code.endsWith("_FAILED")
      ? 500
      : code.endsWith("_NOT_FOUND")
      ? 404
      : code.includes("CONFLICT") ||
          code.includes("DELETED") ||
          code === "ENTRY_MEDIA_UNAVAILABLE" ||
          code === "ENTRY_MEDIA_LIMIT_CONFLICT" ||
          code === "ENTRY_MEDIA_ATTACHED" ||
          code.includes("EXPIRED") ||
          code === "ACTION_CONSUMED"
        ? 409
        : code === "CONFIRMATION_INVALID"
          ? 422
          : 500;
  console.error(JSON.stringify({ requestId, code, message: error.message }));
  return Response.json(
    {
      error: {
        code,
        message,
        requestId,
        retryable: status >= 500,
      },
    },
    { status },
  );
});

export default app;
