import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { users } from "../db/schema";
import { hashApiToken, isApiToken } from "../lib/token";
import { AUTH_COOKIE, type AppEnv, type JwtUser } from "../lib/types";

// 软认证:有合法 token 则注入 user,没有也放行(公开接口按登录态过滤 visibility)
export const softAuth = createMiddleware<AppEnv>(async (c, next) => {
	// 插件走 Bearer 令牌;无效(如已吊销)时继续回落 cookie 认证,避免误伤
	const authz = c.req.header("Authorization") ?? "";
	const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
	if (isApiToken(bearer)) {
		const db = createDb(c.env.DB);
		const user = await userFromApiToken(db, bearer);
		if (user) {
			c.set("user", user satisfies JwtUser);
			await next();
			return;
		}
	}

	const token = getCookie(c, AUTH_COOKIE);
	if (token) {
		try {
			const payload = await verify(token, c.env.JWT_SECRET, "HS256");
			if (typeof payload.id === "number" && typeof payload.username === "string") {
				// 校验 token 版本:改密码后旧 token 立即失效
				const db = createDb(c.env.DB);
				const [user] = await db
					.select({
						id: users.id,
						username: users.username,
						tokenVersion: users.tokenVersion,
					})
					.from(users)
					.where(eq(users.id, payload.id))
					.limit(1);
				// 缺少 ver 字段的旧版 token 一律视为失效
				const ver = typeof payload.ver === "number" ? payload.ver : -1;
				if (user && user.tokenVersion === ver) {
					c.set("user", { id: user.id, username: user.username } satisfies JwtUser);
				}
			}
		} catch {
			// token 无效/过期:视为未登录,不报错
		}
	}
	await next();
});

// 强认证:管理接口必须登录
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	if (!c.get("user")) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

// 按令牌哈希查用户;令牌与账号绑定,无版本校验(改密码时直接吊销)
export async function userFromApiToken(
	db: Db,
	raw: string,
): Promise<JwtUser | null> {
	const hash = await hashApiToken(raw);
	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			apiTokenHash: users.apiTokenHash,
		})
		.from(users)
		.where(eq(users.apiTokenHash, hash))
		.limit(1);
	if (!user || user.apiTokenHash !== hash) return null;
	return { id: user.id, username: user.username };
}
