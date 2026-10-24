"use client";
// Solar duotone icons (Osen's widget icons), rendered offline from the bundled subset in icon-data.json.
// Add an icon: put its name in scripts/icons.mjs, run `node scripts/icons.mjs`. Size follows font-size (fs-22...).
import { Icon as Iconify, addCollection } from "@iconify/react/offline";
import data from "./icon-data.json";

addCollection(data);

export type IconName = keyof typeof data.icons;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <Iconify icon={`solar:${name}`} className={className} aria-hidden="true" />;
}
