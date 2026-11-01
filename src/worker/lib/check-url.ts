// 网址存活检测:HEAD 优先,不支持/失败时降级 GET,仅 404/410 判死,防误杀反爬站点。
// 供后台手动分批检测与定时任务(cron)共同使用。
// 网络层失败(超时/DNS/Workers 子请求配额耗尽)必须返回 unknown 而非判死:
// 全量检测跑在单次 Worker 调用里,配额耗尽后剩余 fetch 会整批抛错,
// 若此时判死,会把存活书签批量误标并持久化到 D1
export type LinkCheckStatus = "alive" | "dead" | "unknown";

export async function checkUrl(url: string): Promise<LinkCheckStatus> {
	const headers = {
		"User-Agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
	};
	try {
		const res = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			headers,
			signal: AbortSignal.timeout(8000),
		});
		if (res.status < 400) return "alive";
	} catch {
		// 降级 GET 再试
	}
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			headers,
			signal: AbortSignal.timeout(8000),
		});
		return res.status === 404 || res.status === 410 ? "dead" : "alive";
	} catch {
		return "unknown";
	}
}
