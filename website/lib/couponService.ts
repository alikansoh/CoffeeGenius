import Coupon, { CouponType, ICoupon } from "@/models/Coupon";
import dbConnect from "./dbConnect";

export interface CartItemLike {
  id: string;
  name: string;
  price: number;
  quantity: number;
  productType?: "coffee" | "equipment";
  /** Parent product id — e.g. the Coffee document's _id (for coffee, item.id is the variant's _id) */
  productId?: string;
  /** Same as item.id for coffee variants; kept explicit for clarity at call sites */
  variantId?: string;
}

/**
 * Coupon product targets are stored as plain ids for backwards compatibility
 * ("<coffeeId>" == whole coffee, every variant) or prefixed to target a
 * specific variant ("variant:<variantId>").
 */
export function matchesTargetIds(targetIds: string[], item: CartItemLike): boolean {
  return targetIds.some((target) => {
    if (target.startsWith("variant:")) {
      const variantId = target.slice("variant:".length);
      return variantId === String(item.variantId ?? item.id);
    }
    const coffeeTarget = target.startsWith("coffee:")
      ? target.slice("coffee:".length)
      : target;
    return coffeeTarget === String(item.productId ?? item.id);
  });
}

export interface AppliedCouponResult {
  valid: boolean;
  couponId?: string;
  code?: string;
  name: string;
  type: CouponType;
  discountAmount: number;
  originalTotal: number;
  finalTotal: number;
  message?: string;
  appliedItems?: Array<{ id: string; name: string; discount: number }>;
}

function isCouponApplicableToItem(
  coupon: ICoupon,
  item: CartItemLike
): boolean {
  if (coupon.appliesTo === "all") return true;
  if (coupon.appliesTo === "coffee") return item.productType === "coffee";
  if (coupon.appliesTo === "equipment") return item.productType === "equipment";
  if (coupon.appliesTo === "specific_products") {
    return matchesTargetIds(coupon.productIds?.map(String) || [], item);
  }
  return true;
}

function flattenItemsByPrice(
  items: CartItemLike[]
): Array<{ id: string; name: string; price: number }> {
  const units: Array<{ id: string; name: string; price: number }> = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      units.push({ id: item.id, name: item.name, price: item.price });
    }
  }
  // Cheapest first — discounts always apply to cheapest units
  return units.sort((a, b) => a.price - b.price);
}

function groupDiscountById(
  items: Array<{ id: string; name: string; price: number }>
): Array<{ id: string; name: string; discount: number }> {
  const map = new Map<string, { name: string; discount: number }>();
  for (const item of items) {
    const existing = map.get(item.id);
    if (existing) {
      existing.discount += item.price;
    } else {
      map.set(item.id, { name: item.name, discount: item.price });
    }
  }
  return Array.from(map.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    discount: Number(data.discount.toFixed(2)),
  }));
}

export function calculateDiscount(
  items: CartItemLike[],
  coupon: ICoupon
): AppliedCouponResult {
  const originalTotal = items.reduce(
    (sum, it) => sum + it.price * it.quantity,
    0
  );
  let discount = 0;
  const appliedItems: Array<{ id: string; name: string; discount: number }> = [];

  if (coupon.minimumOrderAmount && originalTotal < coupon.minimumOrderAmount) {
    return {
      valid: false,
      couponId: coupon._id.toString(),
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      discountAmount: 0,
      originalTotal,
      finalTotal: originalTotal,
      message: `Minimum order amount is £${coupon.minimumOrderAmount.toFixed(2)}`,
    };
  }

  const applicableItems = items.filter((it) =>
    isCouponApplicableToItem(coupon, it)
  );

  switch (coupon.type) {
    case "NTH_ITEM": {
      const nth = coupon.nthItem?.nth || 1;
      const percentOff = (coupon.nthItem?.percentOff || 0) / 100;
      const units = flattenItemsByPrice(applicableItems);

      // Discount the CHEAPEST unit in each nth group
      const discountedUnits: Array<{ id: string; name: string; price: number }> = [];
      for (let i = 0; i < units.length; i += nth) {
        const unit = units[i];
        discount += unit.price * percentOff;
        discountedUnits.push(unit);
      }

      if (discount > 0) {
        appliedItems.push(...groupDiscountById(discountedUnits));
      }
      break;
    }

    case "SPEND_THRESHOLD": {
      const threshold = coupon.spendThreshold?.threshold || 0;
      const percentOff = (coupon.spendThreshold?.percentOff || 0) / 100;
      if (originalTotal >= threshold) {
        discount = originalTotal * percentOff;
      }
      break;
    }

    case "BUY_X_GET_Y_FREE": {
      const x = coupon.buyXGetY?.x || 1;
      const y = coupon.buyXGetY?.y || 1;
      const targetIds = coupon.buyXGetY?.productIds?.map(String) || [];

      const eligibleItems =
        targetIds.length > 0
          ? applicableItems.filter((it) => matchesTargetIds(targetIds, it))
          : applicableItems;

      if (eligibleItems.length === 0) break;

      const units = flattenItemsByPrice(eligibleItems);
      const bundleSize = x + y;
      const freeUnits: Array<{ id: string; name: string; price: number }> = [];

      for (let start = 0; start < units.length; start += bundleSize) {
        const bundle = units.slice(start, start + bundleSize);
        if (bundle.length <= x) break;

        // Pay for the X most expensive (end of bundle), get the Y cheapest free (start)
        const bundleFreeUnits = bundle.slice(0, Math.min(y, bundle.length - x));
        freeUnits.push(...bundleFreeUnits);
      }

      discount = freeUnits.reduce((sum, unit) => sum + unit.price, 0);

      if (discount > 0) {
        appliedItems.push(...groupDiscountById(freeUnits));
      }
      break;
    }

    case "PERCENT_OFF_PRODUCT": {
      const targetIds = coupon.productDiscount?.productIds?.map(String) || [];
      const percentOff = (coupon.productDiscount?.percentOff || 0) / 100;

      const eligibleItems = applicableItems.filter((it) =>
        matchesTargetIds(targetIds, it)
      );

      const units = flattenItemsByPrice(eligibleItems);
      const discountedUnits = units.map((unit) => ({
        ...unit,
        price: unit.price * percentOff,
      }));

      discount = discountedUnits.reduce((sum, unit) => sum + unit.price, 0);

      if (discount > 0) {
        appliedItems.push(...groupDiscountById(discountedUnits));
      }
      break;
    }
  }

  discount = Math.min(discount, originalTotal);
  const finalTotal = Math.max(0, originalTotal - discount);

  return {
    valid: true,
    couponId: coupon._id.toString(),
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountAmount: Number(discount.toFixed(2)),
    originalTotal,
    finalTotal,
    message:
      discount > 0
        ? `Discount applied: £${discount.toFixed(2)}`
        : "Coupon conditions not met",
    appliedItems,
  };
}

export async function findActiveCoupon(code: string): Promise<ICoupon | null> {
  await dbConnect();
  const now = new Date();

  const query: Record<string, unknown> = {
    code: code.toUpperCase().trim(),
    isActive: true,
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] },
    ],
  };

  const coupon = await Coupon.findOne(query).lean();
  return coupon as ICoupon | null;
}

export async function validateAndApplyCoupon(
  items: CartItemLike[],
  code: string,
  email?: string
): Promise<AppliedCouponResult | null> {
  const coupon = await findActiveCoupon(code);
  if (!coupon) return null;

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return {
      valid: false,
      couponId: coupon._id.toString(),
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      discountAmount: 0,
      originalTotal: items.reduce((sum, it) => sum + it.price * it.quantity, 0),
      finalTotal: items.reduce((sum, it) => sum + it.price * it.quantity, 0),
      message: "Coupon usage limit reached",
    };
  }

  if (coupon.maxUsagePerUser && email) {
    const normalizedEmail = email.toLowerCase().trim();
    const userUsageCount = (coupon.usageRecords || []).filter(
      (record) => record.email === normalizedEmail
    ).length;

    if (userUsageCount >= coupon.maxUsagePerUser) {
      return {
        valid: false,
        couponId: coupon._id.toString(),
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        discountAmount: 0,
        originalTotal: items.reduce((sum, it) => sum + it.price * it.quantity, 0),
        finalTotal: items.reduce((sum, it) => sum + it.price * it.quantity, 0),
        message: `This coupon can only be used ${coupon.maxUsagePerUser} time(s) per email`,
      };
    }
  }

  return calculateDiscount(items, coupon);
}

export async function incrementCouponUsage(
  couponId: string,
  email?: string,
  orderId?: string
): Promise<void> {
  await dbConnect();

  const update: Record<string, unknown> = { $inc: { usageCount: 1 } };

  if (email) {
    update.$push = {
      usageRecords: {
        email: email.toLowerCase().trim(),
        orderId: orderId || undefined,
        usedAt: new Date(),
      },
    };
  }

  await Coupon.findByIdAndUpdate(couponId, update);
}

/**
 * Finds the active "Subscription Intro Offer" coupon (if any) that applies to a given
 * coffee/variant. These are always automatic — no code, never entered at checkout — so
 * this is a simple scope + active-window lookup, not the cart-based calculateDiscount path.
 */
export async function findActiveSubscriptionIntroCoupon(
  coffeeId: string,
  variantId: string
): Promise<ICoupon | null> {
  await dbConnect();
  const now = new Date();

  const coupons = await Coupon.find({
    type: "SUBSCRIPTION_INTRO",
    isActive: true,
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] },
    ],
  }).lean();

  const match = coupons.find((coupon) => {
    if (coupon.appliesTo === "all" || coupon.appliesTo === "coffee") return true;
    if (coupon.appliesTo === "specific_products") {
      return matchesTargetIds(coupon.productIds?.map(String) || [], {
        id: variantId,
        name: "",
        price: 0,
        quantity: 1,
        productId: coffeeId,
        variantId,
      });
    }
    return false;
  });

  return (match as ICoupon | undefined) || null;
}
