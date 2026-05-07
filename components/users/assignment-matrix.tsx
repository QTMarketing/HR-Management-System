"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/**
 * AssignmentMatrix
 * ----------------
 * Generic checkbox-list "matrix" used by the Smart Groups client to render
 * the four near-identical assignment grids (members, admins, time-clock
 * assignments, schedule assignments). It does NOT own state, server actions,
 * or filtering — those stay in the parent so the underlying mutations and
 * server-action signatures are unchanged.
 *
 * Shapes supported:
 * - "default" density → modal-style list with divider lines (Members / Admins).
 * - "compact" density → popover-style list, optionally wrapped in a
 *   collapsible card with a parent checkbox + count badge (Time Clock / Schedule).
 */

export type AssignmentMatrixItem = {
  id: string;
  /** Primary label rendered as the row text. */
  label: string;
  /** Optional muted suffix shown next to the label, e.g. "(Store name)". */
  secondaryLabel?: string;
  /** Optional sub-line rendered beneath the label. */
  hint?: string;
};

export type AssignmentMatrixHeader = {
  title: string;
  /** e.g. "3/12" — small tabular-nums summary on the right. */
  countLabel?: string;
  /** When defined, a parent checkbox is rendered at the left of the header. */
  parentToggle?: {
    checked: boolean;
    indeterminate: boolean;
    disabled?: boolean;
    onToggle: () => void;
    ariaLabel: string;
  };
  /** When defined, a chevron toggles visibility of the rows. */
  collapsible?: {
    expanded: boolean;
    onToggle: () => void;
    expandedLabel: string;
    collapsedLabel: string;
  };
};

export type AssignmentMatrixProps = {
  items: AssignmentMatrixItem[];
  selectedIds: Set<string>;
  onToggle: (id: string, next: boolean) => void;
  /** Whether checkboxes are interactive. Defaults to true. */
  canEdit?: boolean;
  /** Disables every checkbox while a mutation is in flight. */
  busy?: boolean;
  /** Empty-state message rendered when items is empty. */
  emptyMessage?: string;
  /** Optional header bar (title, parent toggle, count, collapse). */
  header?: AssignmentMatrixHeader;
  /** Visual variant. */
  density?: "default" | "compact";
  /** Extra classes for the outer wrapper. */
  className?: string;
};

function IndeterminateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={ariaLabel}
      className="rounded-sm border-slate-300 text-orange-600"
    />
  );
}

export function AssignmentMatrix({
  items,
  selectedIds,
  onToggle,
  canEdit = true,
  busy = false,
  emptyMessage = "No items to show.",
  header,
  density = "default",
  className,
}: AssignmentMatrixProps) {
  const compact = density === "compact";
  const expanded = header?.collapsible ? header.collapsible.expanded : true;
  const headerId = useId();

  const wrapClass = header
    ? `rounded-md border border-slate-100 bg-slate-50/50 ${className ?? ""}`
    : (className ?? "");

  const listClass = compact
    ? `space-y-0.5 bg-white px-2 py-2 text-sm ${header ? "border-t border-slate-100" : ""}`
    : "divide-y divide-slate-100 px-2 py-2 text-sm";

  const emptyClass = compact
    ? "px-2 py-1 text-xs text-slate-500"
    : "px-2 py-2 text-sm text-slate-500";

  const rowClass = compact
    ? "flex items-start gap-2 py-1"
    : "flex items-center gap-3 px-2 py-2";

  const checkboxClass = compact
    ? "mt-0.5 rounded-sm border-slate-300 text-orange-600"
    : "rounded-sm border-slate-300 text-orange-600";

  const labelTextClass = compact
    ? "min-w-0 leading-snug text-slate-700"
    : "min-w-0 flex-1 text-slate-800";

  return (
    <div className={wrapClass}>
      {header ? (
        <div className="flex items-center gap-2 px-2 py-2">
          {header.parentToggle ? (
            <IndeterminateCheckbox
              checked={header.parentToggle.checked}
              indeterminate={header.parentToggle.indeterminate}
              disabled={
                header.parentToggle.disabled ?? (!canEdit || busy || items.length === 0)
              }
              onChange={header.parentToggle.onToggle}
              ariaLabel={header.parentToggle.ariaLabel}
            />
          ) : null}
          <span
            id={headerId}
            className="min-w-0 flex-1 font-medium text-slate-800"
          >
            {header.title}
          </span>
          {header.countLabel ? (
            <span className="shrink-0 tabular-nums text-xs text-slate-500">
              {header.countLabel}
            </span>
          ) : null}
          {header.collapsible ? (
            <button
              type="button"
              className="rounded-md p-1 text-slate-500 hover:bg-white"
              aria-expanded={header.collapsible.expanded}
              aria-controls={`${headerId}-list`}
              aria-label={
                header.collapsible.expanded
                  ? header.collapsible.expandedLabel
                  : header.collapsible.collapsedLabel
              }
              onClick={header.collapsible.onToggle}
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform ${
                  header.collapsible.expanded ? "rotate-90" : ""
                }`}
              />
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <ul
          id={`${headerId}-list`}
          className={listClass}
          aria-labelledby={header ? headerId : undefined}
        >
          {items.length === 0 ? (
            <li className={emptyClass}>{emptyMessage}</li>
          ) : (
            items.map((it) => {
              const isOn = selectedIds.has(it.id);
              return (
                <li key={it.id} className={rowClass}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={isOn}
                    disabled={!canEdit || busy}
                    onChange={(e) => onToggle(it.id, e.target.checked)}
                  />
                  <span className={labelTextClass}>
                    {compact ? (
                      <>
                        <span className="font-medium">{it.label}</span>
                        {it.secondaryLabel ? (
                          <>
                            {" "}
                            <span className="text-slate-400">{it.secondaryLabel}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {it.label}
                        {it.secondaryLabel ? (
                          <span className="ml-1 text-slate-400">{it.secondaryLabel}</span>
                        ) : null}
                      </>
                    )}
                    {it.hint ? (
                      <span className="block text-xs text-slate-400">{it.hint}</span>
                    ) : null}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
