import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminSettings, useSaveSettings } from "@/lib/admin-queries";

// DuckDuckGo / FaviconExtractor 对未知域名返回 404,加载失败会走首字母占位;
// favicon.im 未知域名也返回占位图,但国内可直连
const iconServicePresets = [
	{ label: "DuckDuckGo", value: "https://icons.duckduckgo.com/ip3/{domain}.ico" },
	{ label: "favicon.im", value: "https://favicon.im/{domain}" },
	{ label: "FaviconExtractor", value: "https://www.faviconextractor.com/favicon/{domain}" },
] as const;

export default function AdminSettings() {
	const { data, isLoading } = useAdminSettings();
	const save = useSaveSettings();
	// 以已保存配置为基准,draft 只记录用户改动过的字段,避免用 effect 回填 state
	const [draft, setDraft] = useState<Record<string, string>>({});
	const siteName = draft.siteName ?? data?.siteName ?? "";
	const footer = draft.footer ?? data?.footer ?? "";
	const iconService = draft["icon.service"] ?? data?.["icon.service"] ?? "";
	const setField = (key: string, value: string) =>
		setDraft((prev) => ({ ...prev, [key]: value }));

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		save.mutate({ siteName, footer });
	}

	function handleIconSubmit(e: FormEvent) {
		e.preventDefault();
		save.mutate({ "icon.service": iconService });
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>基础信息</CardTitle>
					<CardDescription>前台展示页使用的站点配置</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="site-name">站点名称</Label>
							<Input
								id="site-name"
								value={siteName}
								onChange={(e) => setField("siteName", e.target.value)}
								placeholder="书签导航"
								disabled={isLoading}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="site-footer">页脚文字</Label>
							<Textarea
								id="site-footer"
								value={footer}
								onChange={(e) => setField("footer", e.target.value)}
								rows={2}
								disabled={isLoading}
							/>
							<p className="text-xs text-muted-foreground">
								支持 Markdown：链接{" "}
								<code className="rounded bg-muted px-1">[文字](网址)</code>、
								<code className="rounded bg-muted px-1">**加粗**</code>、
								<code className="rounded bg-muted px-1">*斜体*</code>
								，直接写网址会显示为文字；换行即换行
							</p>
						</div>
						<Button type="submit" disabled={save.isPending || isLoading}>
							{save.isPending ? "保存中…" : "保存"}
						</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>图标获取</CardTitle>
					<CardDescription>
						配置 favicon 服务地址模板，用 {`{domain}`} 占位书签域名；留空则不自动获取图标
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleIconSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="icon-service">服务地址模板</Label>
							<Input
								id="icon-service"
								value={iconService}
								onChange={(e) => setField("icon.service", e.target.value)}
								placeholder="https://favicon.im/{domain}"
								disabled={isLoading}
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							{iconServicePresets.map(({ label, value }) => (
								<Button
									key={value}
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setField("icon.service", value)}
								>
									{label}
								</Button>
							))}
						</div>
						<Button type="submit" disabled={save.isPending || isLoading}>
							{save.isPending ? "保存中…" : "保存"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}