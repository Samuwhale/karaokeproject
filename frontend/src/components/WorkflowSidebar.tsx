import { LIBRARY_FILTERS, type LibraryFilter } from './trackListView'

type WorkflowSidebarProps = {
  view: 'inbox' | 'library'
  activeFilter: LibraryFilter
  countsByFilter: Record<LibraryFilter, number>
  workflowFocus: {
    title: string
    description: string
    actionLabel: string
    action: () => void
  }
  onViewChange: (view: 'inbox' | 'library') => void
  onFilterChange: (filter: LibraryFilter) => void
}

export function WorkflowSidebar({
  view,
  activeFilter,
  countsByFilter,
  workflowFocus,
  onViewChange,
  onFilterChange,
}: WorkflowSidebarProps) {
  const showingInbox = view === 'inbox'

  return (
    <div className="workspace-rail library-workspace">
      <section className="workspace-rail-section">
        <div className="section-head">
          <div className="section-head-copy">
            <h2>Workspace</h2>
            <p>Keep the worklist visible, then drop into the full library only when you need to browse.</p>
          </div>
        </div>

        <div className="workspace-pane-switch" role="tablist" aria-label="Workspace views">
          <button
            type="button"
            role="tab"
            aria-selected={showingInbox}
            className={`workspace-pane-switch-button ${showingInbox ? 'workspace-pane-switch-button-active' : ''}`}
            onClick={() => onViewChange('inbox')}
          >
            Inbox
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!showingInbox}
            className={`workspace-pane-switch-button ${!showingInbox ? 'workspace-pane-switch-button-active' : ''}`}
            onClick={() => onViewChange('library')}
          >
            Library
          </button>
        </div>

        <div className="workspace-next-step">
          <div className="workspace-next-step-copy">
            <h3>{workflowFocus.title}</h3>
            <p>{workflowFocus.description}</p>
          </div>
          <div className="workspace-next-step-actions">
            <button type="button" className="button-primary" onClick={workflowFocus.action}>
              {workflowFocus.actionLabel}
            </button>
          </div>
        </div>
      </section>

      <section className="workspace-rail-section">
        <div className="section-head">
          <div className="section-head-copy">
            <h2>Workflow stages</h2>
            <p>Open the library by stage when you need to browse outside the inbox.</p>
          </div>
        </div>

        <nav className="workspace-stage-nav" aria-label="Library stages">
          {LIBRARY_FILTERS.map((item) => {
            const active = item.value === activeFilter
            return (
              <button
                key={item.value}
                type="button"
                className={`workspace-stage-button ${active ? 'workspace-stage-button-active' : ''}`}
                onClick={() => onFilterChange(item.value)}
                aria-pressed={active}
              >
                <strong>{item.label}</strong>
                <span>{countsByFilter[item.value]}</span>
              </button>
            )
          })}
        </nav>

        {!showingInbox ? (
          <p className="workspace-stage-hint">
            Use the library for search, bulk selection, and reopening any song by stage.
          </p>
        ) : null}
      </section>
    </div>
  )
}
