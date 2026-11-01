import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { bookmarkTags, bookmarks, categories, settings, tags } from "../db/schema";
import { buildBackupPayload } from "./backup";

// 内存库模拟 D1(列结构与 db/schema.ts 一致),让 buildBackupPayload 走真实 SQL
function setupDb() {
	const sqlite = new Database(":memory:");
	sqlite.exec(`
		CREATE TABLE categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			icon TEXT,
			parent_id INTEGER,
			sort INTEGER NOT NULL DEFAULT 0,
			visibility TEXT NOT NULL DEFAULT 'public',
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE TABLE bookmarks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			description TEXT,
			icon TEXT,
			category_id INTEGER,
			sort INTEGER NOT NULL DEFAULT 0,
			click_count INTEGER NOT NULL DEFAULT 0,
			is_pinned INTEGER NOT NULL DEFAULT 0,
			visibility TEXT NOT NULL DEFAULT 'public',
			status TEXT NOT NULL DEFAULT 'active',
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
		CREATE TABLE bookmark_tags (
			bookmark_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			PRIMARY KEY (bookmark_id, tag_id)
		);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	`);
	return drizzle(sqlite) as unknown as Db;
}

describe("buildBackupPayload(备份快照)", () => {
	let db: Db;

	beforeEach(() => {
		db = setupDb();
	});

	it("ai.* 键(含第三方 API Key)不进备份,其余设置保留", async () => {
		await db.insert(settings).values([
			{ key: "siteName", value: "我的导航" },
			{ key: "ai.apiKey", value: "sk-secret" },
			{ key: "ai.apiEndpoint", value: "https://llm.example.com" },
			{ key: "ai.enabled", value: "true" },
			{ key: "deadLink.lastRun", value: "2026-01-01T00:00:00.000Z" },
		]);
		const payload = JSON.parse(await buildBackupPayload(db));
		expect(payload.settings).toEqual({
			siteName: "我的导航",
			"deadLink.lastRun": "2026-01-01T00:00:00.000Z",
		});
	});

	it("书签/分类/标签及其关联全部进快照", async () => {
		await db.insert(categories).values({ id: 1, name: "工具" });
		await db
			.insert(bookmarks)
			.values({ id: 1, title: "示例", url: "https://a.com", categoryId: 1 });
		await db.insert(tags).values({ id: 1, name: "t1" });
		await db.insert(bookmarkTags).values({ bookmarkId: 1, tagId: 1 });

		const payload = JSON.parse(await buildBackupPayload(db));
		expect(payload.categories).toHaveLength(1);
		expect(payload.bookmarks).toHaveLength(1);
		expect(payload.bookmarks[0].url).toBe("https://a.com");
		expect(payload.bookmarkTags).toEqual([{ bookmarkId: 1, tagId: 1 }]);
	});
});
