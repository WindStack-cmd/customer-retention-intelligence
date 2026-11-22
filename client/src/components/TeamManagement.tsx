import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { UserPlus, Shield, Trash2, Mail, Copy, Check } from "lucide-react";

export function TeamManagement() {
  const utils = trpc.useUtils();
  const { data: currentData } = trpc.workspace.current.useQuery();
  const { data: members, isLoading } = trpc.workspace.members.useQuery();
  const { data: invites } = trpc.workspace.invites.useQuery(undefined, {
    enabled: currentData?.role === "admin",
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "csm" | "analyst" | "viewer">("csm");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const inviteMutation = trpc.workspace.invite.useMutation({
    onSuccess: () => {
      setInviteEmail("");
      utils.workspace.invites.invalidate();
    },
  });

  const updateRoleMutation = trpc.workspace.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.workspace.members.invalidate();
    },
  });

  const removeMemberMutation = trpc.workspace.removeMember.useMutation({
    onSuccess: () => {
      utils.workspace.members.invalidate();
    },
  });

  const revokeInviteMutation = trpc.workspace.revokeInvite.useMutation({
    onSuccess: () => {
      utils.workspace.invites.invalidate();
    },
  });

  const isAdmin = currentData?.role === "admin";

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const copyInviteLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/#invite=${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header & Current User Role */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Team & Access Control
          </h3>
          <p className="text-xs text-muted-foreground">
            Manage workspace members, role-based access permissions, and pending invitations.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <Shield className="h-4 w-4" />
          <span>Your Role: <strong className="capitalize">{currentData?.role || "viewer"}</strong></span>
        </div>
      </div>

      {/* Invite Member Card (Admin only) */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <span>Invite Team Member</span>
          </h4>
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="csm">CSM (Customer Success)</option>
              <option value="analyst">Analyst (Data & GenAI)</option>
              <option value="admin">Admin (Full Control)</option>
              <option value="viewer">Viewer (Read Only)</option>
            </select>
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </button>
          </form>
          {inviteMutation.error && (
            <p className="mt-2 text-xs text-status-urgent-text">
              {inviteMutation.error.message}
            </p>
          )}
        </div>
      )}

      {/* Workspace Members Table */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Active Members ({members?.length || 0})
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-subtle-foreground">
                <th className="pb-2.5 font-medium">Member</th>
                <th className="pb-2.5 font-medium">Email</th>
                <th className="pb-2.5 font-medium">Role</th>
                {isAdmin && <th className="pb-2.5 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    Loading members...
                  </td>
                </tr>
              ) : members?.map((m) => (
                <tr key={m.id} className="group hover:bg-card-hover">
                  <td className="py-3 font-medium text-foreground">
                    {m.userName}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {m.userEmail}
                  </td>
                  <td className="py-3">
                    {isAdmin && m.userId !== currentData?.membership?.userId ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            userId: m.userId,
                            role: e.target.value as any,
                          })
                        }
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                      >
                        <option value="admin">Admin</option>
                        <option value="csm">CSM</option>
                        <option value="analyst">Analyst</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="capitalize text-foreground font-medium">
                        {m.role}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="py-3 text-right">
                      {m.userId !== currentData?.membership?.userId && (
                        <button
                          onClick={() => removeMemberMutation.mutate({ userId: m.userId })}
                          className="rounded-lg p-1 text-muted-foreground transition hover:bg-status-urgent-bg hover:text-status-urgent-text"
                          title="Remove Member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invites List */}
      {isAdmin && invites && invites.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Pending Invitations ({invites.length})
          </h4>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background p-3"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">{inv.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Invited as <span className="capitalize text-primary font-medium">{inv.role}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyInviteLink(inv.token)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-card-hover"
                  >
                    {copiedToken === inv.token ? (
                      <>
                        <Check className="h-3 w-3 text-primary" />
                        <span className="text-primary">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => revokeInviteMutation.mutate({ inviteId: inv.id })}
                    className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-status-urgent-text"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
