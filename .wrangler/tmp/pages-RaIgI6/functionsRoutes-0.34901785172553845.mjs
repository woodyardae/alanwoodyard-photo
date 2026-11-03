import { onRequestGet as __api_checkout_status_ts_onRequestGet } from "C:\\dev\\repos\\alanwoodyard-photo\\functions\\api\\checkout-status.ts"
import { onRequestPost as __api_create_checkout_session_ts_onRequestPost } from "C:\\dev\\repos\\alanwoodyard-photo\\functions\\api\\create-checkout-session.ts"
import { onRequestPost as __api_stripe_webhook_ts_onRequestPost } from "C:\\dev\\repos\\alanwoodyard-photo\\functions\\api\\stripe-webhook.ts"
import { onRequestOptions as __api_subscribe_ts_onRequestOptions } from "C:\\dev\\repos\\alanwoodyard-photo\\functions\\api\\subscribe.ts"
import { onRequestPost as __api_subscribe_ts_onRequestPost } from "C:\\dev\\repos\\alanwoodyard-photo\\functions\\api\\subscribe.ts"

export const routes = [
    {
      routePath: "/api/checkout-status",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_checkout_status_ts_onRequestGet],
    },
  {
      routePath: "/api/create-checkout-session",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_create_checkout_session_ts_onRequestPost],
    },
  {
      routePath: "/api/stripe-webhook",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_stripe_webhook_ts_onRequestPost],
    },
  {
      routePath: "/api/subscribe",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_subscribe_ts_onRequestOptions],
    },
  {
      routePath: "/api/subscribe",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_subscribe_ts_onRequestPost],
    },
  ]