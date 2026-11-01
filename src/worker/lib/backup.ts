import { asc } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookmarkTags, bookmarks, categories, settings, tags } from "../db/schema";

// 全量数据快照,写入 R2 作为每日备份
export async function buildBackupPayload(db: Db): Promise<string> {
	const [cats, bms, tagRows, links, settingRows] = await Promise.all([
		db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id)),
		db.select().from(bookmarks).orderBy(asc(bookmarks.sort), asc(bookmarks.id)),
		db.select().from(tags),
		db.select().from(bookmarkTags),
		db.select().from(settings),
	]);
	// ai.*(含第三方 API Key)不进备份:恢复接口本就拒绝 ai.* 键,
	// 导出它只会把密钥明文留在 R2 与用户下载的文件里
	const safeSettings = settingRows.filter((r) => !r.key.startsWith("ai."));
	return JSON.stringify(
		{
			exportedAt: new Date().toISOString(),
			app: "bookmark-nav",
			categories: cats,
			bookmarks: bms,
			tags: tagRows,
			bookmarkTags: links,
			// 导出为 key→value 对象而非行数组,与恢复接口的设置结构一致
			settings: Object.fromEntries(safeSettings.map((r) => [r.key, r.value])),
		},
		null,
		2,
	);
}

// 把快照写入 R2(backups/日期.json);未绑定 R2 时返回 null 由调用方决定提示
export async function backupToR2(env: Env, db: Db): Promise<string | null> {
	if (!env.BACKUP) return null;
	const payload = await buildBackupPayload(db);
	const date = new Date().toISOString().slice(0, 10);
	const key = `backups/${date}.json`;
	await env.BACKUP.put(key, payload, {
		httpMetadata: { contentType: "application/json; charset=utf-8" },
	});
	// 记录最近备份时间,后台展示用
	await db
		.insert(settings)
		.values({ key: "backup.lastRun", value: new Date().toISOString() })
		.onConflictDoUpdate({ target: settings.key, set: { value: new Date().toISOString() } });
	return key;
}
