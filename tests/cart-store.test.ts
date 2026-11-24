import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCheckoutIdempotencyKey, type CheckoutCartItem } from '../src/lib/create-checkout-session';
import { getOrCreateCheckoutNonce, type CheckoutNonceStorage } from '../src/lib/checkout-recovery';
import {
  $cartItems,
  addItem,
  clearCart,
  removeItem,
  updateItemQuantity,
  type CartItem,
} from '../src/stores/cart';

function sample(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'piece-1',
    artworkId: 'norderney-62',
    artworkTitle: 'Norderney 62',
    variantTitle: '16x24 Fine-Art Print',
    sku: 'prodigi:rag-16x24',
    provider: 'prodigi',
    packagingType: 'rigid_tube',
    price: 195,
    quantity: 1,
    imageSrc: '/prints/norderney-62.jpg',
    ...overrides,
  };
}

function asCheckout(items: readonly CartItem[]): CheckoutCartItem[] {
  return items.map((item) => ({
    id: item.id,
    sku: item.sku,
    artworkId: item.artworkId,
    artworkTitle: item.artworkTitle,
    variantTitle: item.variantTitle,
    price: item.price,
    quantity: item.quantity,
    provider: item.provider,
    packagingType: item.packagingType,
    imageSrc: item.imageSrc,
  }));
}

function fingerprintOf(items: readonly CartItem[]) {
  return items.map((item) => ({
    id: item.id,
    sku: item.sku,
    quantity: item.quantity,
    price: item.price,
  }));
}

function installSessionStorage(): CheckoutNonceStorage {
  const backing = new Map<string, string>();
  const storage: CheckoutNonceStorage = {
    getItem: (key) => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key, value) => {
      backing.set(key, String(value));
    },
    removeItem: (key) => {
      backing.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

describe('cart quantity', { concurrency: 1 }, () => {
  beforeEach(() => {
    $cartItems.set([]);
    installSessionStorage();
  });

  afterEach(() => {
    $cartItems.set([]);
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  test('updateItemQuantity increments, decrements, clamps, and removes at zero', () => {
    addItem(sample({ quantity: 2 }));
    assert.equal($cartItems.get()[0].quantity, 2);

    updateItemQuantity('piece-1', 3);
    assert.equal($cartItems.get()[0].quantity, 3);

    updateItemQuantity('piece-1', 2.9);
    assert.equal($cartItems.get()[0].quantity, 2);

    updateItemQuantity('piece-1', 1);
    assert.equal($cartItems.get()[0].quantity, 1);

    updateItemQuantity('piece-1', 0);
    assert.deepEqual($cartItems.get(), []);

    addItem(sample({ quantity: 1 }));
    updateItemQuantity('piece-1', -1);
    assert.deepEqual($cartItems.get(), []);

    addItem(sample({ quantity: 1 }));
    updateItemQuantity('missing', 4);
    assert.equal($cartItems.get()[0].quantity, 1);

    updateItemQuantity('piece-1', 99);
    assert.equal($cartItems.get()[0].quantity, 10);
    updateItemQuantity('piece-1', 10);
    assert.equal($cartItems.get().length, 1);
  });

  test('changing cart quantity from 2 to 1 produces a distinct Stripe idempotency key', async () => {
    addItem(sample({ quantity: 2 }));
    const nonce = 'attempt-stable';
    const context = {
      customerEmail: 'collector@example.com',
      crops: [{ id: 'piece-1', crop: '2-3', ratio: '2:3' }],
      expiresAt: 1_800_000_000,
    };
    const keyAtTwo = await computeCheckoutIdempotencyKey(asCheckout($cartItems.get()), nonce, context);

    updateItemQuantity('piece-1', 1);

    assert.equal($cartItems.get()[0].quantity, 1);
    const keyAtOne = await computeCheckoutIdempotencyKey(asCheckout($cartItems.get()), nonce, context);
    assert.notEqual(keyAtTwo, keyAtOne);
    assert.match(keyAtTwo, /^awp_checkout_[0-9a-f]{32}$/);
    assert.match(keyAtOne, /^awp_checkout_[0-9a-f]{32}$/);
  });

  test('cart edits clear the cached checkout nonce', () => {
    const storage = sessionStorage;
    addItem(sample({ quantity: 2 }));
    const before = fingerprintOf($cartItems.get());
    const first = getOrCreateCheckoutNonce(before, storage);

    updateItemQuantity('piece-1', 1);
    const afterQuantityEdit = getOrCreateCheckoutNonce(before, storage);
    assert.notEqual(afterQuantityEdit, first);

    const current = fingerprintOf($cartItems.get());
    const seeded = getOrCreateCheckoutNonce(current, storage);
    addItem(sample({ id: 'piece-2', artworkTitle: 'Second' }));
    assert.notEqual(getOrCreateCheckoutNonce(current, storage), seeded);

    const afterAdd = fingerprintOf($cartItems.get().filter((item) => item.id === 'piece-1'));
    const seededRemoval = getOrCreateCheckoutNonce(afterAdd, storage);
    removeItem('piece-2');
    assert.notEqual(getOrCreateCheckoutNonce(afterAdd, storage), seededRemoval);

    addItem(sample({ id: 'piece-2', artworkTitle: 'Second' }));
    const beforeClear = fingerprintOf($cartItems.get());
    const seededClear = getOrCreateCheckoutNonce(beforeClear, storage);
    clearCart();
    assert.deepEqual($cartItems.get(), []);
    assert.notEqual(getOrCreateCheckoutNonce(beforeClear, storage), seededClear);

    addItem(sample({ quantity: 1 }));
    const stable = fingerprintOf($cartItems.get());
    const unchanged = getOrCreateCheckoutNonce(stable, storage);
    updateItemQuantity('piece-1', 1);
    removeItem('missing');
    assert.equal(getOrCreateCheckoutNonce(stable, storage), unchanged);
  });
});
