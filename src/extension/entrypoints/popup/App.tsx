import { useEffect, useMemo, useState } from "react";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Switch } from "@app/components/ui/switch";
import {
	ApiError,
	aiAutoFill,
	createBookmark,
	flattenCategoryTree,
	fetchAIConfig,
	fetchBookmarks,
	fetchCategories,
	type Bookmark,
	type Category,
} from "../../lib/api";
import { loadConfig } from "../../lib/config";

type Status = "loading" | "unconfigured" | "ready" | "saved";

export default function App() {
	const [status, setStatus] = useState<Status>("loading");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [siteUrl, setSiteUrl] = useState("");
	const [tab, setTab] = useState<{ url: string; title: string } | null>(null);
	const [flatCategories, setFlatCategories] = useState<ReturnType<typeof flattenCategoryTree>>([]);
	const [existing, setExisting] = useState<Bookmark[]>([]);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [tags, setTags] = useState("");
	const [categoryId, setCategoryId] = useState<string>("none");
	const [isPrivate, setIsPrivate] = useState(false);
	const [saving, setSaving] = useState(false);
	// 保存失败内联展示:不能复用全页 errorMsg 分支,否则表单被整体替换、已填内容不可恢复
	const [saveError, setSaveError] = useState<string | null>(null);
	// AI 智能填充:站点配置了 AI(aiEnabled)才显示入口
	const [aiEnabled, setAiEnabled] = useState(false);
	const [aiLoading, setAiLoading] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			const cfg = await loadConfig();
			if (!cfg) {
				setStatus("unconfigured");
				return;
			}
			setSiteUrl(cfg.siteUrl);
			try {
				const [tabs, categories, bookmarkRes, aiCfg] = await Promise.all([
					chrome.tabs.query({ active: true, currentWindow: true }),
					fetchCategories(),
					fetchBookmarks(),
					// AI 可用性单独兜底:失败只影响入口显示,不影响收藏表单
					fetchAIConfig().catch(() => ({ aiEnabled: false })),
				]);
				const url = tabs[0]?.url;
				if (!url || !/^https?:/.test(url)) {
					setErrorMsg("当前页面不是普通网页,无法收藏");
					return;
				}
				const tabInfo = { url, title: tabs[0]?.title ?? url };
				setTab(tabInfo);
				setFlatCategories(flattenCategoryTree(categories as Category[]));
				setAiEnabled(!!aiCfg.aiEnabled);
				setExisting(bookmarkRes.bookmarks as Bookmark[]);
				// 预填标题:去掉浏览器标题里常见的「 - 站点名」后缀
				setTitle(tabInfo.title.replace(/ [-–—|] [^|]*$/, "").trim());
				setStatus("ready");
			} catch (err) {
				setErrorMsg(err instanceof Error ? err.message : "加载失败");
			}
		})();
	}, []);

	const duplicate = useMemo(
		() => (tab ? existing.find((b) => b.url === tab.url) : undefined),
		[existing, tab],
	);

	async function handleSave() {
		if (!tab) return;
		setSaving(true);
		setSaveError(null);
		try {
			await createBookmark({
				title: title.trim() || tab.url,
				url: tab.url,
				description: description.trim() || null,
				categoryId: categoryId === "none" ? null : Number(categoryId),
				visibility: isPrivate ? "private" : "public",
				tags: tags
					.split(/[,，]/)
					.map((t) => t.trim())
					.filter(Boolean),
			});
			setStatus("saved");
		} catch (err) {
			setSaveError(err instanceof ApiError ? err.message : "收藏失败,请重试");
		} finally {
			setSaving(false);
		}
	}

	// AI 智能填充:一次调用同时拿到标题/描述/标签/分类
	async function handleAIFill() {
		if (!tab) return;
		setAiLoading(true);
		setAiError(null);
		try {
			const res = await aiAutoFill(tab.url);
			// 程序赋值不受 Input maxLength 约束,须按服务端 zod 限制裁剪
			// (title 200 / description 500 / 单标签 30 且最多 20),否则保存必 400
			if (res.title) setTitle(res.title.slice(0, 200));
			if (res.description) setDescription(res.description.slice(0, 500));
			if (Array.isArray(res.tags) && res.tags.length)
				setTags(
					res.tags
						.map((t) => t.trim().slice(0, 30))
						.filter(Boolean)
						.slice(0, 20)
						.join(", "),
				);
			// AI 给的 categoryId 须存在于已拉取的分类中,否则 select 显示空白却仍按原值提交
			if (
				res.categoryId != null &&
				flatCategories.some((c) => c.category.id === res.categoryId)
			) {
				setCategoryId(String(res.categoryId));
			}
		} catch (err) {
			setAiError(err instanceof ApiError ? err.message : "AI 分析失败,请稍后重试");
		} finally {
			setAiLoading(false);
		}
	}

	function openAdmin() {
		chrome.tabs.create({ url: `${siteUrl}/admin` });
	}

	if (status === "loading") return <Shell>加载中…</Shell>;

	if (errorMsg) {
		return (
			<Shell>
				<p className="text-sm text-destructive">{errorMsg}</p>
				<Button variant="outline" className="mt-3 w-full" onClick={() => openAdmin()}>
					打开后台检查
				</Button>
			</Shell>
		);
	}

	if (status === "unconfigured") {
		return (
			<Shell>
				<p className="text-sm text-muted-foreground">首次使用请先配置站点地址与访问令牌。</p>
				<Button className="mt-3 w-full" onClick={() => chrome.runtime.openOptionsPage()}>
					前往配置
				</Button>
			</Shell>
		);
	}

	if (status === "saved") {
		return (
			<Shell>
				<div className="flex flex-col items-center gap-2 py-6">
					<span className="text-3xl">✅</span>
					<p className="text-sm font-medium">已收藏到 Bookmark Nav</p>
					{duplicate && <p className="text-xs text-muted-foreground">(该网址之前已收藏过)</p>}
				</div>
				<div className="flex gap-2">
					<Button className="flex-1" onClick={() => window.close()}>
						完成
					</Button>
					<Button variant="outline" className="flex-1" onClick={openAdmin}>
						查看后台
					</Button>
				</div>
			</Shell>
		);
	}

	return (
		<Shell>
			{duplicate && (
				<div className="mb-3 rounded-md bg-amber-100 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
					⚠️ 该网址已在书签库中,重复保存会创建两条记录
				</div>
			)}
			{aiEnabled && (
				<div className="mb-3">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						disabled={aiLoading}
						onClick={() => void handleAIFill()}
					>
						{aiLoading ? "AI 分析中…" : "✨ AI 智能填充(标题/描述/标签/分类)"}
					</Button>
					{aiError && <p className="mt-1.5 text-xs text-destructive">{aiError}</p>}
				</div>
			)}
			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="ext-title">标题</Label>
					<Input
						id="ext-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={200}
					/>
					<p className="truncate text-xs text-muted-foreground">{tab?.url}</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-category">分类</Label>
					{/* 原生 select:Radix Select 在扩展 popup 受限环境下定位不稳定 */}
					<select
						id="ext-category"
						value={categoryId}
						onChange={(e) => setCategoryId(e.target.value)}
						className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
					>
						<option value="none">未分类</option>
						{flatCategories.map(({ category, path, depth }) => (
							<option key={category.id} value={String(category.id)}>
								{"　".repeat(depth)}
								{path}
								{category.visibility === "private" ? " 🔒" : ""}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-tags">标签(逗号分隔,可选)</Label>
					<Input
						id="ext-tags"
						value={tags}
						onChange={(e) => setTags(e.target.value)}
						placeholder="工具, 文档"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-desc">描述(可选)</Label>
					<Input
						id="ext-desc"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						maxLength={500}
					/>
				</div>
				<div className="flex items-center justify-between rounded-lg border px-3 py-2">
					<div>
						<Label>私密书签</Label>
						<p className="text-xs text-muted-foreground">仅登录后可见</p>
					</div>
					<Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
				</div>
				{saveError && <p className="text-xs text-destructive">{saveError}</p>}
				<Button className="w-full" disabled={saving || !title.trim()} onClick={handleSave}>
					{saving ? "保存中…" : duplicate ? "仍然收藏" : "收藏"}
				</Button>
			</div>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="w-[360px] p-4">
			<div className="mb-3 flex items-center justify-between">
				<h1 className="text-sm font-semibold">Bookmark Nav 收藏</h1>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground"
					onClick={() => chrome.runtime.openOptionsPage()}
				>
					设置
				</Button>
			</div>
			{children}
		</div>
	);
}


