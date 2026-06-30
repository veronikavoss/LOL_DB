import { onRequest as __api_riot___path___js_onRequest } from "D:\\Coding\\Gemini\\LOL\\functions\\api\\riot\\[[path]].js"

export const routes = [
    {
      routePath: "/api/riot/:path*",
      mountPath: "/api/riot",
      method: "",
      middlewares: [],
      modules: [__api_riot___path___js_onRequest],
    },
  ]