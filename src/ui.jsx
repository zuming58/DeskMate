import { useEffect, useId, useRef } from "react";
import {
  IconAlertTriangle as AlertTriangle,
  IconCheck as Check,
  IconChevronRight as ChevronRight,
  IconHelpCircle as CircleHelp,
  IconInfoCircle as Info,
  IconSearch as Search,
  IconShieldCheck as ShieldCheck,
  IconSparkles as Sparkles,
  IconX as X,
} from "@tabler/icons-react";

export function Card({ children, className = "", interactive = false }) {
  return <section className={`card ${interactive ? "card--interactive" : ""} ${className}`}>{children}</section>;
}

export function PageIntro({ eyebrow, title, description, actions }) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ index, title, description, action }) {
  return (
    <div className="section-title">
      <div>
        <div className="section-kicker"><span>{index}</span>{title}</div>
        {description && <p>{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function StatusBadge({ tone = "neutral", children, dot = true }) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}

export function Button({ children, icon: Icon, variant = "secondary", className = "", ...props }) {
  return (
    <button className={`button button--${variant} ${className}`} {...props}>
      {Icon && <Icon size={18} stroke={1.8} />}
      <span>{children}</span>
    </button>
  );
}

export function ConfirmationDialog({ open, title, description, paths = [], busy = false, eyebrow = "CONFIGURATION REVIEW", summaryLabel = "本次修改路径", notice = "只修改上面列出的已脱敏路径；网络、音频和未知字段保持原值。取消不会改变板上配置。", confirmLabel = "确认并同步", confirmVariant = "primary", busyLabel = "正在保存并核对…", onCancel, onConfirm }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onCancel?.();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [busy, onCancel, open]);

  if (!open) return null;
  return (
    <div className="confirmation-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}>
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="confirmation-dialog__header">
          <span className="confirmation-dialog__icon"><ShieldCheck size={24} stroke={1.75} /></span>
          <div>
            <span className="confirmation-dialog__eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
        </div>
        <div className="confirmation-dialog__body">
          <div className="confirmation-dialog__summary">
            <div><strong>{summaryLabel}</strong><span>{paths.length} 项</span></div>
            <ul>{paths.map((path) => <li key={path}><code>{path}</code></li>)}</ul>
          </div>
          <div className="confirmation-dialog__notice"><ShieldCheck size={18} stroke={1.8} /><p>{notice}</p></div>
        </div>
        <div className="confirmation-dialog__footer">
          <button ref={cancelButtonRef} className="button button--ghost" disabled={busy} onClick={onCancel}><span>取消</span></button>
          <Button variant={confirmVariant} disabled={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}

export function IconButton({ icon: Icon, label, variant = "ghost", ...props }) {
  return (
    <button className={`icon-button icon-button--${variant}`} aria-label={label} title={label} {...props}>
      <Icon size={19} stroke={1.8} />
    </button>
  );
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      className={`toggle ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    >
      <span />
    </button>
  );
}

export function Segmented({ options, value, onChange, compact = false }) {
  return (
    <div className={`segmented ${compact ? "segmented--compact" : ""}`}>
      {options.map((option) => {
        const item = typeof option === "string" ? { value: option, label: option } : option;
        return (
          <button
            key={item.value}
            className={value === item.value ? "is-active" : ""}
            onClick={() => onChange?.(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingRow({ title, description, children, icon: Icon }) {
  return (
    <div className="setting-row">
      <div className="setting-row__copy">
        {Icon && <div className="setting-row__icon"><Icon size={19} stroke={1.8} /></div>}
        <div>
          <strong>{title}</strong>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "搜索" }) {
  return (
    <label className="search-field">
      <Search size={18} stroke={1.7} />
      <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />
      {value && (
        <button aria-label="清空搜索" onClick={() => onChange?.("")}>
          <X size={16} />
        </button>
      )}
    </label>
  );
}

export function Notice({ tone = "info", title, children, action }) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "success" ? Check : tone === "demo" ? Sparkles : Info;
  return (
    <div className={`notice notice--${tone}`}>
      <div className="notice__icon"><Icon size={20} stroke={1.8} /></div>
      <div className="notice__body">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {action && <div className="notice__action">{action}</div>}
    </div>
  );
}

export function Select({ value, onChange, children, ariaLabel }) {
  return (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} aria-label={ariaLabel}>
      {children}
    </select>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, suffix = "%", label }) {
  return (
    <div className="slider-control">
      <input aria-label={label} type="range" min={min} max={max} value={value} onChange={(e) => onChange?.(Number(e.target.value))} />
      <span>{value}{suffix}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = CircleHelp, title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><Icon size={28} stroke={1.6} /></div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Metric({ label, value, unit, trend, tone = "blue" }) {
  return (
    <div className={`metric metric--${tone}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}<span>{unit}</span></div>
      {trend && <div className="metric__trend">{trend}</div>}
    </div>
  );
}

export function ListLink({ icon: Icon, title, description, status, onClick }) {
  return (
    <button className="list-link" onClick={onClick}>
      <span className="list-link__icon"><Icon size={20} stroke={1.8} /></span>
      <span className="list-link__copy"><strong>{title}</strong><small>{description}</small></span>
      {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      <ChevronRight size={18} stroke={1.7} />
    </button>
  );
}

export function Keycap({ children }) {
  return <kbd>{children}</kbd>;
}
