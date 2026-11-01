import { describe, expect, it } from "vitest";
import { buildDeployConfig } from "./prepare-deploy-config.mjs";

// 与 wrangler.json 模板同构的夹具(只保留脚本会触碰的字段)
function baseFixture() {
	return {
		name: "bookmark-nav",
		d1_databases: [
			{
				binding: "DB",
				database_name: "bookmark-nav-db",
				database_id: "REPLACE-WITH-YOUR-DATABASE-ID",
			},
		],
		r2_buckets: [{ binding: "BACKUP", bucket_name: "bookmark-nav-backup" }],
	};
}

describe("buildDeployConfig(部署配置生成)", () => {
	it("注入 D1 库 ID、JWT_SECRET 与 R2 桶名", () => {
		const config = buildDeployConfig(baseFixture(), {
			D1_DATABASE_ID: "d1-abc",
			JWT_SECRET: "s3cret",
			R2_BUCKET: "my-bucket",
		});
		expect(config.d1_databases[0].database_id).toBe("d1-abc");
		expect(config.vars.JWT_SECRET).toBe("s3cret");
		expect(config.r2_buckets).toEqual([
			{ binding: "BACKUP", bucket_name: "my-bucket" },
		]);
	});

	it("构建变量全未设置时移除 R2 绑定且不注入密钥(回归:旧版 changed 标记漏设,移除只改内存不落盘)", () => {
		const config = buildDeployConfig(baseFixture(), {});
		expect(config.r2_buckets).toBeUndefined();
		expect(config.vars?.JWT_SECRET).toBeUndefined();
		expect(config.d1_databases[0].database_id).toBe(
			"REPLACE-WITH-YOUR-DATABASE-ID",
		);
	});

	it("注入不修改被 git 跟踪的模板对象", () => {
		const base = baseFixture();
		buildDeployConfig(base, { D1_DATABASE_ID: "d1-abc", JWT_SECRET: "s" });
		expect(base.d1_databases[0].database_id).toBe(
			"REPLACE-WITH-YOUR-DATABASE-ID",
		);
		expect(base.vars).toBeUndefined();
		expect(base.r2_buckets).toHaveLength(1);
	});

	it("模板已有的其他 vars 在注入 JWT_SECRET 时保留", () => {
		const base = { ...baseFixture(), vars: { SITE_URL: "https://x.dev" } };
		const config = buildDeployConfig(base, { JWT_SECRET: "s" });
		expect(config.vars).toEqual({ SITE_URL: "https://x.dev", JWT_SECRET: "s" });
	});
});
