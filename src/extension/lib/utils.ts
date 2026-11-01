// shim:WXT 把 "@" 固定映射到插件 srcDir,主前端组件内部的 `import { cn } from "@/lib/utils"`
// 会解析到这里,借此转发到真正实现,让插件直接复用主前端的组件
export { cn } from "../../react-app/lib/utils";
