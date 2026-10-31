import {
	lazy,
	Suspense,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Link } from "react-router-dom";
import {
	Inbox,
	Loader2,
	Lock,
	Moon,
	Pin,
	Search,
	SearchX,
	Settings,
	LogOut,
	Sun,
	User,
	Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	client,
	flattenCategoryTree,
	type Bookmark,
	type Category,
} from "@/lib/api";
import { BookmarkFavicon } from "@/components/bookmark-favicon";
import { useAuthStatus, useLogout, useNavData, useSiteSettings, useAISearchConfig } from "@/lib/queries";

function sectionId(category: Category | null) {
	return `cat-${category?.id ?? "uncategorized"}`;
}

const subscribeNoop = () => () => {};

// 项目仓库地址(后台「GitHub 链接」开关控制是否展示)
const GITHUB_REPO_URL = "https://github.com/deerwan/bookmark-nav";

// 页脚 Markdown 渲染:按需加载,不配置页脚的部署零开销
const FooterContent = lazy(() => import("@/components/footer-content"));

// GitHub 品牌图标:lucide 已移除品牌图标,内联官方 octicon 路径
function GithubIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
			<path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
		</svg>
	);
}

// 主题切换:水合完成前不渲染图标,避免首帧主题不一致导致的闪烁
function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const mounted = useSyncExternalStore(
		subscribeNoop,
		() => true,
		() => false,
	);
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label="切换主题"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
		>
			{mounted && resolvedTheme === "dark" ? (
				<Sun className="size-4.5" />
			) : (
				<Moon className="size-4.5" />
			)}
		</Button>
	);
}

function BookmarkCard({
	bookmark,
	compact = false,
	iconService,
}: {
	bookmark: Bookmark;
	compact?: boolean;
	iconService?: string;
}) {

	return (
		<a
			href={bookmark.url}
			target="_blank"
			rel="noreferrer"
			title={bookmark.title}
			onClick={() => {
				// 点击计数上报,不阻塞跳转
				void client.api.public.bookmarks[":id"].click.$post({
					param: { id: String(bookmark.id) },
				});
			}}
			className={
				compact
					? "group flex items-center gap-2 rounded-lg border bg-card p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
					: "group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
			}
		>
			<div
				className={
					compact
						? "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-icon-tile text-xs"
						: "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-icon-tile text-base"
				}
			>
				<BookmarkFavicon
					bookmark={bookmark}
					iconService={iconService}
					className={
						compact ? "size-4.5 text-muted-foreground" : "size-6 text-muted-foreground"
					}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span
						className={
							compact
								? "truncate text-sm font-medium group-hover:text-primary"
								: "truncate font-medium group-hover:text-primary"
						}
					>
						{bookmark.title}
					</span>
					{bookmark.isPinned && <Pin className="size-3.5 shrink-0 text-amber-500" />}
					{bookmark.visibility === "private" && (
						<Lock className="size-3.5 shrink-0 text-muted-foreground" />
					)}
				</div>
				{!compact && bookmark.description && (
					<p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
						{bookmark.description}
					</p>
				)}
				{!compact && bookmark.tags.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1">
						{bookmark.tags.map((t) => (
							<Badge key={t} variant="secondary" className="px-1.5 py-0 text-xs">
								{t}
							</Badge>
						))}
					</div>
				)}
			</div>
		</a>
	);
}

export default function Home() {
	const { data: auth } = useAuthStatus();
	const { data, isLoading, isError } = useNavData();
	const { data: site } = useSiteSettings();
	const { data: aiConfig } = useAISearchConfig();
	const logout = useLogout();
	const [keyword, setKeyword] = useState("");
	const [aiSearch, setAiSearch] = useState(false);
	const [aiResults, setAiResults] = useState<Bookmark[] | null>(null);
	const [aiLoading, setAiLoading] = useState(false);
	const [activeSection, setActiveSection] = useState<string | null>(null);
	const [searchFocused, setSearchFocused] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	const siteName = site?.siteName || "书签导航";
	// 紧凑模式:由后台「外观设置」持久化到数据库,对所有访客全局生效
	const compact = site?.["appearance.compact"] === "1";
	// 分类锚点导航:后台默认关闭,开启后分类少于 3 个也会自动隐藏(一屏可览时没有跳转价值)
	const anchorNav = site?.["appearance.anchorNav"] === "1";
	// 前台右上角的项目仓库入口:后台可开关
	const showGithubLink = site?.["showGithubLink"] === "1";
	// 界面风格:classic 传统卡片 / glass 液态玻璃(index.css 中 .glass 变量预设)
	const glassStyle = site?.["appearance.style"] === "glass";
	// 紧凑卡片用自适应列数,分类条目少时行尾不留大片空白
	const compactGrid = "grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2";
	const normalGrid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
	const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform ?? "");

	// AI 语义搜索(请求后端 /api/public/search/semantic)。
	// 每次请求都触发一次 LLM 推理,匿名限流仅 30 次/时:输入必须防抖,否则连续打字很快耗尽额度;
	// 响应用序号标记,先发后至的过期结果直接丢弃,避免展示与输入框不符
	const aiSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const aiSearchSeq = useRef(0);

	function runAISearch(q: string, immediate = false) {
		if (aiSearchTimer.current) clearTimeout(aiSearchTimer.current);
		// 每次输入变化(含清空)都递增序号:使在途请求的响应全部失效
		const seq = ++aiSearchSeq.current;
		if (!q.trim() || !aiConfig?.semanticSearch) {
			setAiResults(null);
			setAiLoading(false);
			return;
		}
		const fire = async () => {
			setAiLoading(true);
			try {
				const res = await client.api.public["search"].semantic.$get({ query: { q } });
				if (seq !== aiSearchSeq.current) return;
				if (res.ok) {
					const body = (await res.json()) as { bookmarks: Bookmark[] };
					setAiResults(body.bookmarks);
				} else {
					setAiResults(null);
					// 429 说明匿名限流已耗尽:静默退回本地过滤会让用户误以为没有语义结果
					if (res.status === 429) toast.error("AI 请求过于频繁,请稍后再试");
				}
			} catch {
				if (seq === aiSearchSeq.current) setAiResults(null);
			} finally {
				if (seq === aiSearchSeq.current) setAiLoading(false);
			}
		};
		if (immediate) void fire();
		else aiSearchTimer.current = setTimeout(fire, 500);
	}

	// 卸载时清理防抖定时器,避免组件销毁后仍触发请求
	useEffect(
		() => () => {
			if (aiSearchTimer.current) clearTimeout(aiSearchTimer.current);
		},
		[],
	);

	// 关闭 AI 或清空关键词时回到本地过滤
	useEffect(() => {
		if (!aiSearch || !keyword.trim()) setAiResults(null);
	}, [aiSearch, keyword]);

	// 全局快捷键:⌘K / Ctrl K / `/` 聚焦搜索框
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const typing =
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);
			if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
				e.preventDefault();
				searchRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const aiActive = aiSearch && aiResults !== null;
	// 输入保持即时响应,过滤计算延迟一帧,书签量大时打字不卡
	const deferredKeyword = useDeferredValue(keyword);

	// 实际展示结果:AI 搜索优先,否则按关键词本地过滤(标题/描述/网址/标签)
	const displayBookmarks = useMemo(() => {
		if (aiResults !== null) return aiResults;
		const all = data?.bookmarks ?? [];
		const q = deferredKeyword.trim().toLowerCase();
		if (!q) return all;
		return all.filter((b) =>
			[b.title, b.description ?? "", b.url, ...b.tags]
				.join(" ")
				.toLowerCase()
				.includes(q),
		);
	}, [aiResults, deferredKeyword, data]);

	// 分类树按深度优先拍平成小节,子分类标题显示父级路径前缀(超过两级省略为 … / 上级)
	const grouped = useMemo(() => {
		const flat = flattenCategoryTree(data?.categories ?? []);
		const groups: {
			category: Category | null;
			parentPath: string;
			items: Bookmark[];
		}[] = flat.map(({ category, path }) => {
			const segments = path.split(" / ").slice(0, -1);
			return {
				category,
				parentPath:
					segments.length > 2
						? `… / ${segments[segments.length - 1]}`
						: segments.join(" / "),
				items: [],
			};
		});
		const uncategorized: Bookmark[] = [];
		const byId = new Map(groups.map((g) => [g.category!.id, g]));
		for (const b of displayBookmarks) {
			const g = b.categoryId !== null ? byId.get(b.categoryId) : undefined;
			if (g) g.items.push(b);
			else uncategorized.push(b);
		}
		if (uncategorized.length > 0)
			groups.push({ category: null, parentPath: "", items: uncategorized });
		return groups.filter((g) => g.items.length > 0);
	}, [data, displayBookmarks]);

	// 滚动时高亮当前所在分组的锚点按钮(依赖分组 id 列表,内容数量变化不重复订阅)
	const groupedKey = grouped.map((g) => sectionId(g.category)).join("|");
	useEffect(() => {
		const sections = groupedKey
			.split("|")
			.filter(Boolean)
			.map((id) => document.getElementById(id))
			.filter((el): el is HTMLElement => el !== null);
		if (sections.length === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActiveSection(entry.target.id);
				}
			},
			// 视口顶部 10%~30% 的横带作为判定区,谁落进来就高亮谁
			{ rootMargin: "-10% 0px -70% 0px" },
		);
		sections.forEach((s) => observer.observe(s));
		return () => observer.disconnect();
	}, [groupedKey]);

	function scrollToSection(category: Category | null) {
		// 点击即高亮,不等滚动结束(短页面滚不到位时也能立即反馈)
		setActiveSection(sectionId(category));
		document
			.getElementById(sectionId(category))
			?.scrollIntoView({
				behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
					? "auto"
					: "smooth",
				block: "start",
			});
	}

	return (
		<div className={`min-h-screen bg-background${glassStyle ? " glass" : ""}`}>
			<header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-x-3 px-4">
					{/* 命令栏式布局:站名 | 居中搜索 | 图标组,搜索随 sticky header 始终可达;小屏隐藏站名给搜索让位 */}
					<Link
						to="/"
						className="hidden min-w-0 flex-1 truncate text-lg font-bold sm:block"
					>
						{siteName}
					</Link>
					<div className="relative w-full max-w-md">
						<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							ref={searchRef}
							value={keyword}
							aria-label="搜索书签"
							onChange={(e) => {
								const v = e.target.value;
								setKeyword(v);
								// 空输入也要走一次:让在途请求过期并清空结果
								if (aiSearch) runAISearch(v);
							}}
							onFocus={() => setSearchFocused(true)}
							onBlur={() => setSearchFocused(false)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && aiSearch && keyword.trim())
									runAISearch(keyword, true);
								if (e.key === "Escape") e.currentTarget.blur();
							}}
							placeholder={aiSearch ? "用自然语言搜索,如「CSS 工具」…" : "搜索书签…"}
							className="h-9 rounded-full pr-12 pl-9"
						/>
						{aiConfig?.semanticSearch ? (
							aiLoading ? (
								<Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
							) : (
								<button
									type="button"
									onClick={() => setAiSearch((v) => !v)}
									aria-label="AI 语义搜索"
									aria-pressed={aiSearch}
									title="AI 语义搜索"
									className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-muted"
								>
									<Sparkles
										className={`size-4 ${aiSearch ? "text-orange-500" : "text-muted-foreground"}`}
									/>
								</button>
							)
						) : aiLoading ? (
							<Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
						) : (
							!searchFocused &&
							!keyword && (
								<kbd className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:block">
									{isMac ? "⌘K" : "Ctrl K"}
								</kbd>
							)
						)}
					</div>
					<div className="flex flex-1 items-center justify-end gap-1">
						{showGithubLink && (
							<Button variant="ghost" size="icon" asChild aria-label="GitHub 仓库">
								<a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
									<GithubIcon className="size-4.5" />
								</a>
							</Button>
						)}
						<ThemeToggle />
						{auth?.authenticated ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" aria-label="账户菜单">
										<User className="size-4.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link to="/admin">
											<Settings className="size-4" /> 后台管理
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => logout.mutate()}>
										<LogOut className="size-4" /> 退出登录
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Button variant="ghost" size="sm" asChild>
								<Link to="/login">登录</Link>
							</Button>
						)}
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-4 py-8" aria-busy={isLoading || undefined}>
				{/* 分类锚点导航:后台开关控制,分类少于 3 个时自动隐藏 */}
				{anchorNav && grouped.length >= 3 && (
					<nav
						aria-label="分类导航"
						className="mx-auto mb-8 flex max-w-2xl flex-wrap items-center justify-center gap-2"
					>
						{grouped.map(({ category, items }) => {
							const id = sectionId(category);
							return (
								<button
									key={id}
									type="button"
									onClick={() => scrollToSection(category)}
									className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
										activeSection === id
											? "border-primary/30 bg-primary/10 font-medium text-primary"
											: "bg-card text-muted-foreground hover:border-input hover:text-foreground"
									}`}
								>
									{category?.icon && <span>{category.icon}</span>}
									{category?.name ?? "未分类"}
									<span className="text-xs opacity-70">{items.length}</span>
								</button>
							);
						})}
					</nav>
				)}
				{isLoading && (
					<div className="space-y-10" aria-hidden>
						{[0, 1, 2].map((s) => (
							<div key={s}>
								<div className="mb-4 h-5 w-28 animate-pulse rounded bg-muted" />
								<div className={compact ? compactGrid : normalGrid}>
									{Array.from({ length: compact ? 7 : 4 }).map((_, i) => (
										<div
											key={i}
											className={
												compact
													? "h-11 animate-pulse rounded-lg bg-muted"
													: "h-20 animate-pulse rounded-xl bg-muted"
											}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				)}
				{isError && (
					<p className="py-20 text-center text-destructive">加载失败,请刷新重试</p>
				)}
				{grouped.map(({ category, parentPath, items }) => (
					<section
						key={category?.id ?? "uncategorized"}
						id={sectionId(category)}
						className={`scroll-mt-20 ${compact ? "mb-6" : "mb-10"}`}
					>
						<h2
							className={
								compact
									? "mb-2 flex items-center gap-2 text-sm font-semibold"
									: "mb-4 flex items-center gap-2 text-base font-semibold"
							}
						>
							{category?.icon && <span>{category.icon}</span>}
							{parentPath && (
								<span className="font-normal text-muted-foreground">
									{parentPath} /
								</span>
							)}
							{category?.name ?? "未分类"}
							{category?.visibility === "private" && (
								<Lock className="size-3.5 text-muted-foreground" />
							)}
							<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
								{items.length}
							</span>
						</h2>
						<div className={compact ? compactGrid : normalGrid}>
							{items.map((b) => (
								<BookmarkCard
									key={b.id}
									bookmark={b}
									compact={compact}
									iconService={site?.["icon.service"]}
								/>
							))}
						</div>
					</section>
				))}
				{!isLoading && !isError && grouped.length === 0 && (
					<div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
						{aiActive || keyword ? (
							<SearchX className="size-10 stroke-[1.5]" />
						) : (
							<Inbox className="size-10 stroke-[1.5]" />
						)}
						<p>
							{aiActive
								? "AI 没有找到相关书签,换个说法试试?"
								: keyword
									? "没有匹配的书签"
									: "还没有书签,登录后台添加吧"}
						</p>
					</div>
				)}
			</main>
			{site?.footer && (
				<footer className="border-t py-6 text-center text-sm text-muted-foreground">
					{/* chunk 就绪前先按纯文本兜底,避免内容跳动 */}
					<Suspense fallback={site.footer}>
						<FooterContent text={site.footer} />
					</Suspense>
				</footer>
			)}
		</div>
	);
}
