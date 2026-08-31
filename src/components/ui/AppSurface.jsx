export function AppPageHeader({ action, icon, subtitle, title }) {
  return (
    <header className="app-page-header">
      {icon ? <div className="app-page-header__icon">{icon}</div> : null}
      <div className="app-page-header__copy">
        <h1 className="app-page-header__title">{title}</h1>
        {subtitle ? (
          <div className="app-page-header__subtitle">{subtitle}</div>
        ) : null}
      </div>
      {action ? <div className="app-page-header__action">{action}</div> : null}
    </header>
  );
}

export function AppSectionCard({ children, className = "", tone = "default" }) {
  return (
    <section className={`app-section-card app-section-card--${tone} ${className}`.trim()}>
      {children}
    </section>
  );
}

export function AppStatusPill({ children, tone = "neutral" }) {
  return (
    <span className={`app-status-pill app-status-pill--${tone}`}>
      {children}
    </span>
  );
}

export function AppSectionHeading({ action, eyebrow, subtitle, title }) {
  return (
    <div className="app-section-heading">
      <div className="app-section-heading__copy">
        {eyebrow ? (
          <div className="app-section-heading__eyebrow">{eyebrow}</div>
        ) : null}
        <h2 className="app-section-heading__title">{title}</h2>
        {subtitle ? (
          <div className="app-section-heading__subtitle">{subtitle}</div>
        ) : null}
      </div>
      {action ? <div className="app-section-heading__action">{action}</div> : null}
    </div>
  );
}
