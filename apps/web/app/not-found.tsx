import { BackLink, RouteMessage } from "@/components/shell/route-states";
import { serverPrefs } from "@/lib/server-prefs";

export default async function NotFound() {
  const { t } = await serverPrefs();
  return (
    <RouteMessage
      title={t.states.notFound}
      body={t.states.notFoundBody}
      action={<BackLink label={t.states.back} />}
    />
  );
}
