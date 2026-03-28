import { Sidebar } from "../components/sidebar";
import { KeyboardNav } from "../components/keyboard-nav";
import { CommandPalette } from "../components/command-palette";
import { TitleUpdater } from "../components/title-updater";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-auto">
        <KeyboardNav />
        <CommandPalette />
        <TitleUpdater />
        {children}
      </main>
    </div>
  );
}
