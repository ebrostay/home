import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware drop-ins for Next's navigation APIs. Always import these
// instead of "next/link" / "next/navigation" so hrefs keep their prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
