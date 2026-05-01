"use client";

import { useMemo, useState } from "react";

type ProfileSummary = {
  id?: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type PostPhotoRow = {
  id: string;
  content?: string | null;
  image_url?: string | null;
  created_at: string;
  user_id: string;
};

type PhotoItem = {
  id: string;
  postId: string;
  url: string;
  caption?: string | null;
  createdAt: string;
  ownerId: string;
};

type ProfilePhotosSectionProps = {
  profileId: string;
  viewerId?: string;
  profile?: ProfileSummary | null;
  posts: PostPhotoRow[];
  isOwnProfile?: boolean;
};

function formatPhotoDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getProfileName(profile?: ProfileSummary | null) {
  return profile?.full_name || profile?.username || "Parapost Member";
}

export default function ProfilePhotosSection({
  profile,
  posts,
}: ProfilePhotosSectionProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

  const postedPhotos = useMemo<PhotoItem[]>(() => {
    return posts
      .filter((post) => post.image_url && post.image_url.trim())
      .map((post) => ({
        id: `posted-${post.id}`,
        postId: post.id,
        url: post.image_url || "",
        caption: post.content || "",
        createdAt: post.created_at,
        ownerId: post.user_id,
      }));
  }, [posts]);

  const profileName = getProfileName(profile);

  return (
    <section className="profile-photos-smooth w-full">
      <style>{`
        @media (max-width: 720px) {
          .profile-photos-smooth > div {
            border-radius: 0 !important;
            border-left: 0 !important;
            border-right: 0 !important;
            box-shadow: none !important;
            background: #111318 !important;
          }

          .profile-photos-header {
            padding: 16px 14px !important;
          }

          .profile-photos-body {
            display: block !important;
            padding: 0 !important;
          }

          .profile-photos-sidebar {
            display: none !important;
          }

          .profile-photos-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 1px !important;
          }

          .profile-photo-tile {
            border-radius: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .profile-photo-empty {
            border-radius: 0 !important;
            border-left: 0 !important;
            border-right: 0 !important;
          }
        }
      `}</style>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#202223] via-[#17191d] to-[#111318] shadow-2xl shadow-black/30">
        <div className="profile-photos-header border-b border-white/10 bg-white/[0.025] px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-purple-200/80">
                Profile media
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                Photos
              </h2>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Photos posted by {profileName} appear here automatically from
                dashboard and profile posts.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-purple-500/15 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-purple-100/80">
                Posted photos
              </p>
              <p className="mt-1 text-2xl font-black text-white">
                {postedPhotos.length}
              </p>
            </div>
          </div>
        </div>

        <div className="profile-photos-body grid gap-4 p-4 md:grid-cols-[240px_1fr] md:p-5">
          <aside className="profile-photos-sidebar rounded-2xl border border-white/10 bg-black/15 p-4">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Posted
                </p>
                <p className="mt-1 text-3xl font-black text-white">
                  {postedPhotos.length}
                </p>
              </div>

              <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4">
                <p className="text-sm font-black text-purple-100">
                  Auto photo album
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-purple-100/70">
                  Any post with an image is pulled into Posted Photos
                  automatically.
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-xs font-semibold leading-5 text-slate-500">
              Saved Photos will be added later as a special feature.
            </p>
          </aside>

          <main className="min-w-0">
            {postedPhotos.length === 0 ? (
              <div className="profile-photo-empty grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
                <div>
                  <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-purple-500/15 text-2xl">
                    📷
                  </div>
                  <h3 className="text-xl font-black text-white">
                    No posted photos yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
                    Photos shared in dashboard or profile posts will
                    automatically appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="profile-photos-grid grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 xl:grid-cols-4">
                {postedPhotos.map((photo) => (
                  <article
                    key={photo.id}
                    className="profile-photo-tile group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg shadow-black/15"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(photo)}
                      className="absolute inset-0 z-10 cursor-zoom-in"
                      aria-label="Open photo"
                    />

                    <img
                      src={photo.url}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 transition group-hover:opacity-100" />

                    <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between gap-2 opacity-0 transition group-hover:opacity-100">
                      <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur">
                        {formatPhotoDate(photo.createdAt)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-[2147483646] grid place-items-center bg-black/82 p-3 backdrop-blur-md"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#111318] shadow-2xl shadow-black"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-black text-white">Posted photo</p>
                <p className="text-xs font-semibold text-slate-500">
                  {formatPhotoDate(selectedPhoto.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-xl font-black text-white transition hover:bg-white/[0.12]"
                aria-label="Close photo viewer"
              >
                ×
              </button>
            </div>

            <div className="grid max-h-[82vh] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid min-h-[360px] place-items-center bg-black">
                <img
                  src={selectedPhoto.url}
                  alt=""
                  className="max-h-[78vh] w-full object-contain"
                />
              </div>

              <aside className="border-t border-white/10 p-4 lg:border-l lg:border-t-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Details
                </p>

                {selectedPhoto.caption ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-200">
                    {selectedPhoto.caption}
                  </p>
                ) : (
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                    No caption available for this photo.
                  </p>
                )}

                <div className="mt-5 grid gap-2">
                  <a
                    href={selectedPhoto.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-white/[0.10]"
                  >
                    Open original image
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
