import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { rateLimits } from "../db/schema";

// 固定窗口计数限流:单条 upsert 完成「过期重置否则累加」,避免先读后写并发漏计;
// window_start / count 存 unix 秒,CASE 比较统一用秒
export async function consumeRateLimit(
	db: Db,
	key: string,
	limit: number,
	windowMs: number,
): Promise<{ ok: boolean; remaining: number }> {
	const nowSec = Math.floor(Date.now() / 1000);
	const cutoffSec = Math.floor((Date.now() - windowMs) / 1000);
	const [row] = await db
		.insert(rateLimits)
		.values({ key, count: 1, windowStart: new Date(nowSec * 1000) })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				count: sql`CASE WHEN ${rateLimits.windowStart} < ${cutoffSec} THEN 1 ELSE ${rateLimits.count} + 1 END`,
				windowStart: sql`CASE WHEN ${rateLimits.windowStart} < ${cutoffSec} THEN ${nowSec} ELSE ${rateLimits.windowStart} END`,
			},
		})
		.returning({ count: rateLimits.count });
	const count = Number(row?.count ?? 1);
	return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}

// 操作成功(如登录通过)后清零,避免正常用户被历史失败次数拖累
export async function clearRateLimit(db: Db, key: string): Promise<void> {
	await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

// 清理过期窗口,防止被大量伪造 key 撑大表
export async function pruneRateLimits(db: Db, windowMs: number): Promise<void> {
	await db
		.delete(rateLimits)
		.where(lt(rateLimits.windowStart, new Date(Date.now() - windowMs)));
}

// 客户端 IP。CF-Connecting-IP 由 Cloudflare 注入且会覆盖客户端伪造值,可安全用于限流。
export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
	return (
		c.req.header("CF-Connecting-IP") ??
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown"
	);
}
