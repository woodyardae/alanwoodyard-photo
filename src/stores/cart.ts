import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';
import { clearCheckoutNonce, readStoredCartItems } from '../lib/checkout-recovery';

/** Matches the stored-cart reader, which drops quantities outside 1..10. */
export const CART_MAX_QUANTITY = 10;

export type ProviderId = 'prodigi' | 'printful' | 'printify' | 'gelato' | 'gooten';

export interface CartItem {
  id: string;
  artworkId: string;
  artworkTitle: string;
  variantTitle: string;
  sku: string;
  provider: ProviderId;
  packagingType: 'rigid_tube' | 'flat_crate' | 'corrugated_box' | 'poly_mailer';
  price: number;
  quantity: number;
  imageSrc: string;
  consolidationAlternative?: {
    provider: ProviderId;
    sku: string;
    variantTitle: string;
    price: number;
    packagingType: 'rigid_tube' | 'flat_crate' | 'corrugated_box' | 'poly_mailer';
    estimatedFreightSaved: number;
  };
}

export interface PackageGroup {
  provider: ProviderId;
  providerName: string;
  packagingDescription: string;
  isInsuredComplimentary: boolean;
  estimatedShipping: number;
  items: CartItem[];
}

export const $cartItems = persistentAtom<CartItem[]>('awp_cart_items', [], {
  encode: JSON.stringify,
  decode: (raw) => readStoredCartItems(raw),
});

export const $isCartOpen = atom<boolean>(false);

export const $cartCount = computed($cartItems, (items) =>
  items.reduce((total, item) => total + item.quantity, 0)
);

export const $cartSubtotal = computed($cartItems, (items) =>
  items.reduce((total, item) => total + item.price * item.quantity, 0)
);

const PROVIDER_METADATA: Record<ProviderId, { name: string; packaging: string; defaultFreight: number; freeThreshold: number }> = {
  prodigi: {
    name: 'Prodigi Fine-Art Lab',
    packaging: 'Rigid Heavy-Duty Tube / Wooden Art Crate',
    defaultFreight: 0,
    freeThreshold: 0,
  },
  printify: {
    name: 'Printify Decor & Goods Hub',
    packaging: 'Padded Carton / Protective Mailer',
    defaultFreight: 6.50,
    freeThreshold: 75,
  },
  printful: {
    name: 'Printful Production Facility',
    packaging: 'Reinforced Box / Corner Protectors',
    defaultFreight: 12.00,
    freeThreshold: 150,
  },
  gelato: {
    name: 'Gelato Print Facility',
    packaging: 'Locally Produced Postal Carton',
    defaultFreight: 7.00,
    freeThreshold: 75,
  },
  gooten: {
    name: 'Gooten Optical Specialty Lab',
    packaging: 'Foam-Lined Presentation Box',
    defaultFreight: 8.50,
    freeThreshold: 100,
  },
};

export const $fulfillmentPackages = computed($cartItems, (items): PackageGroup[] => {
  const groups: Record<ProviderId, CartItem[]> = {
    prodigi: [],
    printful: [],
    printify: [],
    gelato: [],
    gooten: [],
  };

  for (const item of items) {
    if (groups[item.provider]) {
      groups[item.provider].push(item);
    }
  }

  const result: PackageGroup[] = [];
  for (const [key, groupItems] of Object.entries(groups) as [ProviderId, CartItem[]][]) {
    if (groupItems.length > 0) {
      const meta = PROVIDER_METADATA[key];
      const groupSubtotal = groupItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
      const isFree = key === 'prodigi' || groupSubtotal >= meta.freeThreshold;

      result.push({
        provider: key,
        providerName: meta.name,
        packagingDescription: meta.packaging,
        isInsuredComplimentary: isFree,
        estimatedShipping: isFree ? 0 : meta.defaultFreight,
        items: groupItems,
      });
    }
  }

  return result;
});

export const $totalShipping = computed($fulfillmentPackages, (packages) =>
  packages.reduce((sum, pkg) => sum + pkg.estimatedShipping, 0)
);

function invalidateCachedCheckoutAttempt(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    clearCheckoutNonce(sessionStorage);
  } catch {
    // Private mode can throw on storage access. The cart write still stands.
  }
}

export function addItem(newItem: CartItem) {
  const current = $cartItems.get();
  const existingIdx = current.findIndex((i) => i.id === newItem.id);

  if (existingIdx > -1) {
    const existing = current[existingIdx];
    const quantity = Math.min(CART_MAX_QUANTITY, existing.quantity + newItem.quantity);
    if (quantity === existing.quantity) {
      $isCartOpen.set(true);
      return;
    }
    $cartItems.set(
      current.map((item, index) => (index === existingIdx ? { ...item, quantity } : item))
    );
  } else {
    const quantity = Math.min(CART_MAX_QUANTITY, newItem.quantity);
    $cartItems.set([
      ...current,
      quantity === newItem.quantity ? newItem : { ...newItem, quantity },
    ]);
  }
  invalidateCachedCheckoutAttempt();
  $isCartOpen.set(true);
}

export function removeItem(id: string) {
  const current = $cartItems.get();
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) return;
  $cartItems.set(next);
  invalidateCachedCheckoutAttempt();
}

/**
 * Set a line quantity. Values at or below 0 remove the line.
 * Values above the cart maximum clamp to that maximum.
 */
export function updateItemQuantity(keyOrId: string, quantity: number) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return;
  const current = $cartItems.get();
  const index = current.findIndex((item) => item.id === keyOrId);
  if (index < 0) return;
  const nextQuantity = Math.trunc(quantity);
  if (nextQuantity <= 0) {
    removeItem(keyOrId);
    return;
  }
  const clamped = Math.min(CART_MAX_QUANTITY, nextQuantity);
  if (current[index].quantity === clamped) return;
  $cartItems.set(
    current.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: clamped } : item))
  );
  invalidateCachedCheckoutAttempt();
}

export function clearCart() {
  if ($cartItems.get().length > 0) {
    $cartItems.set([]);
  }
  invalidateCachedCheckoutAttempt();
}

export function consolidateItem(targetItemId: string) {
  const current = $cartItems.get();
  const item = current.find((i) => i.id === targetItemId);
  if (!item || !item.consolidationAlternative) return;

  const alt = item.consolidationAlternative;
  const replaced: CartItem = {
    ...item,
    id: `${item.artworkId}-${alt.sku}`,
    variantTitle: alt.variantTitle,
    sku: alt.sku,
    provider: alt.provider,
    packagingType: alt.packagingType,
    price: alt.price,
    consolidationAlternative: undefined,
  };

  const updated = current.filter((i) => i.id !== targetItemId);
  const existingAltIdx = updated.findIndex((i) => i.id === replaced.id);

  if (existingAltIdx > -1) {
    updated[existingAltIdx].quantity += item.quantity;
    $cartItems.set(updated);
  } else {
    $cartItems.set([...updated, replaced]);
  }
  invalidateCachedCheckoutAttempt();
}