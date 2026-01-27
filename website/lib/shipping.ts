import { ISettings } from '@/models/Settings';

// Compute shipping in pence given subtotal (in pence) and settings
export function computeShippingPence(subtotalPence: number, settings: { deliveryPricePence: number; freeDeliveryThresholdPence: number; freeDeliveryEnabled: boolean }) {
  if (!settings) return 0;
  const { deliveryPricePence = 0, freeDeliveryThresholdPence = 0, freeDeliveryEnabled = true } = settings;
  if (freeDeliveryEnabled && subtotalPence >= (freeDeliveryThresholdPence ?? 0)) return 0;
  return deliveryPricePence ?? 0;
}