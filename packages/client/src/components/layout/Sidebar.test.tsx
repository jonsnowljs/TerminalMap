import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Sidebar from './Sidebar';

describe('Sidebar', () => {
  it('renders the logo from the public assets path', () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        sessions={[]}
        activeSessionId={null}
        workspace={null}
        workspaceLinks={[]}
        onSelectSession={() => {}}
        onDeleteSession={() => {}}
        onNewSession={() => {}}
        onNewTerminal={() => {}}
        onSelectWorkspace={() => {}}
        onRenameWorkspace={() => {}}
        onDeleteWorkspace={() => {}}
      />,
    );

    expect(markup).toContain('src="/logo.svg"');
  });
});
