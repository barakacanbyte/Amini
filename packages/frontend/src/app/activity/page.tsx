import { Suspense } from "react";
import { Metadata } from "next";
import { ActivityClient } from "./ActivityClient";

export const metadata: Metadata = {
  title: "Activity Feed | Amini",
  description: "See the latest updates and impact from verified organizations on Amini.",
};

export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityClient />
    </Suspense>
  );
}
