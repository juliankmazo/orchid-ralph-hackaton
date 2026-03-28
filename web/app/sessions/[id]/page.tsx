import Link from "next/link";
import { getSession, parseTranscript, timeAgo, formatDuration } from "../../lib/api";

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-medium tracking-wider mb-0.5" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>
        {value}
      </div>
    </div>
  );
}

function MessageBubble({ role, text }: { role: string; text: string }) {
  const isUser = role === "user";

  const paragraphs = text.split("\n\n").filter(Boolean);

  return (
    <div className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{
            background: isUser ? "var(--accent-muted)" : "var(--orchid-pink-muted)",
            color: isUser ? "var(--accent)" : "var(--orchid-pink)",
          }}
        >
          {isUser ? "H" : "AI"}
        </div>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {isUser ? "Developer" : "Claude"}
        </span>
      </div>
      <div
        className="rounded-lg px-4 py-3 text-[13px] leading-relaxed"
        style={{
          background: isUser ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          borderLeft: isUser ? "2px solid var(--accent)" : "2px solid var(--orchid-pink)",
          color: "var(--text-primary)",
        }}
      >
        {paragraphs.map((para, i) => {
          // Check for code blocks
          if (para.startsWith("```")) {
            const lines = para.split("\n");
            const lang = lines[0].replace("```", "").trim();
            const code = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : undefined).join("\n");
            return (
              <div key={i} className="my-2">
                {lang && (
                  <div className="text-[10px] font-mono px-3 py-1 rounded-t" style={{ background: "var(--bg-primary)", color: "var(--text-tertiary)" }}>
                    {lang}
                  </div>
                )}
                <pre className="font-mono text-[12px] p-3 rounded-b overflow-x-auto" style={{ background: "var(--bg-primary)" }}>
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          // Check for numbered lists
          if (/^\d+\./.test(para)) {
            const items = para.split(/\n/).filter(Boolean);
            return (
              <div key={i} className="my-2 space-y-1">
                {items.map((item, j) => (
                  <div key={j} className="flex gap-2">
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {item.match(/^\d+\./)?.[0] || ""}
                    </span>
                    <span>{item.replace(/^\d+\.\s*/, "")}</span>
                  </div>
                ))}
              </div>
            );
          }

          // Bold text handling
          const rendered = para.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

          return (
            <p
              key={i}
              className={i > 0 ? "mt-2" : ""}
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          );
        })}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let session;
  try {
    session = await getSession(decodeURIComponent(id));
  } catch {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center" style={{ color: "var(--text-secondary)" }}>
          <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            Session not found
          </p>
          <Link href="/" className="text-sm underline" style={{ color: "var(--accent)" }}>
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  const turns = session.transcript ? parseTranscript(session.transcript) : [];
  const isActive = session.status === "active";

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-6 h-[52px] border-b backdrop-blur-sm"
        style={{
          background: "rgba(10, 10, 15, 0.8)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-1 text-[12px] font-medium transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4l-4 4 4 4" />
          </svg>
          Sessions
        </Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span className="text-[13px] font-medium truncate">{session.id}</span>
        {isActive && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: "var(--green-muted)",
              color: "var(--green)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--green)" }} />
            Live
          </span>
        )}
      </header>

      {/* Session metadata */}
      <div
        className="px-6 py-4 border-b grid grid-cols-2 md:grid-cols-4 gap-4"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <MetadataItem label="User" value={`${session.user_name || "unknown"} <${session.user_email || "unknown"}>`} />
        <MetadataItem label="Branch" value={session.branch || "unknown"} />
        <MetadataItem label="Directory" value={session.working_dir || "unknown"} />
        <MetadataItem label="Duration" value={
          session.started_at && session.updated_at
            ? formatDuration(session.started_at, session.updated_at)
            : "unknown"
        } />
        <MetadataItem label="Tool" value={session.tool || "unknown"} />
        <MetadataItem label="Messages" value={`${turns.length} turns`} />
        <MetadataItem label="Started" value={session.started_at ? new Date(session.started_at).toLocaleString() : "unknown"} />
        <MetadataItem label="Last Update" value={session.updated_at ? timeAgo(session.updated_at) : "unknown"} />
      </div>

      {/* Git remotes */}
      {session.git_remotes && session.git_remotes.length > 0 && (
        <div
          className="px-6 py-2 border-b flex items-center gap-2"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--text-tertiary)" }}>
            <circle cx="8" cy="4" r="2" />
            <circle cx="4" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M8 6v2M6.5 11L7.5 8.5M9.5 11L8.5 8.5" />
          </svg>
          <div className="flex gap-3">
            {session.git_remotes.map((remote: string, i: number) => (
              <span key={i} className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {remote}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className="px-6 py-6 max-w-3xl">
        {turns.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-secondary)" }}>
            <p className="text-sm">No conversation messages found in this session.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {turns.map((turn, i) => (
              <MessageBubble key={i} role={turn.role} text={turn.text} />
            ))}
          </div>
        )}

        {isActive && (
          <div
            className="mt-6 flex items-center gap-2 text-[12px] px-4 py-3 rounded-lg border"
            style={{
              borderColor: "var(--green)",
              background: "var(--green-muted)",
              color: "var(--green)",
            }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: "var(--green)" }} />
            This session is still active. The conversation will update as new messages arrive.
          </div>
        )}
      </div>
    </div>
  );
}
