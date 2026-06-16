import { UserCircle2, ChevronDown, Users, Crown } from 'lucide-react';
import { useState } from 'react';

export type NetworkUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  referrerId?: string | null;
  children: NetworkUser[];
};

export function buildReferralTree(rootId: string, flat: Omit<NetworkUser, 'children'>[]): NetworkUser[] {
  const withChildren = new Map<string, NetworkUser>();
  for (const u of flat) {
    withChildren.set(u.id, { ...u, children: [] });
  }
  const roots: NetworkUser[] = [];
  for (const u of flat) {
    const node = withChildren.get(u.id)!;
    const pid = u.referrerId;
    if (pid === rootId) {
      roots.push(node);
    } else if (pid && withChildren.has(pid)) {
      withChildren.get(pid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function countDescendants(node: NetworkUser): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

const levelColors = [
  'from-brand-600 to-brand-800',
  'from-emerald-500 to-emerald-700',
  'from-teal-500 to-teal-700',
  'from-cyan-500 to-cyan-700',
  'from-sky-500 to-sky-700',
];

export function ReferralTree({
  roots,
  depth = 0,
}: {
  roots: NetworkUser[];
  depth?: number;
}) {
  if (roots.length === 0) return null;
  return (
    <ul className={depth === 0 ? 'space-y-3' : 'mt-3 space-y-3 relative pl-6 ml-6 border-l-2 border-dashed border-brand-300'}>
      {roots.map((node) => (
        <TreeNode key={node.id} node={node} depth={depth} />
      ))}
    </ul>
  );
}

function TreeNode({ node, depth }: { node: NetworkUser; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const descendants = countDescendants(node);
  const colorClass = levelColors[depth % levelColors.length];
  const initial = (node.name || node.email || '?').charAt(0).toUpperCase();

  return (
    <li className="relative group">
      {depth > 0 && (
        <div className="absolute left-[-26px] top-7 w-6 border-t-2 border-dashed border-brand-300" />
      )}
      <div
        className={`flex items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-brand-200 transition-all duration-200 ${
          depth === 0 ? 'ring-1 ring-brand-600/10' : ''
        }`}
      >
        {/* Avatar */}
        <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${colorClass} text-base font-black text-white shadow-md`}>
          {initial}
          {depth === 0 && (
            <Crown className="absolute -top-2 -right-1 h-4 w-4 text-amber-400 fill-amber-400" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-slate-900 text-sm">{node.name || 'Member'}</p>
            {node.role ? (
              <span className="shrink-0 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 ring-1 ring-brand-200">
                {node.role}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-slate-500">{node.email}</p>
          {descendants > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400 font-medium">
              <Users className="h-3 w-3" />
              <span>{descendants} {descendants === 1 ? 'referido' : 'referidos'}</span>
            </div>
          )}
        </div>

        {/* Expand toggle */}
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="toggle"
          >
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
          </button>
        ) : (
          <UserCircle2 className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
        )}
      </div>
      {open && node.children.length > 0 ? (
        <ReferralTree roots={node.children} depth={depth + 1} />
      ) : null}
    </li>
  );
}
