// 部署前把 Workers Builds 构建变量注入到独立的 wrangler.deploy.json(未入库):
//   - D1_DATABASE_ID → d1_databases[0].database_id
//   - JWT_SECRET     → vars.JWT_SECRET
//   - R2_BUCKET      → r2_buckets[0].bucket_name(未设置则移除绑定,没建桶的部署不受影响)
// 为什么生成独立文件而非就地改写 wrangler.json:wrangler.json 被 git 跟踪,
// 就地注入会让 JWT_SECRET 落进可提交的文件,一次 git add -A 即泄露签名密钥;
// deploy.json 每次构建从模板重新生成并列入 .gitignore,部署命令用 -c 指向它。
// 为什么变量放构建变量而非面板 Secret:GitHub 集成部署时每次 wrangler deploy
// 都会清空面板设置的 Secret/变量(cloudflare/workers-sdk#8871),
// 构建变量独立存储不受影响(本地开发用 .dev.vars,不受影响)。
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE_PATH = new URL("../wrangler.json", import.meta.url);
const OUT_PATH = new URL("../wrangler.deploy.json", import.meta.url);

// 纯函数:模板 + 环境变量 → 部署配置(供测试直接导入,不碰文件系统)
export function buildDeployConfig(base, env) {
	// 深拷贝隔离模板:任何注入都不得改写被 git 跟踪的 wrangler.json
	const config = structuredClone(base);
	if (env.D1_DATABASE_ID) {
		config.d1_databases[0].database_id = env.D1_DATABASE_ID;
	}
	if (env.JWT_SECRET) {
		config.vars = { ...config.vars, JWT_SECRET: env.JWT_SECRET };
	}
	if (env.R2_BUCKET) {
		config.r2_buckets = [{ binding: "BACKUP", bucket_name: env.R2_BUCKET }];
	} else {
		// 模板默认带 R2 绑定;未配置桶名时必须移除,否则 wrangler deploy 直接失败
		delete config.r2_buckets;
	}
	return config;
}

// 仅在被直接执行时跑 CLI(vitest 导入时不产生副作用)
const invokedDirectly =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
	const base = JSON.parse(readFileSync(BASE_PATH, "utf8"));
	const config = buildDeployConfig(base, process.env);
	writeFileSync(OUT_PATH, JSON.stringify(config, null, "\t") + "\n");

	console.log(
		process.env.D1_DATABASE_ID
			? `[prepare-deploy-config] 已注入 database_id: ${process.env.D1_DATABASE_ID}`
			: "[prepare-deploy-config] 未设置 D1_DATABASE_ID,沿用模板值",
	);
	console.log(
		process.env.JWT_SECRET
			? `[prepare-deploy-config] 已注入 JWT_SECRET (长度 ${process.env.JWT_SECRET.length})`
			: "[prepare-deploy-config] 未设置 JWT_SECRET",
	);
	console.log(
		process.env.R2_BUCKET
			? `[prepare-deploy-config] 已注入 R2 bucket: ${process.env.R2_BUCKET}`
			: "[prepare-deploy-config] 未设置 R2_BUCKET,已移除 R2 绑定(自动备份功能停用)",
	);
	console.log("[prepare-deploy-config] 已生成 wrangler.deploy.json");

	// 模板里残留的 JWT_SECRET 多半是旧版脚本就地注入后误提交的,提醒清理
	if (base.vars?.JWT_SECRET) {
		console.warn(
			"[prepare-deploy-config] 警告:wrangler.json 模板内含 JWT_SECRET 且被 git 跟踪,疑似历史泄露,请改用构建变量注入并轮换密钥",
		);
	}
	// 双保险:gitignore 失效时宁可大声失败也不要静默提交部署配置
	try {
		execSync("git check-ignore wrangler.deploy.json", { stdio: "pipe", cwd: new URL("..", import.meta.url) });
	} catch {
		console.warn(
			"[prepare-deploy-config] 警告:wrangler.deploy.json 未被 git 忽略,请将其加入 .gitignore",
		);
	}
}
