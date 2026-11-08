import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';

export type ProviderId = 'prodigi' | 'printful' | 'printify' | 'gooten';

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
  decode: JSON.parse,
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

export function removeItem(id: string) {
  $cartItems.set($cartItems.get().filter((i) => i.id !== id));
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
}