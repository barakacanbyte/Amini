import { notFound, redirect } from "next/navigation";
import { loadProfileForPage } from "@/lib/loadProfile";
import { loadProfilePublicActivity } from "@/lib/loadProfilePublicActivity";
import { ProfilePageClient } from "./ProfilePageClient";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw.trim());
  const data = await loadProfileForPage(handle);
  if (!data) notFound();

  const { profile, wallet, matchedBy } = data;

  if (matchedBy === "wallet" && profile.profile_slug) {
    redirect(`/profile/${encodeURIComponent(profile.profile_slug)}`);
  }

  const activity = await loadProfilePublicActivity(wallet);

  return (
    <ProfilePageClient
      wallet={wallet}
      routeHandle={handle}
      initialProfile={profile}
      activity={activity}
    />
  );
}
