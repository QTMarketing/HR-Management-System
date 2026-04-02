import type { ReactNode } from "react";

type Props = {
  /** e.g. `max-w-[10rem]` — should pair with thead `min-w-*` for that column */
  maxClass: string;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Table body cell padding; default matches Users directory */
  padClass?: string;
};

/**
 * Connecteam-style table cell: one line, ellipsis when overflow, full value in `title`.
 */
export function EllipsisTd({
  maxClass,
  title,
  children,
  className = "",
  padClass = "px-4 py-3 align-middle",
}: Props) {
  return (
    <td className={`${padClass} ${maxClass} min-w-0 ${className}`}>
      <div className="truncate" title={title}>
        {children}
      </div>
    </td>
  );
}
