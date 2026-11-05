import { RouteSkeleton } from "@/components/shell/route-states";
import { serverPrefs } from "@/lib/server-prefs";

export default async function Loading() {
  const { t } = await serverPrefs();
  return <RouteSkeleton label={t.states.loading} />;
}
