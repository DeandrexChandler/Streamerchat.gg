import { DocsSearch, DocsSidebar } from "@/components/site/DocsNav";
import { Tag } from "@/components/site/ui";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-docs">
      <div className="flex items-center justify-between gap-6 border-b border-white/[0.09] py-5">
        <DocsSearch />
        <Tag>v0.1 beta</Tag>
      </div>
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-14 pb-24 pt-14">
        <aside>
          <DocsSidebar />
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
