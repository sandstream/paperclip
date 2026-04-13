export type CompanySelectionSource = "manual" | "route_sync" | "bootstrap";

export function shouldSyncCompanySelectionFromRoute(params: {
  selectionSource: CompanySelectionSource;
  selectedCompanyId: string | null;
  routeCompanyId: string;
}): boolean {
  const { selectedCompanyId, routeCompanyId } = params;

  if (selectedCompanyId === routeCompanyId) return false;

  // Always sync from route — deep links must resolve to the correct company.
  return true;
}
