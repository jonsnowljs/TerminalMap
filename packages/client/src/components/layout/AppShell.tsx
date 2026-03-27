interface AppShellProps {
  toolbar: React.ReactNode;
  top: React.ReactNode;
}

export default function AppShell({ toolbar, top }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="flex-1 overflow-hidden">
        {top}
      </div>
    </div>
  );
}
