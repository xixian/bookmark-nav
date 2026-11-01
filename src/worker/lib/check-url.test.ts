import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUrl } from "./check-url";

// fetch 打桩:checkUrl 只读 res.status,无需构造完整 Response
function stubFetch(...responses: (Promise<{ status: number }> | Promise<never>)[]) {
	const fetchMock = vi.fn();
	for (const r of responses) fetchMock.mockImplementationOnce(() => r);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("checkUrl(死链判定三态)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("HEAD 2xx 直接判活,不再发 GET", async () => {
		const fetchMock = stubFetch(Promise.resolve({ status: 200 }));
		await expect(checkUrl("https://a.com")).resolves.toBe("alive");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("HEAD 抛错(部分站点不支持)降级 GET,GET 2xx 判活", async () => {
		stubFetch(Promise.reject(new Error("HEAD failed")), Promise.resolve({ status: 200 }));
		await expect(checkUrl("https://a.com")).resolves.toBe("alive");
	});

	it("HEAD 4xx 后用 GET 复核,GET 404 判死", async () => {
		stubFetch(Promise.resolve({ status: 404 }), Promise.resolve({ status: 404 }));
		await expect(checkUrl("https://a.com")).resolves.toBe("dead");
	});

	it("GET 410 判死", async () => {
		stubFetch(Promise.resolve({ status: 404 }), Promise.resolve({ status: 410 }));
		await expect(checkUrl("https://a.com")).resolves.toBe("dead");
	});

	it("反爬站点(403/429/5xx)不误杀,判活", async () => {
		stubFetch(Promise.resolve({ status: 403 }), Promise.resolve({ status: 403 }));
		await expect(checkUrl("https://a.com")).resolves.toBe("alive");
		stubFetch(Promise.resolve({ status: 500 }), Promise.resolve({ status: 502 }));
		await expect(checkUrl("https://a.com")).resolves.toBe("alive");
	});

	it("HEAD/GET 都抛错返回 unknown(网络故障/子请求配额耗尽),绝不判死", async () => {
		// 回归防护:全量检测跑在单次 Worker 调用里,配额耗尽后剩余 fetch 整批抛错,
		// 判死会把存活书签批量误标并持久化
		stubFetch(Promise.reject(new Error("Too many subrequests")), Promise.reject(new Error("Too many subrequests")));
		await expect(checkUrl("https://a.com")).resolves.toBe("unknown");
	});
});
