import { persistentAtom } from '@nanostores/persistent';
import { computed } from 'nanostores';

export type ProviderId = 'prodigi' | 'printful' | 'printify';

export interface CartItem {
  id: string;              // unique cart line id (e.g. a-dock-mono-16x24-rag)
  artworkId: string;       // slug (e.g. a-dock-mono)
  artworkTitle: string;    // title (e.g. A Dock Mono)
  variantTitle: string;    // e.g. 16x24" Hahnemühle Photo Rag
  sku: string;
  provider: ProviderId;
  packagingType: 'rigid_tube' | 'flat_crate' | 'corrugated_box' | 'poly_mailer';
  price: number;           // in USD (e.g. 185)
  quantity: number;
  imageSrc: string;
  // Alternate option from another lab for one-click consolidation
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

// 1. Persistent Cart Item Array
export const $cartItems = persistentAtom<CartItem[]>('awp_cart_items', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

// 2. Cart Open/Close Drawer State
export const $isCartOpen = persistentAtom<boolean>('awp_cart_open', false, {
  encode: JSON.stringify,
  decode: JSON.parse,
});

// 3. Computed Helpers
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
    defaultFreight: 0, // Complimentary domestic art freight on fine-art paper/frames
    freeThreshold: 0,
  },
  printful: {
    name: 'Printful Production Facility',
    packaging: 'Reinforced Corrugated Box / Corner Guards',
    defaultFreight: 14.50,
    freeThreshold: 200,
  },
  printify: {
    name: 'Printify Decor Hub',
    packaging: 'Flat-Pack Mailer / Heavy Carton',
    defaultFreight: 11.00,
    freeThreshold: 150,
  },
};

// 4. Computed Packages (Fulfillment Breakdown)
export const $fulfillmentPackages = computed($cartItems, (items): PackageGroup[] => {
  const groups: Record<ProviderId, CartItem[]> = {
    prodigi: [],
    printful: [],
    printify: [],
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

// 5. Total Shipping Calculation
export const $totalShipping = computed($fulfillmentPackages, (packages) =>
  packages.reduce((sum, pkg) => sum + pkg.estimatedShipping, 0)
);

// 6. Action: Add or Increment Item
export function addItem(newItem: CartItem) {
  const current = $cartItems.get();
  const existingIdx = current.findIndex((i) => i.id === newItem.id);

  if (existingIdx > -1) {
    const updated = [...current];
    updated[existingIdx].quantity += newItem.quantity;
    $cartItems.set(updated);
  } else {
    $cartItems.set([...current, newItem]);
  }
  $isCartOpen.set(true);
}

// 7. Action: Remove Item
export function removeItem(id: string) {
  $cartItems.set($cartItems.get().filter((i) => i.id !== id));
}

// 8. Action: Swap Item for Consolidation
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
}