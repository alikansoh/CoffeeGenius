import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import mongoose from "mongoose";

interface SearchItem {
  id: string;
  collection: string;
  title: string;
  subtitle: string;
  url: string;
}

/**
 * GET /api/search?q=...
 *
 * Searches multiple collections (best-effort) and returns grouped results.
 * - Attempts to query common collection names:
 *    coffees, products, equipment, classes, courses, posts, articles, blogs
 * - For each collection we search common fields: name, title, slug, description, summary, content
 * - Returns limited results grouped by collection with a normalized url for navigation.
 *
 * Notes:
 * - This is a pragmatic endpoint that tries a few collection names and fields.
 * - If your actual collection/model names differ, add them to the `CANDIDATES` array.
 */

const CANDIDATES = [
  { name: "coffees", label: "Coffee", urlPrefix: "/coffee" },
  { name: "products", label: "Products", urlPrefix: "/products" },
  { name: "equipment", label: "Equipment", urlPrefix: "/equipment" },
  { name: "classes", label: "Classes", urlPrefix: "/classes" },
  { name: "courses", label: "Classes", urlPrefix: "/classes" },
  { name: "posts", label: "Articles", urlPrefix: "/blog" },
  { name: "articles", label: "Articles", urlPrefix: "/blog" },
  { name: "blogs", label: "Articles", urlPrefix: "/blog" },
];

function makeRegex(q: string) {
  // Escape regex special characters
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function pickUrlPrefix(collName: string) {
  const cand = CANDIDATES.find((c) => c.name === collName);
  return cand ? cand.urlPrefix : `/${collName}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ groups: [] }, { status: 200 });
    }

    await dbConnect();

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database not connected");
    }
    const regex = makeRegex(q);
    const groups: Array<{ collection: string; label: string; items: SearchItem[] }> = [];

    // For each candidate collection try to query a handful of fields
    for (const cand of CANDIDATES) {
      try {
        // Check if the collection exists
        const exists = await db.listCollections({ name: cand.name }).toArray();
        if (!exists || exists.length === 0) continue;

        const col = db.collection(cand.name);

        // Build OR query across likely fields
        const orClauses = [
          { name: { $regex: regex } },
          { title: { $regex: regex } },
          { slug: { $regex: regex } },
          { description: { $regex: regex } },
          { summary: { $regex: regex } },
          { content: { $regex: regex } },
          { notes: { $regex: regex } },
        ];

        const docs = await col
          .find({ $or: orClauses }, { projection: { name: 1, title: 1, slug: 1, description: 1, summary: 1 } })
          .limit(6)
          .toArray();

        if (!docs || docs.length === 0) continue;

        const items: SearchItem[] = docs.map((d: Record<string, unknown>) => {
          const id = String(d._id);
          const title = (d.name as string) || (d.title as string) || ((d.slug as string) ? String(d.slug) : id);
          const subtitle = (d.description as string) || (d.summary as string) || "";
          const prefix = pickUrlPrefix(cand.name);
          const url = (d.slug as string) ? `${prefix}/${encodeURIComponent(String(d.slug))}` : `${prefix}/${id}`;
          return { id, collection: cand.name, title, subtitle, url };
        });

        groups.push({ collection: cand.name, label: cand.label, items });
      } catch (err) {
        // ignore collection-specific errors and continue
        // eslint-disable-next-line no-console
        console.warn("search: skip", cand.name, err);
        continue;
      }
    }

    return NextResponse.json(
      {
        groups: groups.map((g) => ({ collection: g.collection, label: g.label, items: g.items })),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("Search API error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ groups: [] }, { status: 500 });
  }
}