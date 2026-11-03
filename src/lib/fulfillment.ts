/**
 * src/lib/fulfillment.ts
 *
 * Multi-Provider Print-On-Demand (POD) Fulfillment Engine & Split-Cart Router
 * Supports the Top 5 professional print labs:
 * 1. Prodigi API v4.0 (Fine-art archival papers, Hahnemühle Photo Rag, acrylic float mounts)
 * 2. Printify API v1 (POST /v1/shops/{shop_id}/orders.json for framed posters & merch)
 * 3. Printful API v2 (POST /orders for apparel and wall art)
 * 4. Gelato API v2 (POST /v2/orders for international orders)
 * 5. Gooten API (Specialized home decor and acrylic blocks)
 *
 * Features:
 * - Split-cart multi-package shipping calculation logic to eliminate seller subsidization
 * - Deterministic SHA-256 external idempotency tokens
 * - Resilient error handling and reconciliation
 */

export type PodLab = 'prodigi' | 'printify' | 'printful' | 'gelato' | 'gooten';

export interface OrderRecipient {
  name: string;
  email: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string; // ISO 2-letter, e.g. "US", "CA", "GB"
}

export interface OrderItem {
  id: string;
  sku: string;
  artworkId: string;
  artworkTitle: string;
  substrate:
    | 'hahnemuhle-rag'
    | 'aluminum-panel'
    | 'acrylic-float'
    | 'framed-print'
    | 'stretched-canvas'
    | 'linen-art-cards'
    | 'desk-mat';
  size: string; // e.g. "12x18", "16x24", "24x36"
  quantity: number;
  unitPriceCents: number;
  lab: PodLab;
  supplierSku: string;
  supplierProductId?: string;
  supplierVariantId?: string;
  printAssetUrl: string;
}

export interface FulfillmentOrder {
  sessionId: string; // Stripe Checkout Session ID or unique checkout identifier
  orderNumber: string;
  recipient: OrderRecipient;
  items: OrderItem[];
  currency?: string;
}

export interface FulfillmentEnv {
  PRODIGI_API_KEY?: string;
  PRINTIFY_API_TOKEN?: string;
  PRINTIFY_SHOP_ID?: string;
  PRINTFUL_API_TOKEN?: string;
  PRINTFUL_STORE_ID?: string;
  GELATO_API_KEY?: string;
  GOOTEN_RECIPE_ID?: string;
  ALLOW_MOCK_DISPATCH?: string;
}

export interface ParcelShippingRate {
  lab: PodLab;
  providerName: string;
  packageType: string;
  itemCount: number;
  baseShippingCents: number;
  additionalItemsShippingCents: number;
  totalShippingCents: number;
  items: OrderItem[];
}

export interface SplitCartShippingResult {
  parcels: ParcelShippingRate[];
  totalShippingCents: number;
  isMultiVendor: boolean;
  vendorCount: number;
  logisticsSummary: string;
}

export interface DispatchedParcelResult {
  lab: PodLab;
  providerName: string;
  status: 'dispatched' | 'recovered_idempotent' | 'mocked' | 'failed';
  externalOrderId: string;
  labOrderId?: string;
  error?: string;
}

export interface OrderRoutingResult {
  success: boolean;
  orderNumber: string;
  totalParcels: number;
  parcels: DispatchedParcelResult[];
  errors: string[];
}

/**
 * Deterministic External Order ID with SHA-256 digest
 */
export async function generateExternalOrderId(sessionId: string, lab: PodLab): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`awp:${lab}:${sessionId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 20);

  if (lab === 'printify') return `awp_pfy_${hash}`;
  if (lab === 'printful') return `awp_pfl_${hash}`;
  if (lab === 'prodigi') return `awp_prd_${hash}`;
  if (lab === 'gelato') return `awp_glt_${hash}`;
  return `awp_gtn_${hash}`;
}

/**
 * Split-Cart Multi-Package Shipping Calculation
 *
 * Ensures multi-vendor orders calculate discrete parcel shipping costs.
 * Different labs ship from distinct international or domestic facilities with
 * specialized protective packaging (rigid fine-art tubes vs framed boxes vs acrylic crates).
 */
export function calculateSplitCartShipping(
  items: OrderItem[],
  destinationCountry = 'US'
): SplitCartShippingResult {
  const isDomestic = destinationCountry.toUpperCase() === 'US';

  // Group items by target POD lab
  const labGroups = new Map<PodLab, OrderItem[]>();
  for (const item of items) {
    const existing = labGroups.get(item.lab) || [];
    existing.push(item);
    labGroups.set(item.lab, existing);
  }

  const parcels: ParcelShippingRate[] = [];

  for (const [lab, groupItems] of labGroups.entries()) {
    const totalUnits = groupItems.reduce((acc, curr) => acc + curr.quantity, 0);
    const additionalUnits = Math.max(0, totalUnits - 1);

    let providerName = '';
    let packageType = '';
    let baseRate = 0;
    let addlRate = 0;

    switch (lab) {
      case 'prodigi':
        providerName = 'Prodigi Fine-Art Lab';
        packageType = 'Heavy-Duty Rigid Art Tube & Archival Crate';
        baseRate = isDomestic ? 1250 : 1950;
        addlRate = isDomestic ? 350 : 500;
        break;

      case 'printify':
        providerName = 'Printify Workshop';
        packageType = 'Corner-Protected Reinforced Flat-Pack';
        baseRate = isDomestic ? 750 : 1450;
        addlRate = isDomestic ? 250 : 400;
        break;

      case 'printful':
        providerName = 'Printful Fulfillment Center';
        packageType = 'Custom Corrugated Heavyweight Box';
        baseRate = isDomestic ? 850 : 1550;
        addlRate = isDomestic ? 300 : 450;
        break;

      case 'gelato':
        providerName = 'Gelato Global Print Facility';
        packageType = 'Locally Produced Heavy-Wall Postal Tube';
        baseRate = isDomestic ? 700 : 1150;
        addlRate = isDomestic ? 200 : 300;
        break;

      case 'gooten':
        providerName = 'Gooten Decor Facility';
        packageType = 'Shock-Absorbent Poly-Foam Acrylic Enclosure';
        baseRate = isDomestic ? 950 : 1650;
        addlRate = isDomestic ? 350 : 500;
        break;
    }

    const additionalItemsCost = additionalUnits * addlRate;
    const totalParcelCost = baseRate + additionalItemsCost;

    parcels.push({
      lab,
      providerName,
      packageType,
      itemCount: totalUnits,
      baseShippingCents: baseRate,
      additionalItemsShippingCents: additionalItemsCost,
      totalShippingCents: totalParcelCost,
      items: groupItems
    });
  }

  const totalShippingCents = parcels.reduce((sum, p) => sum + p.totalShippingCents, 0);
  const vendorCount = parcels.length;
  const isMultiVendor = vendorCount > 1;

  const logisticsSummary = isMultiVendor
    ? `Split-Shipment: Order routed across ${vendorCount} distinct specialized print facilities with discrete protective parcels.`
    : `Single-Parcel Shipment: Directly fulfilled from specialized ${parcels[0]?.providerName || 'lab'}.`;

  return {
    parcels,
    totalShippingCents,
    isMultiVendor,
    vendorCount,
    logisticsSummary
  };
}

/**
 * Lab 1: Prodigi API v4.0 Dispatch
 * Target: Fine-art giclée papers (Hahnemühle Photo Rag), acrylic float mounts
 */
async function dispatchProdigiOrder(
  externalId: string,
  order: FulfillmentOrder,
  items: OrderItem[],
  env: FulfillmentEnv
): Promise<DispatchedParcelResult> {
  const apiKey = env.PRODIGI_API_KEY;

  if (!apiKey || env.ALLOW_MOCK_DISPATCH === '1') {
    return {
      lab: 'prodigi',
      providerName: 'Prodigi Fine-Art Lab',
      status: 'mocked',
      externalOrderId: externalId,
      labOrderId: `prodigi_mock_${Date.now()}`
    };
  }

  const payload = {
    idempotencyKey: externalId,
    merchantReference: externalId,
    shippingMethod: 'Standard',
    recipient: {
      name: order.recipient.name,
      email: order.recipient.email,
      phoneNumber: order.recipient.phone || '',
      address: {
        line1: order.recipient.address1,
        line2: order.recipient.address2 || '',
        postalOrZipCode: order.recipient.postalCode,
        townOrCity: order.recipient.city,
        stateOrCounty: order.recipient.state,
        countryCode: order.recipient.countryCode
      }
    },
    items: items.map((item) => ({
      merchantReference: item.sku,
      sku: item.supplierSku.replace(/^prodigi:/, ''),
      copies: item.quantity,
      sizing: 'fillPrintArea',
      assets: [
        {
          printArea: 'default',
          url: item.printAssetUrl
        }
      ]
    }))
  };

  const res = await fetch('https://api.prodigi.com/v4.0/Orders', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Prodigi API error HTTP ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as { order?: { id?: string } };
  return {
    lab: 'prodigi',
    providerName: 'Prodigi Fine-Art Lab',
    status: 'dispatched',
    externalOrderId: externalId,
    labOrderId: data.order?.id || externalId
  };
}

/**
 * Lab 2: Printify API v1 Dispatch
 * Target: Framed exhibition posters, studio desk mats, and apparel
 */
async function dispatchPrintifyOrder(
  externalId: string,
  order: FulfillmentOrder,
  items: OrderItem[],
  env: FulfillmentEnv
): Promise<DispatchedParcelResult> {
  const token = env.PRINTIFY_API_TOKEN;
  const shopId = env.PRINTIFY_SHOP_ID;

  if (!token || !shopId || env.ALLOW_MOCK_DISPATCH === '1') {
    return {
      lab: 'printify',
      providerName: 'Printify Workshop',
      status: 'mocked',
      externalOrderId: externalId,
      labOrderId: `printify_mock_${Date.now()}`
    };
  }

  const names = order.recipient.name.split(' ');
  const firstName = names[0] || 'Art';
  const lastName = names.slice(1).join(' ') || 'Patron';

  const payload = {
    external_id: externalId,
    line_items: items.map((item) => ({
      product_id: item.supplierProductId || item.supplierSku.replace(/^printify:/, ''),
      variant_id: Number(item.supplierVariantId || 1),
      quantity: item.quantity
    })),
    shipping_method: 1,
    send_shipping_notification: false,
    address_to: {
      first_name: firstName,
      last_name: lastName,
      email: order.recipient.email,
      phone: order.recipient.phone || '',
      country: order.recipient.countryCode,
      region: order.recipient.state,
      address1: order.recipient.address1,
      address2: order.recipient.address2 || '',
      city: order.recipient.city,
      zip: order.recipient.postalCode
    }
  };

  const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/orders.json`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Printify API error HTTP ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as { id?: string | number };
  return {
    lab: 'printify',
    providerName: 'Printify Workshop',
    status: 'dispatched',
    externalOrderId: externalId,
    labOrderId: String(data.id || externalId)
  };
}

/**
 * Lab 3: Printful API v2 Dispatch
 * Target: Canvas wraps, archival fine art prints
 */
async function dispatchPrintfulOrder(
  externalId: string,
  order: FulfillmentOrder,
  items: OrderItem[],
  env: FulfillmentEnv
): Promise<DispatchedParcelResult> {
  const token = env.PRINTFUL_API_TOKEN;

  if (!token || env.ALLOW_MOCK_DISPATCH === '1') {
    return {
      lab: 'printful',
      providerName: 'Printful Fulfillment Center',
      status: 'mocked',
      externalOrderId: externalId,
      labOrderId: `printful_mock_${Date.now()}`
    };
  }

  const payload = {
    external_id: externalId,
    recipient: {
      name: order.recipient.name,
      email: order.recipient.email,
      phone: order.recipient.phone || '',
      address1: order.recipient.address1,
      address2: order.recipient.address2 || '',
      city: order.recipient.city,
      state_code: order.recipient.state,
      country_code: order.recipient.countryCode,
      zip: order.recipient.postalCode
    },
    items: items.map((item) => ({
      sync_variant_id: item.supplierVariantId || item.supplierSku.replace(/^printful:/, ''),
      quantity: item.quantity,
      retail_price: (item.unitPriceCents / 100).toFixed(2)
    })),
    retail_costs: { currency: order.currency || 'USD' }
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  if (env.PRINTFUL_STORE_ID) {
    headers['X-PF-Store-Id'] = env.PRINTFUL_STORE_ID;
  }

  const res = await fetch('https://api.printful.com/orders?confirm=true', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Printful API error HTTP ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as { result?: { id?: number | string } };
  return {
    lab: 'printful',
    providerName: 'Printful Fulfillment Center',
    status: 'dispatched',
    externalOrderId: externalId,
    labOrderId: String(data.result?.id || externalId)
  };
}

/**
 * Lab 4: Gelato API v2 Dispatch
 * Target: Global localized print distribution across 32 countries
 */
async function dispatchGelatoOrder(
  externalId: string,
  order: FulfillmentOrder,
  items: OrderItem[],
  env: FulfillmentEnv
): Promise<DispatchedParcelResult> {
  const apiKey = env.GELATO_API_KEY;

  if (!apiKey || env.ALLOW_MOCK_DISPATCH === '1') {
    return {
      lab: 'gelato',
      providerName: 'Gelato Global Print Facility',
      status: 'mocked',
      externalOrderId: externalId,
      labOrderId: `gelato_mock_${Date.now()}`
    };
  }

  const names = order.recipient.name.split(' ');
  const firstName = names[0] || 'Collector';
  const lastName = names.slice(1).join(' ') || 'Patron';

  const payload = {
    orderReferenceId: externalId,
    customerReferenceId: order.orderNumber,
    currency: order.currency || 'USD',
    orderType: 'order',
    shippingAddress: {
      firstName,
      lastName,
      addressLine1: order.recipient.address1,
      addressLine2: order.recipient.address2 || '',
      city: order.recipient.city,
      postCode: order.recipient.postalCode,
      state: order.recipient.state,
      country: order.recipient.countryCode,
      email: order.recipient.email,
      phone: order.recipient.phone || ''
    },
    items: items.map((item) => ({
      itemReferenceId: item.sku,
      productUid: item.supplierSku.replace(/^gelato:/, ''),
      quantity: item.quantity,
      files: [
        {
          type: 'default',
          url: item.printAssetUrl
        }
      ]
    }))
  };

  const res = await fetch('https://order.gelatoapis.com/v2/orders', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gelato API error HTTP ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as { id?: string };
  return {
    lab: 'gelato',
    providerName: 'Gelato Global Print Facility',
    status: 'dispatched',
    externalOrderId: externalId,
    labOrderId: data.id || externalId
  };
}

/**
 * Lab 5: Gooten API Dispatch
 * Target: Specialized acrylic blocks, art cards, and home decor
 */
async function dispatchGootenOrder(
  externalId: string,
  order: FulfillmentOrder,
  items: OrderItem[],
  env: FulfillmentEnv
): Promise<DispatchedParcelResult> {
  const recipeId = env.GOOTEN_RECIPE_ID;

  if (!recipeId || env.ALLOW_MOCK_DISPATCH === '1') {
    return {
      lab: 'gooten',
      providerName: 'Gooten Decor Facility',
      status: 'mocked',
      externalOrderId: externalId,
      labOrderId: `gooten_mock_${Date.now()}`
    };
  }

  const names = order.recipient.name.split(' ');
  const firstName = names[0] || 'Collector';
  const lastName = names.slice(1).join(' ') || 'Patron';

  const payload = {
    ShipToAddress: {
      FirstName: firstName,
      LastName: lastName,
      Line1: order.recipient.address1,
      Line2: order.recipient.address2 || '',
      City: order.recipient.city,
      State: order.recipient.state,
      PostalCode: order.recipient.postalCode,
      CountryCode: order.recipient.countryCode,
      Email: order.recipient.email,
      Phone: order.recipient.phone || ''
    },
    Items: items.map((item) => ({
      SKU: item.supplierSku.replace(/^gooten:/, ''),
      Quantity: item.quantity,
      Images: [{ Url: item.printAssetUrl }]
    })),
    Payment: { CurrencyCode: order.currency || 'USD' },
    IsPreSubmit: false
  };

  const res = await fetch(`https://api.gooten.com/v1/orders/?recipeid=${recipeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gooten API error HTTP ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as { Id?: string | number };
  return {
    lab: 'gooten',
    providerName: 'Gooten Decor Facility',
    status: 'dispatched',
    externalOrderId: externalId,
    labOrderId: String(data.Id || externalId)
  };
}

/**
 * Main Order Router: routeOrder(order, env)
 *
 * Directs line items to their respective lab adapters, executes discrete dispatches,
 * and compiles the holistic multi-parcel fulfillment report.
 */
export async function routeOrder(
  order: FulfillmentOrder,
  env: FulfillmentEnv
): Promise<OrderRoutingResult> {
  // Group items by lab
  const labGroups = new Map<PodLab, OrderItem[]>();
  for (const item of order.items) {
    const existing = labGroups.get(item.lab) || [];
    existing.push(item);
    labGroups.set(item.lab, existing);
  }

  const parcelResults: DispatchedParcelResult[] = [];
  const errors: string[] = [];

  for (const [lab, items] of labGroups.entries()) {
    try {
      const externalId = await generateExternalOrderId(order.sessionId, lab);
      let result: DispatchedParcelResult;

      switch (lab) {
        case 'prodigi':
          result = await dispatchProdigiOrder(externalId, order, items, env);
          break;
        case 'printify':
          result = await dispatchPrintifyOrder(externalId, order, items, env);
          break;
        case 'printful':
          result = await dispatchPrintfulOrder(externalId, order, items, env);
          break;
        case 'gelato':
          result = await dispatchGelatoOrder(externalId, order, items, env);
          break;
        case 'gooten':
          result = await dispatchGootenOrder(externalId, order, items, env);
          break;
        default:
          throw new Error(`Unsupported lab provider: ${lab}`);
      }

      parcelResults.push(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Lab [${lab}] dispatch failed: ${message}`);
      parcelResults.push({
        lab,
        providerName: lab,
        status: 'failed',
        externalOrderId: `failed_${lab}_${order.sessionId}`,
        error: message
      });
    }
  }

  const allSuccess = parcelResults.length > 0 && parcelResults.every((p) => p.status !== 'failed');

  return {
    success: allSuccess,
    orderNumber: order.orderNumber,
    totalParcels: parcelResults.length,
    parcels: parcelResults,
    errors
  };
}
