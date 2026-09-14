import type { ReactNode } from "react";

type AuthShellProps = {
  children?: ReactNode;
  description: ReactNode;
  descriptionRole?: "alert" | "status";
  footer?: ReactNode;
  title: string;
};

export function AuthShell({
  children,
  description,
  descriptionRole,
  footer,
  title,
}: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <div className="auth-brand" aria-label="Kulka AI">
          Kulka<span className="logo-ai" aria-hidden="true">AI</span>
        </div>
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-header">
            <h1 id="auth-title">{title}</h1>
            <p className="auth-description" role={descriptionRole}>{description}</p>
          </header>
          {children ?? null}
          {footer ? <footer className="auth-footer">{footer}</footer> : null}
        </section>
      </div>
    </main>
  );
}
