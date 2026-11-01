import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/types";
import { softAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { runScheduledTasks } from "./lib/maintenance";

const app = new Hono<AppEnv>()
	// CORS 仅放行浏览器扩展 origin:插件走 Bearer 令牌,credentials 必须为 false,
	// 不与 cookie 认证混用以杜绝 CSRF 面
	.use(
		"/api/*",
		cors({
			origin: (origin) =>
				/^(chrome|moz|safari-web)-extension:\/\/[a-z0-9-]+$/i.test(origin)
					? origin
					: null,
			allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowHeaders: ["Authorization", "Content-Type"],
			credentials: false,
			maxAge: 86_400,
		}),
	)
	// 全局软认证:解析 cookie 里的 JWT 或 Bearer 令牌,公开接口据此过滤私密内容
	.use("/api/*", softAuth)
	// 受登录态影响的响应一律禁止共享缓存,防止私密书签泄露
	.use("/api/*", async (c, next) => {
		await next();
		c.header("Cache-Control", "private, no-store");
	})
	// 基础安全响应头:防 MIME 嗅探 + 防 iframe 嵌套(点击劫持)
	.use("*", async (c, next) => {
		await next();
		c.header("X-Content-Type-Options", "nosniff");
		c.header("X-Frame-Options", "DENY");
		c.header("Referrer-Policy", "strict-origin-when-cross-origin");
		// frame-ancestors 与 X-Frame-Options 双保险
		c.header("Content-Security-Policy", "frame-ancestors 'none'");
	})
	.route("/api/auth", authRoutes)
	.route("/api/public", publicRoutes)
	.route("/api/admin", adminRoutes);

// API 异常统一返回 JSON,前端才能展示具体错误而非笼统的“网络错误”
app.onError((err, c) => {
	const status = err instanceof HTTPException ? err.status : 500;
	console.error(`[api] ${c.req.method} ${c.req.path}:`, err);
	// HTTPException 的 message 是受控业务提示可安全下发;其余异常可能带内部细节,只回通用文案
	const message =
		err instanceof HTTPException ? err.message : "Internal Server Error";
	return c.json({ error: message }, status);
});

// SPA 回退:未命中资产返回 index.html,前端路由刷新/直达不 404
app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found" }, 404);
	return c.env.ASSETS.fetch(c.req.raw);
});

// 前端 Hono RPC client 使用的类型
export type AppType = typeof app;

// Cron 每小时整点触发调度器,按后台配置的开关与计划执行死链检测与备份(改计划即时生效)
export default {
	fetch: app.fetch,
	scheduled: (event: ScheduledEvent, env: Env) => {
		event.waitUntil(runScheduledTasks(env));
	},
};
