import Link from "next/link";
import { getSession, parseTranscript, timeAgo, formatDuration } from "../../lib/api";
import { LiveRefresh } from "../../components/live-refresh";
import { AISummary } from "../../components/ai-summary";
import { CopyLink } from "../../components/copy-link";

function MetadataItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-medium tracking-wider mb-0.5" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div className="text-[12px] font-mono" style={{ color: accent ? "var(--accent)" : "var(--text-secondary)" }}>
        {value}
      </div>
    </div>
  );
}

function TurnNumber({ n }: { n: number }) {
  return (
    <span
      className="text-[9px] font-mono px-1 py-0.5 rounded"
      style={{ background: "var(--bg-primary)", color: "var(--text-tertiary)" }}
    >
      #{n}
    </span>
  );
}

function MessageBubble({ role, text, userName, turnNumber }: { role: string; text: string; userName: string; turnNumber: number }) {
  const isUser = role === "user";
  const paragraphs = text.split("\n\n").filter(Boolean);

  return (
    <div className="animate-fade-in group" style={{ animationDelay: `${turnNumber * 0.03}s` }}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{
            background: isUser ? "var(--accent-muted)" : "var(--orchid-pink-muted)",
            color: isUser ? "var(--accent)" : "var(--orchid-pink)",
          }}
        >
          {isUser ? userName[0]?.toUpperCase() || "H" : "AI"}
        </div>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {isUser ? userName : "Claude"}
        </span>
        <TurnNumber n={turnNumber} />
      </div>
      <div
        className="rounded-lg px-4 py-3 text-[13px] leading-[1.7]"
        style={{
          background: isUser ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          borderLeft: isUser ? "2px solid var(--accent)" : "2px solid var(--orchid-pink)",
          color: "var(--text-primary)",
        }}
      >
        {paragraphs.map((para, i) => {
          if (para.startsWith("```")) {
            const lines = para.split("\n");
            const lang = lines[0].replace("```", "").trim();
            const code = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : undefined).join("\n");
            return (
              <div key={i} className="my-3">
                {lang && (
                  <div
                    className="text-[10px] font-mono px-3 py-1 rounded-t border-b"
                    style={{ background: "var(--bg-primary)", color: "var(--text-tertiary)", borderColor: "var(--border-subtle)" }}
                  >
                    {lang}
                  </div>
                )}
                <pre
                  className="font-mono text-[12px] p-3 rounded-b overflow-x-auto"
                  style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
                >
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          if (/^\d+\./.test(para)) {
            const items = para.split(/\n/).filter(Boolean);
            return (
              <div key={i} className="my-2 space-y-1.5">
                {items.map((item, j) => (
                  <div key={j} className="flex gap-2">
                    <span className="shrink-0 font-mono text-[12px]" style={{ color: "var(--accent)", opacity: 0.6 }}>
                      {item.match(/^\d+\./)?.[0] || ""}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: item.replace(/^\d+\.\s*/, "").replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary)">$1</strong>') }} />
                  </div>
                ))}
              </div>
            );
          }

          if (para.startsWith("- ") || para.startsWith("* ")) {
            const items = para.split(/\n/).filter(Boolean);
            return (
              <div key={i} className="my-2 space-y-1">
                {items.map((item, j) => (
                  <div key={j} className="flex gap-2">
                    <span className="shrink-0" style={{ color: "var(--orchid-pink)", opacity: 0.5 }}>&bull;</span>
                    <span dangerouslySetInnerHTML={{ __html: item.replace(/^[-*]\s*/, "").replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary)">$1</strong>').replace(/`([^`]+)`/g, '<code style="background: var(--bg-primary); padding: 1px 4px; border-radius: 3px; font-size: 12px; color: var(--orchid-pink)">$1</code>') }} />
                  </div>
                ))}
              </div>
            );
          }

          const rendered = para
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary)">$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background: var(--bg-primary); padding: 1px 4px; border-radius: 3px; font-size: 12px; color: var(--orchid-pink)">$1</code>');

          return (
            <p
              key={i}
              className={i > 0 ? "mt-2.5" : ""}
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
  const userName = session.user_name || "unknown";

  return (
    <div className="animate-fade-in">
      {isActive && <LiveRefresh />}

      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-6 h-[52px] border-b backdrop-blur-sm"
        style={{
          background: "rgba(10, 10, 15, 0.85)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-1 text-[12px] font-medium transition-colors hover:opacity-80"
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
        <div className="ml-auto flex items-center gap-2">
          <CopyLink />
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {turns.length} turns
          </span>
        </div>
      </header>

      {/* Session metadata */}
      <div
        className="px-6 py-4 border-b grid grid-cols-2 md:grid-cols-4 gap-4"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <MetadataItem label="User" value={`${userName} <${session.user_email || "unknown"}>`} />
        <MetadataItem label="Branch" value={session.branch || "unknown"} accent />
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
          className="px-6 py-2.5 border-b flex items-center gap-2"
          style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--text-tertiary)" }}>
            <circle cx="8" cy="4" r="2" />
            <circle cx="4" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M8 6v2M6.5 11L7.5 8.5M9.5 11L8.5 8.5" />
          </svg>
          <div className="flex flex-wrap gap-2">
            {session.git_remotes.map((remote: string, i: number) => (
              <span
                key={i}
                className="text-[11px] font-mono px-2 py-0.5 rounded"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
              >
                {remote}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Summary */}
      <AISummary sessionId={session.id} />

      {/* Conversation */}
      <div className="px-6 py-6 max-w-3xl mx-auto">
        {turns.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-secondary)" }}>
            <p className="text-sm">No conversation messages found in this session.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {turns.map((turn, i) => (
              <div key={i} className="timeline-connector message-enter" style={{ animationDelay: `${i * 0.05}s` }} id={`turn-${i + 1}`}>
                <MessageBubble role={turn.role} text={turn.text} userName={userName} turnNumber={i + 1} />
              </div>
            ))}
          </div>
        )}

        {isActive && (
          <div className="mt-8 space-y-4">
            {/* Typing indicator */}
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ background: "var(--orchid-pink-muted)", color: "var(--orchid-pink)" }}
              >
                AI
              </div>
              <div
                className="px-4 py-3 rounded-lg flex items-center gap-1.5"
                style={{ background: "var(--bg-secondary)", borderLeft: "2px solid var(--orchid-pink)" }}
              >
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>

            <div
              className="flex items-center gap-2 text-[12px] px-4 py-3 rounded-lg border"
              style={{
                borderColor: "var(--green)",
                background: "var(--green-muted)",
                color: "var(--green)",
              }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: "var(--green)" }} />
              This session is still active. Page refreshes automatically every 10 seconds.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
