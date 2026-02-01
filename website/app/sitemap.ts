import { MetadataRoute } from 'next';
import { getPosts } from '@/lib/posts';
import { getCoffees } from '@/lib/coffee';
import { getEquipment } from '@/lib/equipment';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://coffeegenius.co.uk';

/**
 * Helper to safely parse date from optional string
 * Returns current date if parsing fails or value is undefined
 */
function safeDate(dateString?: string): Date {
  if (!dateString) return new Date();
  
  try {
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return new Date();
    }
    return date;
  } catch {
    return new Date();
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, coffees, equipment] = await Promise.all([
    getPosts(200),
    getCoffees(),
    getEquipment(200),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/coffee`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/equipment`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/classes`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/wholesale`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  // ✅ Blog posts - using helper function
  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: safeDate(post.updatedAt || post.createdAt || post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // ✅ Coffee products - using helper function
  const coffeePages: MetadataRoute.Sitemap = coffees.map((coffee) => ({
    url: `${SITE_URL}/coffee/${coffee.slug || coffee._id}`,
    lastModified: safeDate(coffee.updatedAt || coffee.createdAt),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // ✅ Equipment products - using helper function
  const equipmentPages: MetadataRoute.Sitemap = equipment.map((item) => ({
    url: `${SITE_URL}/equipment/${item.slug || item._id}`,
    lastModified: safeDate(item.updatedAt || item.createdAt),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...blogPages,
    ...coffeePages,
    ...equipmentPages,
  ];
}