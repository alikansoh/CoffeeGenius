// "use client";
// import Image from "next/image";
// import { ArrowRight } from "lucide-react";
// import { JSX, useEffect, useState } from "react";

// type Review = {
//   id?: string;
//   author_name?: string;
//   author_url?: string;
//   rating?: number;
//   text?: string;
//   relative_time_description?: string;
//   profile_photo_url?: string;
// };

// type ApiResponse = {
//   reviews?: Review[];
//   place_name?: string;
//   place_url?: string;
//   rating?: number;
//   user_ratings_total?: number;
//   fetched_at?: string;
//   cached_until?: string;
//   error?: string;
// };

// export default function GoogleReviews(): JSX.Element {
//   const [data, setData] = useState<ApiResponse | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     let mounted = true;

//     async function fetchReviews() {
//       try {
//         setLoading(true);
//         // const res = await fetch("/api/google-reviews");
//         const contentType = String(res.headers.get("content-type") ?? "").toLowerCase();
//         const text = await res.text();

//         if (!contentType.includes("application/json")) {
//           const snippet = text.slice(0, 1000);
//           throw new Error(
//             `Expected JSON response but got content-type="${contentType || "unknown"}". Response preview: ${snippet}${
//               text.length > snippet.length ? "..." : ""
//             }`
//           );
//         }

//         const json = JSON.parse(text) as ApiResponse;

//         if (!res.ok) {
//           throw new Error(json?.error || `HTTP ${res.status}`);
//         }

//         if (!mounted) return;
//         setData(json);
//       } catch (err: unknown) {
//         const msg = err instanceof Error ? err.message : String(err);
//         console.error("Failed to load reviews:", msg);
//         if (mounted) setError(msg || "Failed to load reviews");
//       } finally {
//         if (mounted) setLoading(false);
//       }
//     }

//     fetchReviews();
//     return () => {
//       mounted = false;
//     };
//   }, []);

//   // use place_url from API when available, otherwise fallback to place_id link (client env)
//   const placeId = process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID ?? "";
//   const fallbackPlaceLink = (p?: string) =>
//     p
//       ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p)}`
//       : "https://www.google.com/maps";
//   const placeLink = data?.place_url ?? fallbackPlaceLink(placeId);

//   function normalizePhotoUrl(url?: string): string | null {
//     if (!url) return null;
//     if (url.startsWith("//")) return `https:${url}`;
//     if (/^https?:\/\//i.test(url)) return url;
//     return `https://${url}`;
//   }

//   function StarRow({ rating, size = 18 }: { rating?: number; size?: number }) {
//     // SVG star path + clipped overlay for fractional fill
//     const starPath =
//       "M12 .587l3.668 7.431 8.2 1.192-5.934 5.788 1.402 8.174L12 18.896l-7.336 3.876 1.402-8.174L.132 9.21l8.2-1.192z";
//     const value =
//       typeof rating === "number" && Number.isFinite(rating)
//         ? Math.max(0, Math.min(5, rating))
//         : 0;

//     const stars = [];
//     for (let i = 0; i < 5; i++) {
//       const fill = Math.max(0, Math.min(1, value - i));
//       stars.push(
//         <svg
//           key={i}
//           width={size}
//           height={size}
//           viewBox="0 0 24 24"
//           fill="none"
//           xmlns="http://www.w3.org/2000/svg"
//           className="inline-block"
//         >
//           <defs>
//             <clipPath id={`star-clip-${i}-${rating}`}>
//               <rect x="0" y="0" width={`${fill * 100}%`} height="100%" />
//             </clipPath>
//           </defs>
//           <path d={starPath} fill="#E2E8F0" />
//           <path
//             d={starPath}
//             fill="#FBBF24"
//             clipPath={`url(#star-clip-${i}-${rating})`}
//           />
//         </svg>
//       );
//     }
//     return <div className="flex items-center gap-0.5">{stars}</div>;
//   }

//   return (
//     <section className="py-16 px-4 bg-gradient-to-b from-slate-50 via-white to-slate-50">
//       <div className="max-w-7xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-14 space-y-4">
//           <div className="inline-block">
//             <p className="text-slate-500 uppercase tracking-[0.2em] text-xs font-bold px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm">
//               Customer Reviews
//             </p>
//           </div>
//           <h2 className="text-4xl lg:text-5xl font-serif text-slate-900 leading-tight font-bold max-w-4xl mx-auto">
//             What Our Guests Say
//           </h2>
//           <div className="flex items-center justify-center gap-2 pt-2">
//             <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse"></div>
//             <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
//             <div className="w-2 h-2 bg-slate-800 rounded-full"></div>
//             <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
//             <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-pulse"></div>
//           </div>
//           <p className="text-slate-600 text-base max-w-2xl mx-auto leading-relaxed">
//             Authentic feedback from our valued customers on Google Reviews
//           </p>
//         </div>

//         {/* Summary */}
//         <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 lg:p-10 mb-12 hover:border-slate-300 hover:shadow-xl transition-all duration-500">
//           {/* Big rating pill */}
//           <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-6">
//             <div className="flex items-center gap-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-full px-6 py-3 border border-slate-200">
//               <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
//                 {data?.rating ? `${data.rating >= 4.5 ? "Excellent" : "Great"}` : "Rated"}
//               </span>
//               <div className="text-4xl font-bold text-slate-900">
//                 {data?.rating ? data.rating.toFixed(1) : "—"}
//               </div>
//               <StarRow rating={data?.rating} size={24} />
//             </div>
//             <div className="text-center sm:text-left">
//               <p className="text-2xl font-semibold text-slate-900">
//                 {typeof data?.user_ratings_total === "number"
//                   ? `${data.user_ratings_total.toLocaleString()} reviews`
//                   : "No reviews"}
//               </p>
//             </div>
//           </div>

//           {/* Stars + summary text */}
//           <div className="text-center border-t border-slate-200 pt-6">
//             <p className="text-lg font-medium text-slate-900 mb-2">
//               <span className="text-slate-700">
//                 {data?.rating ? data.rating.toFixed(1) : "—"}
//               </span>{" "}
//               / 5
//             </p>
//             <p className="text-sm text-slate-600 mb-3">
//               {data?.place_name
//                 ? `Latest feedback for ${data.place_name}`
//                 : "Customer feedback from Google Reviews"}
//             </p>
//             <p className="text-xs text-slate-500">
//               We showcase a selection of recent reviews. Click below to explore all reviews on Google Maps.
//             </p>
//           </div>

//           {/* CTA */}
//           <div className="mt-6 text-center">
//             <a
//               href={placeLink}
//               target="_blank"
//               rel="noopener noreferrer"
//               className="inline-flex items-center gap-2 px-7 py-3.5 bg-slate-900 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-1 group border-2 border-slate-900 hover:border-slate-800"
//             >
//               View on Google
//               <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
//             </a>
//           </div>
//         </div>

//         {/* Reviews grid */}
//         {loading ? (
//           <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
//             {Array.from({ length: 3 }).map((_, i) => (
//               <div
//                 key={i}
//                 className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse"
//               >
//                 <div className="flex items-start gap-3 mb-4">
//                   <div className="w-12 h-12 rounded-full bg-slate-100" />
//                   <div className="flex-1">
//                     <div className="h-4 bg-slate-100 rounded w-24 mb-2" />
//                     <div className="h-3 bg-slate-100 rounded w-16" />
//                   </div>
//                 </div>
//                 <div className="h-4 bg-slate-100 rounded w-20 mb-3" />
//                 <div className="space-y-2">
//                   <div className="h-3 bg-slate-100 rounded" />
//                   <div className="h-3 bg-slate-100 rounded w-5/6" />
//                 </div>
//               </div>
//             ))}
//           </div>
//         ) : error ? (
//           <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
//             <p className="text-red-800 font-semibold mb-2">Error: {error}</p>
//             <p className="text-sm text-red-600">
//               Check your API route at /api/google-reviews and server logs.
//             </p>
//           </div>
//         ) : !data?.reviews || data.reviews.length === 0 ? (
//           <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center">
//             <p className="text-slate-600 text-lg">No reviews found.</p>
//           </div>
//         ) : (
//           <>
//             <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
//               {data.reviews.map((r, i) => {
//                 const photoUrl = normalizePhotoUrl(r.profile_photo_url ?? undefined);

//                 return (
//                   <div
//                     key={r.id ?? i}
//                     className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-xl hover:border-slate-300 transition-all duration-500 flex flex-col gap-4 group"
//                   >
//                     {/* Header: avatar + name + time */}
//                     <div className="flex items-start gap-3">
//                       {photoUrl ? (
//                         <Image
//                           src={photoUrl}
//                           alt={r.author_name ?? "Reviewer"}
//                           width={48}
//                           height={48}
//                           className="rounded-full object-cover ring-2 ring-slate-100"
//                         />
//                       ) : (
//                         <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-semibold text-lg shadow-md">
//                           {r.author_name?.charAt(0) ?? "?"}
//                         </div>
//                       )}
//                       <div className="flex-1 min-w-0">
//                         <p className="font-semibold text-slate-900 truncate">
//                           {r.author_name ?? "Anonymous"}
//                         </p>
//                         {r.relative_time_description && (
//                           <p className="text-xs text-slate-500">
//                             {r.relative_time_description}
//                           </p>
//                         )}
//                       </div>
//                     </div>

//                     {/* Rating */}
//                     <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-2 border border-slate-100">
//                       <StarRow rating={r.rating} size={16} />
//                       <span className="text-sm font-semibold text-slate-900">
//                         {typeof r.rating === "number" ? r.rating.toFixed(1) : "—"}
//                       </span>
//                     </div>

//                     <p className="text-sm text-slate-700 leading-relaxed">
//                       {r.text ?? ""}
//                     </p>
//                   </div>
//                 );
//               })}
//             </div>

//             <div className="text-center">
//               <a
//                 href={placeLink}
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 group border-2 border-slate-900 hover:border-slate-800"
//               >
//                 See all reviews on Google
//                 <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
//               </a>
//             </div>
//           </>
//         )}
//       </div>
//     </section>
//   );
// }