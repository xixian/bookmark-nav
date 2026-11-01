import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/api";
import { useAuthStatus } from "@/lib/queries";

// 登录页:未初始化时自动变成"创建管理员"页
export default function Login() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const { data: auth, isLoading, isError, refetch } = useAuthStatus();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const isSetup = auth ? !auth.initialized : false;

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			const body = { json: { username, password } };
			const res = isSetup
				? await client.api.auth.setup.$post(body)
				: await client.api.auth.login.$post(body);
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				toast.error(data.error ?? (isSetup ? "初始化失败" : "登录失败"));
				return;
			}
			await qc.invalidateQueries();
			toast.success(isSetup ? "管理员创建成功" : "登录成功");
			navigate("/");
		} catch {
			toast.error("网络错误,请重试");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-muted/40 px-4">
			{/* 返回前台:后台未登录跳转是 replace 进来的,history.back() 会失效,固定回首页最稳 */}
			<Button
				variant="ghost"
				size="sm"
				className="absolute top-4 left-4 text-muted-foreground"
				asChild
			>
				<Link to="/">
					<ArrowLeft className="size-4 shrink-0" />
					返回首页
				</Link>
			</Button>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>{isSetup ? "初始化管理员" : "登录"}</CardTitle>
					<CardDescription>
						{isSetup
							? "首次使用,请创建管理员账号"
							: "登录后可查看私密书签并进入后台"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{/* 状态查询失败时不能退化为登录表单:全新部署下 isSetup 恒为 false,
						初始化引导会变成登录页,新用户提交后报「用户名或密码错误」被卡死 */}
					{isError ? (
						<div className="flex flex-col items-center gap-3 py-4 text-sm text-muted-foreground">
							<p>加载站点状态失败,请检查网络</p>
							<Button variant="outline" size="sm" onClick={() => refetch()}>
								重试
							</Button>
						</div>
					) : (
						<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">用户名</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								autoComplete="username"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">密码</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete={isSetup ? "new-password" : "current-password"}
								minLength={6}
								required
							/>
						</div>
						<Button type="submit" className="w-full" disabled={submitting || isLoading}>
							{submitting ? "提交中…" : isSetup ? "创建并登录" : "登录"}
						</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
