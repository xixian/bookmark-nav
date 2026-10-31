import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStatus } from "@/lib/queries";
import {
	useChangePassword,
	useChangeUsername,
	useCreateApiToken,
	useApiToken,
	useRevokeApiToken,
} from "@/lib/admin-queries";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";

// 浏览器插件访问令牌卡片:生成(明文仅显示一次)/ 吊销
function ApiTokenCard() {
	const { data: status, isPending, isError, refetch } = useApiToken();
	const createToken = useCreateApiToken();
	const revokeToken = useRevokeApiToken();
	const [confirm, setConfirm] = useState<ConfirmState | null>(null);
	// 刚生成的明文令牌,只在本次会话展示一次;关闭后不再可查看
	const [freshToken, setFreshToken] = useState<string | null>(null);

	function handleCreate() {
		createToken.mutate(undefined, {
			onSuccess: (data) => setFreshToken(data?.token ?? null),
		});
	}

	function askRotate() {
		setConfirm({
			title: "重新生成令牌?",
			description: "旧令牌将立即失效,已配置的浏览器插件需要更新为新令牌。",
			confirmText: "重新生成",
			onConfirm: handleCreate,
		});
	}

	function askRevoke() {
		setConfirm({
			title: "吊销令牌?",
			description: "所有使用该令牌的浏览器插件将立即失去访问权限。",
			confirmText: "吊销",
			onConfirm: () => {
				setFreshToken(null);
				revokeToken.mutate();
			},
		});
	}

	function handleCopy() {
		if (!freshToken) return;
		navigator.clipboard
			.writeText(freshToken)
			.then(() => toast.success("已复制到剪贴板"))
			.catch(() => toast.error("复制失败,请手动选择复制"));
	}

	const createdAt = status?.createdAt ? new Date(status.createdAt).toLocaleString() : null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>浏览器插件令牌</CardTitle>
				<CardDescription>
					为浏览器插件生成访问令牌(等同管理员权限,请妥善保管)。生成后只显示一次,仅可在插件中配置使用。
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{freshToken ? (
					<div className="space-y-2">
						<Label htmlFor="api-token">令牌(仅此一次,关闭后不可再查看)</Label>
						<div className="flex gap-2">
							<Input id="api-token" readOnly value={freshToken} className="font-mono text-xs" />
							<Button type="button" variant="outline" onClick={handleCopy}>
								复制
							</Button>
							<Button type="button" variant="ghost" onClick={() => setFreshToken(null)}>
								我已保存
							</Button>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-between gap-4">
						<div className="text-sm text-muted-foreground">
							{isError ? (
								// 状态未知时按钮禁用(见下),这里给出可恢复的入口,而不是误显「未启用」
								<button
									type="button"
									className="underline underline-offset-2"
									onClick={() => refetch()}
								>
									令牌状态加载失败,点击重试
								</button>
							) : status?.exists ? (
								`已启用 · 尾号 …${status.hint}${createdAt ? ` · 创建于 ${createdAt}` : ""}`
							) : (
								"未启用"
							)}
						</div>
						<div className="flex gap-2">
							{/* 状态未知(在途/失败)时禁用:此时无法区分「未启用」和「已启用」,
								放行会绕过确认弹窗直接轮换,静默吊销插件正在使用的令牌 */}
							<Button
								type="button"
								variant="outline"
								disabled={isPending || isError}
								onClick={status?.exists ? askRotate : handleCreate}
							>
								{status?.exists ? "重新生成" : "生成令牌"}
							</Button>
							{status?.exists && (
								<Button type="button" variant="destructive" onClick={askRevoke}>
									吊销
								</Button>
							)}
						</div>
					</div>
				)}
				<ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
			</CardContent>
		</Card>
	);
}

export default function AdminSecurity() {
	const changePassword = useChangePassword();
	const [oldPassword, setOldPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	function handleChangePassword(e: FormEvent) {
		e.preventDefault();
		if (newPassword !== confirmPassword) {
			toast.error("两次输入的新密码不一致");
			return;
		}
		changePassword.mutate(
			{ oldPassword, newPassword },
			{
				onSuccess: () => {
					setOldPassword("");
					setNewPassword("");
					setConfirmPassword("");
				},
			},
		);
	}

	const { data: auth } = useAuthStatus();
	const changeUsername = useChangeUsername();
	// 以服务端用户名为基准,draft 保存未提交的编辑,避免用 effect 回填 state
	const [usernameDraft, setUsernameDraft] = useState<string | null>(null);
	const [usernamePassword, setUsernamePassword] = useState("");
	const username = usernameDraft ?? auth?.user?.username ?? "";

	function handleChangeUsername(e: FormEvent) {
		e.preventDefault();
		changeUsername.mutate(
			{ username, password: usernamePassword },
			{ onSuccess: () => setUsernamePassword("") },
		);
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<ApiTokenCard />
			<Card>
				<CardHeader>
					<CardTitle>修改用户名</CardTitle>
					<CardDescription>修改当前管理员账号的登录用户名</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleChangeUsername} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">用户名</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsernameDraft(e.target.value)}
								maxLength={50}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="username-password">当前密码</Label>
							<Input
								id="username-password"
								type="password"
								value={usernamePassword}
								onChange={(e) => setUsernamePassword(e.target.value)}
								autoComplete="current-password"
								placeholder="验证身份后生效"
								required
							/>
						</div>
						<Button type="submit" disabled={changeUsername.isPending}>
							{changeUsername.isPending ? "修改中…" : "修改用户名"}
						</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>修改密码</CardTitle>
					<CardDescription>修改当前管理员账号的登录密码</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleChangePassword} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="old-password">当前密码</Label>
							<Input
								id="old-password"
								type="password"
								value={oldPassword}
								onChange={(e) => setOldPassword(e.target.value)}
								autoComplete="current-password"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="new-password">新密码</Label>
							<Input
								id="new-password"
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								autoComplete="new-password"
								minLength={6}
								placeholder="至少 6 位"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirm-password">确认新密码</Label>
							<Input
								id="confirm-password"
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								autoComplete="new-password"
								minLength={6}
								required
							/>
						</div>
						<Button type="submit" disabled={changePassword.isPending}>
							{changePassword.isPending ? "修改中…" : "修改密码"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
