import { cookies } from "next/headers";
import { LEVEL_COOKIE, LOCALE_COOKIE, messagesFor, parseLevel, parseLocale } from "./prefs";

export async function serverPrefs() {
  const jar = await cookies();
  const lang = parseLocale(jar.get(LOCALE_COOKIE)?.value);
  const level = parseLevel(jar.get(LEVEL_COOKIE)?.value);
  return { lang, level, t: messagesFor(lang) };
}
